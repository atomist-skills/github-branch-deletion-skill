# `atomist/github-branch-deletion-skill`

Automatically delete pull request branches when a pull request is closed.

<!---atomist-skill-readme:start--->
 
# What it's useful for

With this skill you can automatically delete pull request branches once a pull request is merged or closed. 

This approach makes it easy for pull request authors (or anyone with permissions in the repository) to flag a pull 
request for branch auto-deletion. 

When a new pull request is created, this skill will automatically apply the default auto-deletion policy labels
(if set). The label can be changed on the pull request to modify the policy for auto-deletion.

Opting out of auto-deletion is a simple matter of removing the auto-deletion labels from a pull request. 

This skill is configured to work on any number of repositories without needing to edit individual repository settings
on GitHub.com.

# Before you get started

Connect and configure these integrations:

1. **GitHub**
2. **Slack**

The **GitHub** integration must be configured in order to use this skill. At least one repository must be selected. 
We recommend connecting the **Slack** integration.

# How to configure

1. **Select the default auto-deletion policy**

    ![Default auto-deletion policy expanded](docs/images/default-auto-deletion-policy-expanded.png)

    To do so when no explicit auto-deletion label is applied to the pull request, you can select one of the options:

    - **On pull request merge** — Deletes head branch when a pull request is merged.
    
    - **On pull request close or merge** — Deletes head branch when a pull request is closed regardless of its merge status.

2. **Determine repository scope**

    ![Repository filter](docs/images/repo-filter.png)

    By default, this skill will be enabled for all repositories in all organizations you have connected.

    To restrict the organizations or specific repositories on which the skill will run, you can explicitly choose 
    organization(s) and repositories.

# How to use Pull Request Branch auto-deletion

1. **Configure skill, set default auto-deletion policy** 

2. **For every new pull request raised, this skill will automatically apply the following label when relevant:**

    **Auto-deletion policy labels**

    - `auto-branch-delete:on-merge`
    - `auto-branch-delete:on-close`

3. **Enjoy not having to manually clean up pull request branches when PRs are closed!**

    Note: the label is automatically added to and removed from the repository depending. 
    
To create feature requests or bug reports, create an [issue in the repository for this skill](https://github.com/atomist-skills/github-branch-deletion-skill/issues). 
See the [code](https://github.com/atomist-skills/github-branch-deletion-skill) for the skill.

<!---atomist-skill-readme:end--->

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
 
