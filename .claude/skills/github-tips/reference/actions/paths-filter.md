# Paths Filter - Smart Triggers

## Rule
Use `paths` and `paths-ignore` to only trigger CI when relevant files change.

## Code
```yaml
on:
  push:
    paths:
      - 'src/**'
      - 'package.json'
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

## Why
Why run the entire CI pipeline when only a README changed? Path filtering saves time and money.

## Anti-pattern
```yaml
# BAD: Every push triggers CI, even documentation changes
on:
  push:
    branches: [main]
# Changed README.md? Full CI runs. Wasted.
```
