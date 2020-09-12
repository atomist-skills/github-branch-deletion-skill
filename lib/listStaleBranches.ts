/*
 * Copyright © 2020 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
	Contextual,
	EventContext,
	github,
	HandlerStatus,
	repository,
	secret,
	slack,
	state,
	status,
} from "@atomist/skill";
import * as _ from "lodash";
import { DeleteBranchConfiguration } from "./configuration";
import {
	CommitQuery,
	CommitQueryVariables,
	ListStaleBranchesOnScheduleSubscription,
	PullRequestQuery,
	PullRequestQueryVariables,
	RepositoriesQuery,
	RepositoriesQueryVariables,
} from "./typings/types";
import { formatDuration, truncateCommitMessage } from "./util";

export interface RepositoryBranchState {
	staleBranches: string[];
	id: number;
}

export async function listStateBranches(
	cfg: { name: string; parameters: DeleteBranchConfiguration },
	ctx: EventContext<
		ListStaleBranchesOnScheduleSubscription,
		DeleteBranchConfiguration
	>,
): Promise<HandlerStatus> {
	if (!cfg.parameters.staleList) {
		return status.success(`Stale branch processing not enabled`).hidden();
	}

	// Get all repos in this workspace
	const repos = await ctx.graphql.query<
		RepositoriesQuery,
		RepositoriesQueryVariables
	>("repositories.graphql");
	const filteredRepos = repos.Repo.filter(r =>
		repository.matchesFilter(
			r.id,
			r.org.id,
			ctx.configuration?.[0]?.name,
			"repos",
			ctx,
		),
	);

	const repositoryState = await state.hydrate<{
		repositories: Record<string, RepositoryBranchState>;
	}>(cfg.name, ctx, { repositories: {} });

	if (!repositoryState.repositories) {
		repositoryState.repositories = {};
	}

	for (const repo of filteredRepos) {
		const slug = `${repo.owner}/${repo.name}`;
		repositoryState.repositories[slug] = await listStaleBranchesOnRepo(
			cfg,
			ctx,
			{
				owner: repo.owner,
				name: repo.name,
				defaultBranch: repo.defaultBranch,
				channels: repo.channels.map(c => c.name),
				apiUrl: repo.org.provider.apiUrl,
			},
			undefined,
			repositoryState?.repositories?.[slug] || {
				staleBranches: [],
				id: 0,
			},
		);
	}

	await state.save({ repositories: repositoryState }, cfg.name, ctx);
	return status.success(`Processed stale branches`);
}

export async function listStaleBranchesOnRepo(
	cfg: { parameters: DeleteBranchConfiguration; name: string },
	ctx: Contextual<any, DeleteBranchConfiguration>,
	repo: {
		owner: string;
		name: string;
		apiUrl: string;
		defaultBranch: string;
		channels: string[];
	},
	msgId: string,
	repositoryState: RepositoryBranchState,
	page = 0,
): Promise<RepositoryBranchState> {
	const threshold = cfg.parameters.staleThreshold || 7;
	const branchFilters = cfg.parameters.staleExcludes || [];
	const thresholdDate = Date.now() - 1000 * 60 * 60 * 24 * threshold;
	const credential = await ctx.credential.resolve(
		secret.gitHubAppToken({
			owner: repo.owner,
			repo: repo.name,
			apiUrl: repo.apiUrl,
		}),
	);
	const api = github.api(
		repository.gitHub({ owner: repo.owner, repo: repo.name, credential }),
	);
	const branches = (
		await api.repos.listBranches({
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
		})
	).data
		.filter(b => !b.protected)
		.filter(b => b.name !== repo.defaultBranch && b.name !== "gh-pages")
		.filter(b => !excludeBranch(repo, b.name, branchFilters));

	const staleBranches: Array<{
		branch: string;
		pullRequest?: PullRequestQuery["PullRequest"][0];
		commit: CommitQuery["Commit"][0];
		newStale: boolean;
	}> = [];

	for (const branch of branches) {
		const commit = await ctx.graphql.query<
			CommitQuery,
			CommitQueryVariables
		>("commit.graphql", { sha: branch.commit.sha });
		if (commit.Commit?.[0]?.timestamp) {
			const commitDate = Date.parse(commit.Commit[0].timestamp);
			if (commitDate < thresholdDate) {
				const newStale =
					thresholdDate - commitDate < 1000 * 60 * 60 * 24;
				const pr = await ctx.graphql.query<
					PullRequestQuery,
					PullRequestQueryVariables
				>("pullRequest.graphql", {
					branch: branch.name,
					owner: repo.owner,
					repo: repo.name,
				});
				if (pr.PullRequest?.[0]) {
					staleBranches.push({
						branch: branch.name,
						pullRequest: pr.PullRequest[0],
						commit: commit.Commit[0],
						newStale,
					});
				} else {
					staleBranches.push({
						branch: branch.name,
						commit: commit.Commit[0],
						newStale,
					});
				}
			}
		} else {
			const branchData = (
				await api.repos.getBranch({
					owner: repo.owner,
					repo: repo.name,
					branch: branch.name,
				})
			).data;
			const commitDate = Date.parse(
				branchData.commit.commit.author?.date ||
					branchData.commit.commit.committer?.date,
			);
			if (commitDate < thresholdDate) {
				staleBranches.push({
					branch: branch.name,
					newStale: thresholdDate - commitDate < 1000 * 60 * 60 * 24,
					commit: {
						message: branchData.commit.commit.message,
						sha: branchData.commit.sha,
						url: (branchData.commit as any).html_url,
						author: {
							avatar:
								branchData.commit.author?.avatar_url ||
								branchData.commit.committer?.avatar_url,
							login:
								branchData.commit.author?.login ||
								branchData.commit.committer?.login,
						},
						timestamp:
							branchData.commit.commit.author?.date ||
							branchData.commit.commit.committer?.date,
					},
				});
			}
		}
	}

	if (!msgId) {
		const newBranches = staleBranches.map(b => b.branch).sort();
		if (_.isEqual(newBranches, repositoryState.staleBranches)) {
			return repositoryState;
		}
		repositoryState.staleBranches = newBranches;
	}

	const branchPages = _.chunk(_.orderBy(staleBranches, ["name"]), 2);

	if (staleBranches.length > 0) {
		let id;
		if (!msgId) {
			const prefix = `${ctx.skill.namespace}/${ctx.skill.name}/${repo.owner}/${repo.name}/${cfg.name}`;
			await ctx.message.delete(
				{ channels: repo.channels },
				{ id: `${prefix}/${repositoryState.id}` },
			);
			repositoryState.id = repositoryState.id + 1;
			id = `${prefix}/${repositoryState.id}`;
		} else {
			id = msgId;
		}

		const msg: slack.SlackMessage = {
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*Stale Branches* for ${slack.codeLine(
							`${repo.owner}/${repo.name}`,
						)}
No commits on the following${
							staleBranches.length > 1
								? " " + staleBranches.length
								: ""
						} ${
							staleBranches.length === 1 ? "branch" : "branches"
						} in last${threshold > 1 ? " " + threshold : ""} ${
							threshold === 1 ? "day" : "days"
						}:`,
					},
				} as slack.SectionBlock,
				{ type: "divider" } as slack.DividerBlock,
			],
		};

		if (page > branchPages.length - 1) {
			page = 0;
		}

		branchPages[page].forEach(pr => {
			const text = `${slack.url(
				pr.commit.url,
				slack.codeLine(pr.commit.sha.slice(0, 7)),
			)} ${truncateCommitMessage(pr.commit.message)}`;
			let pullRequest;
			const duration = `${slack.separator()} ${formatDuration(
				Date.now() - Date.parse(pr.commit.timestamp),
				"y [years], w [weeks], d [days], h [hours], m [minutes]",
			)} ago`;
			if (pr.pullRequest) {
				pullRequest = `${slack.url(
					pr.pullRequest.url,
					slack.bold(
						`#${pr.pullRequest.number}: ${pr.pullRequest.title}`,
					),
				)} ${duration}`;
			} else {
				pullRequest = `no pull request ${duration}`;
			}
			const iconUrl = pr.pullRequest
				? pr.pullRequest.merged
					? "https://images.atomist.com/rug/pull-request-merged.png"
					: pr.pullRequest.state === "open"
					? "https://images.atomist.com/rug/pull-request-open.png"
					: "https://images.atomist.com/rug/pull-request-closed.png"
				: "https://images.atomist.com/rug/branch-open.png";
			const options = [];
			options.push({
				text: {
					type: "plain_text",
					text: "Delete",
				},
				value: "delete",
			});
			options.push({
				text: {
					type: "plain_text",
					text: "Ignore",
				},
				value: "ignore",
			});
			if (!pr.pullRequest) {
				options.push({
					text: {
						type: "plain_text",
						text: "Raise PR",
					},
					value: "raise_pr",
				});
			}

			msg.blocks.push(
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `${slack.bold(pr.branch)}${
							pr.newStale
								? ` ${slack.separator()} ${slack.italic(
										"became stale",
								  )}`
								: ""
						}
${text}`,
					},
					accessory: slack.block.elementForCommand<
						slack.StaticOptionElement
					>(
						{
							type: "overflow",
							options,
						} as slack.OverflowElement,
						"branchAction",
						{
							name: repo.name,
							owner: repo.owner,
							branch: pr.branch,
							cfg: cfg.name,
							apiUrl: repo.apiUrl,
							defaultBranch: repo.defaultBranch,
							title: pr.commit?.message,
							channels: JSON.stringify(repo.channels),
							msgId: id,
						},
						"action",
					),
				} as slack.SectionBlock,
				{
					type: "context",
					elements: [
						{
							type: "image",
							image_url: iconUrl,
							alt_text: "PR",
						},
						...(pullRequest
							? [
									{
										type: "mrkdwn",
										text: pullRequest,
									},
							  ]
							: []),
					],
				} as slack.ContextBlock,
			);
		});

		msg.blocks.push(
			{ type: "divider" } as slack.DividerBlock,
			{
				type: "context",
				elements: [
					{
						type: "image",
						image_url:
							"https://images.atomist.com/logo/atomist-black-mark-xsmall.png",
						alt_text: "Atomist icon",
					},
					{
						type: "mrkdwn",
						text: `${ctx.skill.namespace}/${
							ctx.skill.name
						} \u00B7 ${slack.url(
							`https://go.atomist.com/${
								ctx.workspaceId
							}/manage/skills/configure/${
								ctx.skill.id
							}/${encodeURIComponent(cfg.name)}`,
							"Configure",
						)}`,
					},
				],
			} as slack.ContextBlock,
		);

		if (branchPages.length > 1) {
			const paging = [];
			if (page > 0) {
				paging.push(
					slack.block.elementForCommand<slack.ButtonElement>(
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "<",
							},
						} as slack.ButtonElement,
						"pagingAction",
						{
							name: repo.name,
							owner: repo.owner,
							cfg: cfg.name,
							apiUrl: repo.apiUrl,
							defaultBranch: repo.defaultBranch,
							channels: JSON.stringify(repo.channels),
							msgId: id,
							page: (page - 1).toString(),
						},
					),
				);
			}
			if (page < branchPages.length - 1) {
				paging.push(
					slack.block.elementForCommand<slack.ButtonElement>(
						{
							type: "button",
							text: {
								type: "plain_text",
								text: ">",
							},
						} as slack.ButtonElement,
						"pagingAction",
						{
							name: repo.name,
							owner: repo.owner,
							cfg: cfg.name,
							apiUrl: repo.apiUrl,
							defaultBranch: repo.defaultBranch,
							channels: JSON.stringify(repo.channels),
							msgId: id,
							page: (page + 1).toString(),
						},
					),
				);
			}
			msg.blocks.push({
				type: "actions",
				elements: paging,
			} as slack.ActionsBlock);
		}

		await ctx.message.send(
			msg,
			{
				channels: repo.channels,
			},
			{ id },
		);
	} else if (msgId) {
		await ctx.message.delete({ channels: repo.channels }, { id: msgId });
	}

	return repositoryState;
}

function excludeBranch(
	repo: { owner: string; name: string },
	branch: string,
	pattern: string[],
): boolean {
	if (pattern.length === 0) {
		return false;
	} else {
		const name = `${repo.owner}/${repo.name}#${branch}`;
		for (const p of pattern) {
			if (new RegExp(p).test(name)) {
				return true;
			}
		}
	}
	return false;
}
