---
name: github-tips
description: "GitHub & GitHub Actions best practices - 30 tips as on-demand reference"
disable-model-invocation: true
---

# GitHub & GitHub Actions Best Practices

When this skill is invoked, apply the following best practices to any GitHub-related task.
Reference files are organized by category under `reference/`.

---

## GitHub Actions (reference/actions/)

| # | File | Rule |
|---|------|------|
| 1 | `concurrency.md` | ALWAYS add `concurrency` with `cancel-in-progress: true` |
| 2 | `caching.md` | ALWAYS cache dependencies to speed up builds |
| 3 | `timeout.md` | ALWAYS set `timeout-minutes` on jobs and long steps |
| 4 | `matrix-strategy.md` | Use `fail-fast: false` to get full test results |
| 5 | `parallel-jobs.md` | Use `needs` to run independent jobs in parallel |
| 6 | `environment-secrets.md` | Use Environment Secrets, not Repository Secrets for deploy |
| 7 | `paths-filter.md` | Use `paths` / `paths-ignore` to skip irrelevant CI runs |
| 8 | `reusable-workflows.md` | Use `workflow_call` for DRY workflows across repos |
| 9 | `composite-actions.md` | Bundle repeated steps into composite actions |
| 10 | `event-payload.md` | Use `github.event` for rich event data |
| 11 | `github-output.md` | Use `GITHUB_OUTPUT`, NEVER `set-output` (deprecated) |
| 12 | `artifacts.md` | Use artifacts with `retention-days` to save storage |
| 13 | `permissions.md` | ALWAYS set minimal `permissions` (least privilege) |
| 14 | `conditional-steps.md` | Use `if: always()` / `failure()` for notifications and cleanup |
| 15 | `dependabot-automerge.md` | Set up Dependabot + auto-merge for dependency updates |

## General GitHub (reference/github/)

| # | File | Rule |
|---|------|------|
| 16 | `branch-protection.md` | ALWAYS enable branch protection on `main` |
| 17 | `codeowners.md` | ALWAYS create CODEOWNERS for automatic review assignment |
| 18 | `conventional-commits.md` | Use Conventional Commits format for all commits |
| 19 | `pr-templates.md` | Create PR templates with checklist |
| 20 | `issue-forms.md` | Use Issue Forms (not just templates) with validation |
| 21 | `github-cli.md` | Use `gh` CLI for PRs, issues, releases from terminal |
| 22 | `gitattributes.md` | Configure `.gitattributes` for line endings and linguist |
| 23 | `release-notes.md` | Use auto-generated release notes with label categories |
| 24 | `saved-replies.md` | Set up Saved Replies for common review comments |
| 25 | `search-operators.md` | Use GitHub search operators for advanced search |
| 26 | `git-blame.md` | Use `.git-blame-ignore-revs` to skip formatting commits |
| 27 | `projects-v2.md` | Use GitHub Projects V2 with custom fields and workflows |
| 28 | `security.md` | Enable CodeQL, Secret Scanning, and Dependabot Alerts |
| 29 | `devcontainers.md` | Create `devcontainer.json` for consistent dev environments |
| 30 | `funding.md` | Add `FUNDING.yml` for sponsor button on open source repos |
