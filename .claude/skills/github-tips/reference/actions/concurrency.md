# Concurrency - Cancel Redundant Runs

## Rule
ALWAYS add `concurrency` with `cancel-in-progress: true` to every workflow.

## Code
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

## Why
When multiple pushes happen on the same branch, only the latest run continues. Saves build minutes and money.

## Anti-pattern
```yaml
# BAD: No concurrency control - every push runs full pipeline
on:
  push:
    branches: [main]
# Missing concurrency block = wasted build minutes
```
