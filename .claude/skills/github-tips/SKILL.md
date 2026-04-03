---
name: applying-github-best-practices
description: "Applies GitHub and GitHub Actions best practices when creating workflows, PRs, issues, repo configs, and CI/CD pipelines. Use when setting up a new repository, creating GitHub Actions workflows, configuring branch protection, writing PR/issue templates, or any GitHub-related task."
---

# GitHub & GitHub Actions Best Practices

Apply these best practices to any GitHub-related task. Reference files are organized by category.

## Quick start

Minimal CI workflow with best practices applied:

```yaml
name: CI
on:
  push:
    paths: ['src/**', 'package.json']
    paths-ignore: ['**.md']

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test
```

## Determine the task type

**Creating/editing a GitHub Actions workflow?** → See [GitHub Actions](#github-actions) below
**Setting up a new repository?** → See [General GitHub](#general-github) below
**Both?** → Read both sections

## GitHub Actions

**Essentials** (apply to every workflow):
- [concurrency.md](reference/actions/concurrency.md) - Cancel redundant runs
- [permissions.md](reference/actions/permissions.md) - Least privilege permissions
- [timeout.md](reference/actions/timeout.md) - Prevent stuck jobs

**Performance**:
- [caching.md](reference/actions/caching.md) - Cache dependencies
- [paths-filter.md](reference/actions/paths-filter.md) - Skip irrelevant CI runs
- [parallel-jobs.md](reference/actions/parallel-jobs.md) - Run jobs in parallel with `needs`

**Advanced patterns**:
- [reusable-workflows.md](reference/actions/reusable-workflows.md) - DRY workflows across repos
- [composite-actions.md](reference/actions/composite-actions.md) - Bundle repeated steps
- [matrix-strategy.md](reference/actions/matrix-strategy.md) - Test across versions/OS

**Outputs & artifacts**:
- [github-output.md](reference/actions/github-output.md) - NEVER use deprecated `set-output`
- [artifacts.md](reference/actions/artifacts.md) - Share files between jobs
- [event-payload.md](reference/actions/event-payload.md) - Access rich event data

**Notifications & deployment**:
- [conditional-steps.md](reference/actions/conditional-steps.md) - `if: always()` / `failure()`
- [environment-secrets.md](reference/actions/environment-secrets.md) - Per-environment secrets
- [dependabot-automerge.md](reference/actions/dependabot-automerge.md) - Auto-update dependencies

## General GitHub

**Repository setup** (apply when creating a new repo):
- [branch-protection.md](reference/github/branch-protection.md) - Protect `main` branch
- [codeowners.md](reference/github/codeowners.md) - Automatic review assignment
- [gitattributes.md](reference/github/gitattributes.md) - Line endings and linguist config
- [security.md](reference/github/security.md) - CodeQL, Secret Scanning, Dependabot

**Templates & forms**:
- [pr-templates.md](reference/github/pr-templates.md) - PR template with checklist
- [issue-forms.md](reference/github/issue-forms.md) - Structured issue forms with validation
- [conventional-commits.md](reference/github/conventional-commits.md) - Commit message format

**Productivity**:
- [github-cli.md](reference/github/github-cli.md) - `gh` CLI reference
- [search-operators.md](reference/github/search-operators.md) - Advanced GitHub search
- [saved-replies.md](reference/github/saved-replies.md) - Common review comments

**Project management**:
- [release-notes.md](reference/github/release-notes.md) - Auto-generated changelogs
- [projects-v2.md](reference/github/projects-v2.md) - Project boards with custom fields
- [git-blame.md](reference/github/git-blame.md) - Skip formatting commits in blame
- [devcontainers.md](reference/github/devcontainers.md) - Consistent dev environments
- [funding.md](reference/github/funding.md) - Sponsor button for open source

## New repo setup checklist

When setting up a new repository, copy and track progress:

```
Repo Setup:
- [ ] Branch protection on main
- [ ] CODEOWNERS file
- [ ] .gitattributes
- [ ] PR template
- [ ] Issue forms (bug report + feature request)
- [ ] CI workflow with concurrency, cache, timeout, permissions
- [ ] Dependabot config
- [ ] CodeQL security scanning
- [ ] .git-blame-ignore-revs
- [ ] devcontainer.json (if team project)
```
