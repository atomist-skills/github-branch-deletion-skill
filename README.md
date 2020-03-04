# `atomist/github-branch-deletion-skill`

<!---atomist-skill-readme:start--->

Once a pull request is merged or closed, the head branch will be deleted. This skill is configured to work on any number of repositories without needing to edit individual repository settings on GitHub.com.

### **Enabling branch auto-deletion**

To enable auto-deletion, one of the auto-delete policy labels must be added to the pull request. Set the default auto-deletion policy in order for this skill to automatically apply the labels to new pull requests raised.

- `auto-branch-delete:on-merge`
- `auto-branch-delete:on-close`

The labels are automatically added to the repository when this skill is enabled.

## Configuration

### Default auto-deletion policy

To set the default policy to use when auto-deleting branches when no explicit label is applied to the pull request, 
select one of the options.

- **On pull request merge** — Deletes head branch when a pull request is merged.
- **On pull request close or merge** — Deletes head branch when a pull request is closed regardless of its merge status.

### Which repositories

By default, this skill will be enabled for all repositories in all organizations you have connected.
To restrict the organizations or specific repositories on which the skill will run, you can explicitly
choose organization(s) and repositories.

## Integrations

**GitHub**

The Atomist GitHub integration must be configured to used this skill. At least one repository must be selected.

**Slack**

If the Atomist Slack integration is configured, this skill will send a notification message to the configured 
Slack channel when a branch is deleted.

<!---atomist-skill-readme:end--->

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
 
