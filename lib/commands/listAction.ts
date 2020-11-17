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
	CommandHandler,
	repository,
	slack,
	prompt,
	status,
	state,
	guid,
} from "@atomist/skill";
import { DeleteBranchConfiguration } from "../configuration";
import {
	listStaleBranchesOnRepo,
	RepositoryBranchState,
} from "../listStaleBranches";
import {
	RepositoriesQuery,
	RepositoriesQueryVariables,
} from "../typings/types";

export const handler: CommandHandler<DeleteBranchConfiguration> = async ctx => {
	const parameters = await prompt.configurationWithParameters<
		{
			repo?: string;
			repos?: string;
		},
		DeleteBranchConfiguration
	>(ctx, {
		repos: { required: false },
		repo: { required: false },
	});
	const cfg = parameters.configuration;

	const requestedRepositories: Array<
		repository.RepositoryId & { repoId: string; ownerId: string }
	> = [];
	if (!parameters.repos && !parameters.repo) {
		requestedRepositories.push(
			...(await repository.linkedRepositories(ctx)),
		);
		if (requestedRepositories.length === 0) {
			await ctx.message.respond(
				slack.infoMessage(
					"List Stale Branches",
					"No repository provided.\n\nEither run this command from a linked channel, provide a regular expression to match repository slugs (eg. `--repos='example-org\\/.*'`) or provide a repository slug with the `--repo` parameter.",
					ctx,
				),
			);
			return status.success("No repository provided").hidden();
		}
	} else {
		// Get all repos in this workspace
		const repositories = await ctx.graphql.query<
			RepositoriesQuery,
			RepositoriesQueryVariables
		>("repositories.graphql");
		requestedRepositories.push(
			...repositories?.Repo.filter(r => {
				const slug = `${r.owner}/${r.name}`;
				if (parameters.repo) {
					return parameters.repo === slug;
				} else {
					const exp = new RegExp(parameters.repos);
					return exp.test(slug);
				}
			}).map(r => ({
				owner: r.owner,
				repo: r.name,
				apiUrl: r.org?.provider?.apiUrl,
				branch: r.defaultBranch,
				type: repository.RepositoryProviderType.GitHubCom,
				repoId: r.id,
				ownerId: r.org?.id,
			})),
		);
	}

	const filteredRepositories = requestedRepositories.filter(r =>
		repository.matchesFilter(r.repoId, r.ownerId, cfg.name, "repos", ctx),
	);

	if (filteredRepositories.length === 0) {
		await ctx.message.respond(
			slack.infoMessage(
				"List Stale Branches",
				"No repository selected after applying repository filter",
				ctx,
			),
		);
		return status
			.success("No repository selected after applying repository filter")
			.hidden();
	}

	const repositoryState = await state.hydrate<{
		repositories: Record<string, RepositoryBranchState>;
	}>(cfg.name, ctx, { repositories: {} });

	for (const repository of filteredRepositories) {
		await listStaleBranchesOnRepo(
			cfg,
			ctx,
			{
				owner: repository.owner,
				name: repository.repo,
				apiUrl: repository.apiUrl,
				defaultBranch: repository.branch,
				channels: [],
			},
			guid(),
			repositoryState.repositories[
				`${repository.owner}/${repository.repo}`
			] || {
				staleBranches: [],
				pullRequests: {},
				id: 0,
			},
		);
	}

	return status.success(
		`Processed stale branches on ${filteredRepositories.length} ${
			filteredRepositories.length === 1 ? "repository" : "repositories"
		}`,
	);
};
