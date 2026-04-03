# Matrix Strategy with fail-fast: false

## Rule
Use `fail-fast: false` in matrix strategies to get full test results across all combinations.

## Code
```yaml
strategy:
  fail-fast: false
  matrix:
    node-version: [18, 20, 22]
    os: [ubuntu-latest, windows-latest]
```

## Why
Default `fail-fast: true` cancels all remaining matrix jobs when one fails. With `false`, you see the full picture of what works and what doesn't.

## Anti-pattern
```yaml
# BAD: Default fail-fast: true - if Node 18 fails, Node 20 and 22 are cancelled
strategy:
  matrix:
    node-version: [18, 20, 22]
# You'll never know if Node 20/22 also fail
```
