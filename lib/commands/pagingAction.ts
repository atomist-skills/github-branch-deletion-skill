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

import { CommandHandler, state, status } from "@atomist/skill";

import { DeleteBranchConfiguration } from "../configuration";
import {
	listStaleBranchesOnRepo,
	RepositoryBranchState,
} from "../listStaleBranches";

interface PagingAction {
	owner: string;
	name: string;
	apiUrl: string;
	defaultBranch: string;
	msgId: string;
	cfg: string;
	channels: string;
	page: number;
}

export const handler: CommandHandler<DeleteBranchConfiguration> = async ctx => {
	const params = await ctx.parameters.prompt<PagingAction>({
		owner: {},
		name: {},
		msgId: {},
		cfg: {},
		defaultBranch: {},
		apiUrl: {},
		channels: {},
		page: {},
	});
	const cfg = ctx.configuration.find(c => c.name === params.cfg);
	if (!cfg) {
		return {
			code: 1,
			reason: `Skill configuration not available`,
		};
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
		+params.page,
	);

	return status.success(`Paged stale branch listing`);
};
