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

    if ((ctx.configuration?.parameters?.deleteOn || "on-merge") === "on-merge" && !pr.merged) {
        return;
    }

    const credential = await ctx.credential.resolve(gitHubAppToken({ owner, repo: name, apiUrl: org.provider.apiUrl }));
    if (!!credential) {
        const api = gitHub(credential.token, org.provider.apiUrl);
        try {
            await api.git.deleteRef({
                owner: pr.repo.owner,
                repo: pr.repo.name,
                ref: `heads/${pr.branchName}`,
            });
        } catch (e) {
            console.warn(`Failed to delete branch: ${e.message}`);
        }
    }
};
