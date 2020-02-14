# `atomist/github-branch-deletion-skill`

Atomist Skill to automatically delete pull request branches when the PR gets closed.

## Usage

### Enable Branch Deletion

To enable auto-merging, one the following labels has to be assigned to the pull request:

 * `auto-branch-delete:on-close` deletes head branch when the PR gets closed regardless of its merge status
 * `auto-branch-delete:on-merge` deletes head branch when the PR gets merged

### Label Management

The labels are automatically added to the repository when this skill gets enabled and PRs are created.

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
 
