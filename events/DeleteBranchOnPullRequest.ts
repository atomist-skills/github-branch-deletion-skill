import { EventHandler } from "@atomist/skill/lib/handler";
import {
    gitHubAppToken,
} from "@atomist/skill/lib/secrets";
import { gitHub } from "./github";
import { DeleteBranchOnPullRequestSubscription } from "./types";

export interface DeleteBranchConfiguration {
    deleteOn?: "on-close" | "on-merge";
}

export const handler: EventHandler<DeleteBranchOnPullRequestSubscription, DeleteBranchConfiguration> = async ctx => {
    const pr = ctx.data.PullRequest[0];
    const { owner, name, org } = pr.repo;

    let deletePr = false;
    if (!!pr.merged && pr.labels.some(l => l.name === "")) {
        deletePr = true;
    } else if (pr.labels.some(l => l.name === "")) {
        deletePr = true;
    }

    if (deletePr) {
        const credential = await ctx.credential.resolve(gitHubAppToken({ owner, repo: name, apiUrl: org.provider.apiUrl }));
        if (!!credential) {
            const api = gitHub(credential.token, org.provider.apiUrl);
            try {
                await api.git.deleteRef({
                    owner: pr.repo.owner,
                    repo: pr.repo.name,
                    ref: `heads/${pr.branchName}`,
                });
                return {
                    code: 0,
                    reason: `Pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} branch ${pr.branchName} deleted`,
                };
            } catch (e) {
                console.warn(`Failed to delete branch: ${e.message}`);
                return {
                    code: 0,
                    reason: `Pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} branch ${pr.branchName} failed to delete`,
                };
            }
        }
    }

    return {
        code: 0,
        reason: `Pull request ${pr.repo.owner}/${pr.repo.name}#${pr.number} branch deletion not requested`,
    };
};
