import { Severity } from "@atomist/skill-logging";
import { EventHandler } from "@atomist/skill/lib/handler";
import { gitHubAppToken } from "@atomist/skill/lib/secrets";
import { gitHub } from "./github";
import { DeleteBranchOnPullRequestSubscription } from "./types";

export interface DeleteBranchConfiguration {
    deleteOn?: "on-close" | "on-merge";
}

export const handler: EventHandler<DeleteBranchOnPullRequestSubscription, DeleteBranchConfiguration> = async ctx => {
    const pr = ctx.data.PullRequest[0];
    const { owner, name, org } = pr.repo;
    const slug = `${owner}/${name}#${pr.number}`;
    const link = `[${slug}](${pr.url})`;

    await ctx.audit.log(`Starting auto-branch deletion for pull request ${slug} with labels: ${pr.labels.map(l => l.name).join(", ")}`);

    let deletePr = false;
    if (!!pr.merged && pr.labels.some(l => l.name === "auto-branch-delete:on-merge")) {
        await ctx.audit.log(`Pull request ${slug} merged. Deleting branch...`);
        deletePr = true;
    } else if (pr.labels.some(l => l.name === "auto-branch-delete:on-close")) {
        await ctx.audit.log(`Pull request ${slug} closed. Deleting branch...`);
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
                await ctx.audit.log(`Pull request ${slug} branch ${pr.branchName} deleted`);
                return {
                    code: 0,
                    reason: `Pull request ${link} branch ${pr.branchName} deleted`,
                };
            } catch (e) {
                console.warn(`Failed to delete branch: ${e.message}`);
                await ctx.audit.log(`Pull request ${link} branch ${pr.branchName} failed to delete`, Severity.ERROR);
                return {
                    code: 1,
                    reason: `Pull request ${link} branch ${pr.branchName} failed to delete`,
                };
            }
        }
    }

    await ctx.audit.log(`Pull request ${link} branch deletion not requested`);
    return {
        code: 0,
        reason: `Pull request ${link} branch deletion not requested`,
    };
};
