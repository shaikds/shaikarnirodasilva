# GitHub CLI (gh)

## Rule
Use `gh` CLI for GitHub operations from the terminal - faster than the browser.

## Pull Requests
```bash
# Create PR
gh pr create --title "Add feature" --body "Description"

# Create PR with template
gh pr create --fill  # Uses PR template

# List PRs
gh pr list
gh pr list --state closed

# Review PR
gh pr checkout 123
gh pr diff 123
gh pr review 123 --approve
gh pr review 123 --request-changes --body "Please fix..."

# Merge PR
gh pr merge 123 --squash --delete-branch
```

## Issues
```bash
# Create issue
gh issue create --title "Bug" --label "bug" --assignee "@me"

# List issues
gh issue list --label "bug" --state open

# Close issue
gh issue close 123 --reason "completed"
```

## CI/CD
```bash
# View workflow runs
gh run list
gh run view 123456
gh run watch  # Live updates

# Re-run failed jobs
gh run rerun 123456 --failed

# View logs
gh run view 123456 --log-failed
```

## Releases
```bash
# Create release with auto-generated notes
gh release create v1.0.0 --generate-notes

# Create draft release
gh release create v1.0.0 --draft --generate-notes

# Upload assets
gh release upload v1.0.0 ./dist/app.zip
```

## Search
```bash
# Search code across your org
gh search code "API_KEY" --owner my-org

# Search repos
gh search repos "cli tool" --language go --stars ">100"
```

## Why
`gh` saves time by keeping you in the terminal. No context-switching to the browser. Especially powerful for CI monitoring and PR management.
