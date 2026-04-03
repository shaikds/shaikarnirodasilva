# Permissions - Least Privilege

## Rule
ALWAYS set minimal `permissions` at workflow or job level. NEVER use `permissions: write-all`.

## Code - Workflow Level
```yaml
permissions:
  contents: read
  pull-requests: write
  issues: read
```

## Code - Job Level (more granular)
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - run: npm test

  comment:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - run: gh pr comment ...
```

## Common Permission Combinations
```yaml
# Read-only CI (test/lint)
permissions:
  contents: read

# PR commenting bot
permissions:
  contents: read
  pull-requests: write

# Release creation
permissions:
  contents: write

# Security scanning
permissions:
  contents: read
  security-events: write

# GitHub Pages deploy
permissions:
  contents: read
  pages: write
  id-token: write
```

## Anti-pattern
```yaml
# BAD - Overly permissive:
permissions: write-all

# BAD - No permissions block = default (often too broad)
```

## Why
Least privilege limits blast radius if a workflow is compromised. A test job doesn't need write access to anything.
