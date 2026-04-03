# Artifacts - Share Files Between Jobs

## Rule
Use artifacts with `retention-days` to share files between jobs and save storage.

## Code - Upload
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/
          retention-days: 5  # Default is 90 days - way too much
```

## Code - Download
```yaml
  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build-output
          path: dist/
      - run: ./deploy.sh
```

## Upload Test Results (always, even on failure)
```yaml
- run: npm test

- if: always()
  uses: actions/upload-artifact@v4
  with:
    name: test-results
    path: |
      test-results/
      coverage/
    retention-days: 3
```

## Why
`retention-days: 5` saves storage. Default 90 days is unnecessary for most artifacts. Use `if: always()` to upload test results even when tests fail.
