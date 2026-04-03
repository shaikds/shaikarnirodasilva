# Parallel Jobs with needs

## Rule
Use `needs` to run independent jobs in parallel and dependent jobs sequentially.

## Code
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test

  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint

  deploy:
    needs: [test, lint]  # Runs only after BOTH succeed
    runs-on: ubuntu-latest
    steps:
      - run: npm run deploy
```

## Why
`test` and `lint` run in parallel (saving time), `deploy` only starts after both succeed (safety). This significantly reduces pipeline time.

## Anti-pattern
```yaml
# BAD: All steps in one job - runs sequentially
jobs:
  build:
    steps:
      - run: npm run lint    # waits for this
      - run: npm test        # then this
      - run: npm run deploy  # then this - total time = sum of all
```
