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

import { EventHandler } from "@atomist/skill/lib/handler";
import { gitHubComRepository } from "@atomist/skill/lib/project";
import { convergeLabel, gitHub } from "@atomist/skill/lib/project/github";
import { gitHubAppToken } from "@atomist/skill/lib/secrets";
import { DeleteBranchConfiguration } from "./deleteBranchOnPullRequest";
import { ConvergePullRequestBranchDeletionLabelSubscription, PullRequestAction } from "../typings/types";

export const handler: EventHandler<
    ConvergePullRequestBranchDeletionLabelSubscription,
    DeleteBranchConfiguration
> = async ctx => {
    const pr = ctx.data.PullRequest[0];

    if (pr.action !== PullRequestAction.Opened) {
        await ctx.audit.log(
            `Pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} action not opened. Ignoring...`,
        );

        return {
            visibility: "hidden",
            code: 0,
            reason: `Pull request [${pr.repo.owner}/${pr.repo.name}#${pr.number}](${pr.url}) action not opened. Ignoring...`,
        };
    }

    const repo = pr.repo;
    const { owner, name } = repo;
    const credential = await ctx.credential.resolve(gitHubAppToken({ owner, repo: name }));

    await ctx.audit.log(`Converging auto-branch deletion label`);

    const id = gitHubComRepository({ owner: repo.owner, repo: repo.name, credential });

    await convergeLabel(id, "auto-branch-delete:on-close", "0F2630", "Delete branch when pull request gets closed");
    await convergeLabel(id, "auto-branch-delete:on-merge", "0F2630", "Delete branch when pull request gets merged");

    const labels = [];
    if (!pr.labels.some(l => l.name.startsWith("auto-branch-delete:"))) {
        labels.push(`auto-branch-delete:${ctx.configuration[0]?.parameters?.deleteOn || "on-merge"}`);
    }

    await ctx.audit.log(
        `Labelling pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} with configured auto-branch deletion method`,
    );

    // Add the default labels to the PR
    await gitHub(id).issues.addLabels({
        issue_number: pr.number,
        owner: repo.owner,
        repo: repo.name,
        labels,
    });

    await ctx.audit.log(
        `Pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} labelled with: ${labels.join(", ")}`,
    );

    return {
        code: 0,
        reason: `Pull request [${pr.repo.owner}/${pr.repo.name}#${pr.number}](${pr.url}) labelled with auto-branch deletion label`,
    };
};
