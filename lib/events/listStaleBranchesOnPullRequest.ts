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

import { EventHandler, state, status } from "@atomist/skill";
import { DeleteBranchConfiguration } from "../configuration";
import {
	listStaleBranchesOnRepo,
	RepositoryBranchState,
} from "../listStaleBranches";
import { ListStaleBranchesOnPullRequestSubscription } from "../typings/types";

export const handler: EventHandler<
	ListStaleBranchesOnPullRequestSubscription,
	DeleteBranchConfiguration
> = async ctx => {
	const cfg = ctx.configuration?.[0];
	const pr = ctx.data.PullRequest[0];

	const repositoryStates = await state.hydrate<{
		repositories: Record<string, RepositoryBranchState>;
	}>(cfg.name, ctx, { repositories: {} });

	const repositoryState = repositoryStates.repositories[
		`${pr.repo.owner}/${pr.repo.name}`
	] || {
		staleBranches: [],
		id: 0,
	};
	const msgId = `${ctx.skill.namespace}/${ctx.skill.name}/${pr.repo.owner}/${pr.repo.name}/${cfg.name}/${repositoryState.id}`;
	await listStaleBranchesOnRepo(
		cfg,
		ctx,
		{
			owner: pr.repo.owner,
			name: pr.repo.name,
			apiUrl: pr.repo.org.provider.apiUrl,
			defaultBranch: pr.repo.defaultBranch,
			channels: pr.repo.channels?.map(c => c.name) || [],
		},
		msgId,
		repositoryState,
	);

	return status.success(
		`Processed stale branches on ${pr.repo.owner}/${pr.repo.name}`,
	);
};
