# Timeout Minutes

## Rule
ALWAYS set `timeout-minutes` on jobs and long-running steps.

## Code
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10        # Job-level timeout
    steps:
      - run: npm test
        timeout-minutes: 5     # Step-level timeout
```

## Why
Without timeout, a stuck job runs up to 6 hours and burns all your free minutes. Default recommendation: 10 min for jobs, 5 min for individual steps.

## Anti-pattern
```yaml
# BAD: No timeout - stuck job runs 6 hours
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm test  # If this hangs, 6 hours wasted
```
