# Event Payload Data

## Rule
Use `github.event` to access rich event data instead of just `github.sha` and `github.ref`.

## Code - Pull Request Data
```yaml
- name: PR Info
  if: github.event_name == 'pull_request'
  run: |
    echo "PR #${{ github.event.pull_request.number }}"
    echo "Author: ${{ github.event.pull_request.user.login }}"
    echo "Changed files: ${{ github.event.pull_request.changed_files }}"
    echo "Base branch: ${{ github.event.pull_request.base.ref }}"
    echo "Head branch: ${{ github.event.pull_request.head.ref }}"
    echo "Draft: ${{ github.event.pull_request.draft }}"
    echo "Labels: ${{ join(github.event.pull_request.labels.*.name, ', ') }}"
```

## Code - Push Data
```yaml
- name: Push Info
  if: github.event_name == 'push'
  run: |
    echo "Pusher: ${{ github.event.pusher.name }}"
    echo "Commits: ${{ github.event.commits.length }}"
    echo "Compare: ${{ github.event.compare }}"
```

## Code - Issue Data
```yaml
- name: Issue Info
  if: github.event_name == 'issues'
  run: |
    echo "Issue #${{ github.event.issue.number }}"
    echo "Title: ${{ github.event.issue.title }}"
    echo "Labels: ${{ join(github.event.issue.labels.*.name, ', ') }}"
```

## Why
Every GitHub event has a rich payload. Most people only use `github.sha` and `github.ref`, but there's much more data available for conditional logic and notifications.
