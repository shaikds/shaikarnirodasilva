# Composite Actions

## Rule
Bundle repeated steps into a composite action for reuse within a repo.

## Action Definition
```yaml
# .github/actions/setup-project/action.yml
name: 'Setup Project'
description: 'Install dependencies and setup environment'
inputs:
  node-version:
    description: 'Node.js version'
    required: false
    default: '20'
runs:
  using: 'composite'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: 'npm'
    - run: npm ci
      shell: bash
```

## Usage in Workflow
```yaml
steps:
  - uses: ./.github/actions/setup-project
    with:
      node-version: '22'
  - run: npm test
```

## Why
Composite Actions bundle multiple steps into one reusable action. Perfect for setup sequences that repeat across workflows. Unlike reusable workflows, they work at the step level.

## When to use what
- **Composite Action**: Reuse a group of steps within the same repo
- **Reusable Workflow**: Reuse an entire workflow across repos
