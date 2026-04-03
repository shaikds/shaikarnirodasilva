# Conditional Steps - always(), failure(), success()

## Rule
Use `if: always()` for cleanup/upload and `if: failure()` for notifications.

## Code
```yaml
steps:
  - run: npm test

  # Always upload test results, even on failure
  - if: always()
    uses: actions/upload-artifact@v4
    with:
      name: test-results
      path: test-results/

  # Notify Slack only on failure
  - if: failure()
    run: |
      curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
        -H 'Content-Type: application/json' \
        -d '{"text":"CI Failed on ${{ github.ref }} by ${{ github.actor }}"}'

  # Run only on success (this is the default behavior)
  - if: success()
    run: echo "All tests passed!"
```

## Condition Reference
| Condition | When it runs |
|-----------|-------------|
| `if: success()` | Only if all previous steps succeeded (default) |
| `if: failure()` | Only if a previous step failed |
| `if: always()` | Always, regardless of success/failure |
| `if: cancelled()` | Only if the workflow was cancelled |

## Combined Conditions
```yaml
# Run on failure, but only on main branch
- if: failure() && github.ref == 'refs/heads/main'
  run: notify-team.sh

# Run on push to main only
- if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: deploy.sh
```

## Why
Without `if: always()`, test results are lost on failure. Without `if: failure()`, you don't know when CI breaks. Essential for observability.
