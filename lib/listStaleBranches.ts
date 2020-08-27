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
	guid,
	HandlerStatus,
	repository,
	secret,
	slack,
	status,
} from "@atomist/skill";
import { buttonForCommand, menuForCommand } from "@atomist/skill/lib/slack";
import { PromisePool } from "@supercharge/promise-pool/dist/promise-pool";
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
import { truncateCommitMessage } from "./util";

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

	await PromisePool.for(filteredRepos)
		.withConcurrency(5)
		.process(r =>
			listStaleBranchesOnRepo(cfg, ctx, {
				owner: r.owner,
				name: r.name,
				defaultBranch: r.defaultBranch,
				channels: r.channels.map(c => c.name),
				apiUrl: r.org.provider.apiUrl,
			}),
		);

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
	msgId: string = guid(),
): Promise<void> {
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
		await api.repos.listBranches({ owner: repo.owner, repo: repo.name })
	).data
		.filter(b => !b.protected)
		.filter(b => b.name !== repo.defaultBranch)
		.filter(b => !excludeBranch(repo, b.name, branchFilters));

	const staleBranches: Array<{
		branch: string;
		pullRequest?: PullRequestQuery["PullRequest"][0];
		commit: CommitQuery["Commit"][0];
	}> = [];

	for (const branch of branches) {
		const commit = await ctx.graphql.query<
			CommitQuery,
			CommitQueryVariables
		>("commit.graphql", { sha: branch.commit.sha });
		if (commit.Commit?.[0]?.timestamp) {
			const commitDate = Date.parse(commit.Commit[0].timestamp);
			if (commitDate < thresholdDate) {
				const pr = await ctx.graphql.query<
					PullRequestQuery,
					PullRequestQueryVariables
				>("pullRequest.graphql", { branch: branch.name });
				if (pr.PullRequest?.[0]) {
					staleBranches.push({
						branch: branch.name,
						pullRequest: pr.PullRequest[0],
						commit: commit.Commit[0],
					});
				} else {
					staleBranches.push({
						branch: branch.name,
						commit: commit.Commit[0],
					});
				}
			}
		}
	}

	if (staleBranches.length > 0) {
		const msg = slack.infoMessage(
			"Stale Branches",
			`No activity on the following ${staleBranches.length} ${
				staleBranches.length === 1 ? "branch" : "branches"
			} for the last ${threshold} days:`,
			ctx,
		);
		msg.attachments[0].footer = `${
			msg.attachments[0].footer
		} \u00B7 ${slack.url(
			`https://go.atomist.com/manage/${
				ctx.workspaceId
			}/skills/configure/${ctx.skill.id}/${encodeURIComponent(cfg.name)}`,
			"Configure",
		)}`;
		_.orderBy(staleBranches, ["branch"]).forEach(pr => {
			let text = `${slack.url(
				pr.commit.url,
				slack.codeLine(pr.commit.sha.slice(0, 7)),
			)} ${truncateCommitMessage(pr.commit.message)}`;
			if (!pr.pullRequest?.merged) {
				text = `${slack.url(
					pr.pullRequest.url,
					slack.bold(
						`#${pr.pullRequest.number}: ${pr.pullRequest.title}`,
					),
				)}\n${text}`;
			}
			msg.attachments.push({
				author_icon: `https://images.atomist.com/rug/pull-request-${
					pr.pullRequest
						? pr.pullRequest.merged
							? "merged"
							: "open"
						: "closed"
				}.png`,
				author_name: pr.branch,
				author_link: pr.commit.url,
				fallback: pr.branch,
				text,
				mrkdwn_in: ["text"],
			});
		});

		let action;
		if (staleBranches.length === 1) {
			action = buttonForCommand(
				{
					text: "Delete",
				},
				"deleteBranch",
				{
					name: repo.name,
					owner: repo.owner,
					branch: staleBranches[0].branch,
					cfg: cfg.name,
					apiUrl: repo.apiUrl,
					defaultBranch: repo.defaultBranch,
					channels: JSON.stringify(repo.channels),
					msgId,
				},
			);
		} else {
			action = menuForCommand(
				{
					text: "Delete",
					options: _.orderBy(staleBranches, "name").map(b => ({
						text: b.branch,
						value: b.branch,
					})),
				},
				"deleteBranch",
				"branch",
				{
					name: repo.name,
					owner: repo.owner,
					cfg: cfg.name,
					apiUrl: repo.apiUrl,
					defaultBranch: repo.defaultBranch,
					channels: JSON.stringify(repo.channels),
					msgId,
				},
			);
		}

		msg.attachments.slice(-1)[0].actions = [action];

		await ctx.message.send(
			msg,
			{
				channels: repo.channels,
			},
			{ id: msgId },
		);
	}
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