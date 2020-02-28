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
import { gitHubAppToken } from "@atomist/skill/lib/secrets";
import * as Octokit from "@octokit/rest";
import { DeleteBranchConfiguration } from "./DeleteBranchOnPullRequest";
import {
    apiUrl,
    gitHub,
} from "./github";
import {
    ConvergePullRequestBranchDeletionLabelSubscription,
    PullRequestAction,
} from "./types";

export const handler: EventHandler<ConvergePullRequestBranchDeletionLabelSubscription, DeleteBranchConfiguration> = async ctx => {
    const pr = ctx.data.PullRequest[0];

    if (pr.action !== PullRequestAction.Opened) {
        await ctx.audit.log(`Pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} not opened. Ignoring...`);

        return {
            code: 0,
            reason: `Pull request [${pr.repo.owner}/${pr.repo.name}#${pr.number}](${pr.url}) not opened. Ignoring...`,
        };
    }

    const repo = pr.repo;
    const { owner, name } = repo;
    const credentials = await ctx.credential.resolve(gitHubAppToken({ owner, repo: name }));

    await ctx.audit.log(`Converging auto-branch deletion label`);

    const api = gitHub(credentials.token, apiUrl(repo));

    await addLabel("auto-branch-delete:on-close", "0F2630", owner, name, api);
    await addLabel("auto-branch-delete:on-merge", "0F2630", owner, name, api);

    const labels = [];
    if (!pr.labels.some(l => l.name.startsWith("auto-branch-delete:"))) {
        labels.push(`auto-branch-delete:${ctx.configuration?.parameters?.deleteOn || "on-merge"}`);
    }

    await ctx.audit.log(`Labelling pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} with configured auto-branch deletion method`);

    // Add the default labels to the PR
    await api.issues.addLabels({
        issue_number: pr.number,
        owner: repo.owner,
        repo: repo.name,
        labels,
    });

    await ctx.audit.log(`Pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} labelled with: ${labels.join(", ")}`);

    return {
        code: 0,
        reason: `Pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} labelled with auto-branch deletion label`,
    };
};

async function addLabel(name: string,
                        color: string,
                        owner: string,
                        repo: string,
                        api: Octokit): Promise<void> {
    try {
        await api.issues.getLabel({
            name,
            repo,
            owner,
        });
    } catch (err) {
        await api.issues.createLabel({
            owner,
            repo,
            name,
            color,
        });
    }
}
