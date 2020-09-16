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
import { ListStaleBranchesOnDeletedBranchSubscription } from "../typings/types";

export const handler: EventHandler<
	ListStaleBranchesOnDeletedBranchSubscription,
	DeleteBranchConfiguration
> = async ctx => {
	const cfg = ctx.configuration?.[0];
	const db = ctx.data.DeletedBranch[0];

	const repositoryStates = await state.hydrate<{
		repositories: Record<string, RepositoryBranchState>;
	}>(cfg.name, ctx, { repositories: {} });

	const repositoryState = repositoryStates.repositories[
		`${db.repo.owner}/${db.repo.name}`
	] || {
		staleBranches: [],
		id: 0,
	};
	const msgId = `${ctx.skill.namespace}/${ctx.skill.name}/${db.repo.owner}/${db.repo.name}/${cfg.name}/${repositoryState.id}`;
	await listStaleBranchesOnRepo(
		cfg,
		ctx,
		{
			owner: db.repo.owner,
			name: db.repo.name,
			apiUrl: db.repo.org.provider.apiUrl,
			defaultBranch: db.repo.defaultBranch,
			channels: db.repo.channels?.map(c => c.name) || [],
		},
		msgId,
		repositoryState,
	);

	return status.success(
		`Processed stale branches on ${db.repo.owner}/${db.repo.name}`,
	);
};
