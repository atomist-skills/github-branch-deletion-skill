/*
 * Copyright © 2021 Atomist, Inc.
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
	EventHandler,
	github,
	log,
	repository,
	secret,
	status,
} from "@atomist/skill";

import { DeleteBranchConfiguration } from "../configuration";
import { DeleteBranchOnPullRequestSubscription } from "../typings/types";

export const handler: EventHandler<
	DeleteBranchOnPullRequestSubscription,
	DeleteBranchConfiguration
> = async ctx => {
	const pr = ctx.data.PullRequest[0];
	const { owner, name, org } = pr.repo;
	const slug = `${owner}/${name}#${pr.number}`;
	const link = `[${slug}](${pr.url})`;

	log.info(
		`Starting auto-branch deletion for pull request ${slug} with labels: ${pr.labels
			.map(l => l.name)
			.join(", ")}`,
	);

	let deletePr = false;
	if (
		!!pr.merged &&
		pr.labels.some(l => l.name === "auto-branch-delete:on-merge")
	) {
		log.info(`Pull request ${slug} merged. Deleting branch...`);
		deletePr = true;
	} else if (pr.labels.some(l => l.name === "auto-branch-delete:on-close")) {
		log.info(`Pull request ${slug} closed. Deleting branch...`);
		deletePr = true;
	}

	if (deletePr) {
		const credential = await ctx.credential.resolve(
			secret.gitHubAppToken({
				owner,
				repo: name,
				apiUrl: org.provider.apiUrl,
			}),
		);
		if (credential) {
			const api = github.api(
				repository.gitHub({ owner, repo: name, credential }),
			);
			try {
				await api.git.deleteRef({
					owner: pr.repo.owner,
					repo: pr.repo.name,
					ref: `heads/${pr.branchName}`,
				});
				log.info(
					`Pull request ${slug} branch ${pr.branchName} deleted`,
				);
				return status.success(
					`Pull request ${link} branch ${pr.branchName} deleted`,
				);
			} catch (e) {
				log.warn(`Failed to delete branch: ${e.message}`);
				log.warn(
					`Pull request ${link} branch ${pr.branchName} failed to delete`,
				);
				return status.success(
					`Pull request ${link} branch ${pr.branchName} failed to delete`,
				);
			}
		}
	}

	log.info(`Pull request ${link} branch deletion not requested`);
	return status
		.success(`Pull request ${link} branch deletion not requested`)
		.hidden();
};
