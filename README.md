# `@atomist/github-auto-merge-skill`

Atomist Skill to automatically merge Pull Requests on GitHub based on assigned labels.

## Usage

### Enable Auto-Merge

To enable auto-merging, one the following labels has to be assigned to the pull request:

 * `auto-merge:on-approve` triggers auto-merge if all requested reviews are approved and all status checks are green
 * `auto-merge:on-check-success` triggers auto-merge if all status checks are green 

### Specify Merge Method

To specify the desired merge method, one of the following optional labels can be used:

 * `auto-merge-method:merge`
 * `auto-merge-method:rebase`
 * `auto-merge-method:squash`
 
### Label Management

The labels are automatically added to and removed from the repository depending on its settings.
E.g. disabling the _rebase_ merge method will automatically remove the label.

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
