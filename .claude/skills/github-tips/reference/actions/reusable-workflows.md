# Reusable Workflows

## Rule
Use `workflow_call` to create DRY workflows reusable across repos.

## Reusable Workflow (callee)
```yaml
# .github/workflows/reusable-test.yml
on:
  workflow_call:
    inputs:
      node-version:
        required: true
        type: string
    secrets:
      NPM_TOKEN:
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
      - run: npm test
```

## Caller Workflow
```yaml
# .github/workflows/ci.yml
jobs:
  call-tests:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: '20'
    secrets: inherit  # Pass all secrets
```

## Cross-repo Usage
```yaml
jobs:
  call-tests:
    uses: my-org/shared-workflows/.github/workflows/test.yml@main
    with:
      node-version: '20'
```

## Why
Write once, use everywhere. Instead of copy-pasting the same workflow across 10 repos, call it from one place. DRY principle.
