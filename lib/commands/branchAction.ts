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
	CommandContext,
	CommandHandler,
	Configuration,
	github,
	repository,
	secret,
	slack,
	state,
	status,
} from "@atomist/skill";
import * as _ from "lodash";
import { DeleteBranchConfiguration } from "../configuration";
import {
	listStaleBranchesOnRepo,
	RepositoryBranchState,
} from "../listStaleBranches";
import {
	SaveSkillConfigurationMutation,
	SaveSkillConfigurationMutationVariables,
} from "../typings/types";

interface BranchAction {
	owner: string;
	name: string;
	branch: string;
	apiUrl: string;
	defaultBranch: string;
	msgId: string;
	cfg: string;
	channels: string;
	action: "ignore" | "delete" | "raise_pr";
}

export const handler: CommandHandler<DeleteBranchConfiguration> = async ctx => {
	const params = await ctx.parameters.prompt<BranchAction>({
		owner: {},
		name: {},
		branch: {},
		msgId: {},
		cfg: {},
		defaultBranch: {},
		apiUrl: {},
		channels: {},
		action: {},
	});
	const cfg = ctx.configuration.find(c => c.name === params.cfg);
	if (!cfg) {
		return {
			code: 1,
			reason: `Skill configuration not available`,
		};
	}

	let msg;
	switch (params.action) {
		case "ignore":
			await ignoreBranch(params, cfg, ctx);
			msg = `Added branch _${params.branch}_ to ignore list`;
			break;
		case "delete":
			await deleteBranch(params, cfg, ctx);
			msg = `Deleted branch _${params.branch}_`;
			break;
		case "raise_pr":
			await raisePr(params, cfg, ctx);
			msg = `Raised PR for branch _${params.branch}_`;
			break;
	}

	const repositoryState = await state.hydrate<{
		repositories: Record<string, RepositoryBranchState>;
	}>(cfg.name, ctx, { repositories: {} });

	await listStaleBranchesOnRepo(
		cfg,
		ctx,
		{ ...params, channels: JSON.parse(params.channels) },
		params.msgId,
		repositoryState.repositories[`${params.owner}/${params.name}`] || {
			staleBranches: [],
			pullRequests: {},
			id: 0,
		},
	);

	return status.success(msg);
};

async function ignoreBranch(
	params: BranchAction,
	cfg: Configuration<DeleteBranchConfiguration>,
	ctx: CommandContext,
): Promise<void> {
	const staleExcludes = _.uniq([
		...(cfg.parameters.staleExcludes || []),
		`${params.owner}\\/${params.name}#${params.branch}`,
	]);
	await ctx.graphql.mutate<
		SaveSkillConfigurationMutation,
		SaveSkillConfigurationMutationVariables
	>("saveSkillConfiguration.graphql", {
		name: ctx.skill.name,
		namespace: ctx.skill.namespace,
		version: ctx.skill.version,
		config: {
			enabled: true,
			name: cfg.name,
			parameters: [
				{
					singleChoice: {
						name: "deleteOn",
						value: cfg.parameters.deleteOn,
					},
				},
				{
					boolean: {
						name: "staleList",
						value: cfg.parameters.staleList,
					},
				},
				{
					int: {
						name: "staleThreshold",
						value: cfg.parameters.staleThreshold,
					},
				},
				{
					stringArray: {
						name: "staleExcludes",
						value: staleExcludes,
					},
				},
				{
					repoFilter: {
						name: "repos",
						value: (cfg.parameters as any).repos,
					},
				},
			],
			resourceProviders: _.map(cfg.resourceProviders, (v, k) => ({
				name: k,
				selectedResourceProviders: v.selectedResourceProviders,
			})),
		},
	});
	cfg.parameters.staleExcludes = staleExcludes;
}

async function deleteBranch(
	params: BranchAction,
	cfg: Configuration<DeleteBranchConfiguration>,
	ctx: CommandContext,
): Promise<void> {
	const credential = await ctx.credential.resolve(secret.gitHubUserToken());
	if (credential) {
		const api = github.api(
			repository.gitHub({
				owner: params.owner,
				repo: params.name,
				credential,
			}),
		);

		try {
			await api.git.deleteRef({
				owner: params.owner,
				repo: params.name,
				ref: `heads/${params.branch}`,
			});
		} catch (e) {
			// ignore
		}
	} else {
		await ctx.message.respond(
			slack.errorMessage(
				"GitHub Authorization",
				"No GitHub authorization found. Please run `@atomist authorize github`",
				ctx,
			),
		);
	}
}

async function raisePr(
	params: BranchAction,
	cfg: Configuration<DeleteBranchConfiguration>,
	ctx: CommandContext,
): Promise<void> {
	const prParams = await ctx.parameters.prompt<{ title: string }>({
		title: {},
	});

	const credential = await ctx.credential.resolve(secret.gitHubUserToken());
	if (credential) {
		const api = github.api(
			repository.gitHub({
				owner: params.owner,
				repo: params.name,
				credential,
			}),
		);

		try {
			await api.pulls.create({
				owner: params.owner,
				repo: params.name,
				head: params.branch,
				base: params.defaultBranch || "master",
				title: prParams.title,
			});
		} catch (e) {
			// ignore
		}
	} else {
		await ctx.message.respond(
			slack.errorMessage(
				"GitHub Authorization",
				"No GitHub authorization found. Please run `@atomist authorize github`",
				ctx,
			),
		);
	}
}
