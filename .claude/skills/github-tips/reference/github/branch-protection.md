# Branch Protection Rules

## Rule
ALWAYS enable branch protection on `main` with these settings.

## Critical Settings
```
Settings -> Branches -> Add branch protection rule
Branch name pattern: main

Enable:
- [x] Require pull request reviews before merging
  - Required approving reviews: 1 (or 2 for larger teams)
- [x] Require status checks to pass before merging
  - Select your CI workflow
- [x] Require conversation resolution before merging
- [x] Require linear history (prevents messy merge commits)
- [x] Include administrators (no exceptions)
- [x] Do not allow bypassing the above settings
```

## Why
90% of GitHub projects don't set branch protection. Without it, anyone can push directly to main, skip code review, and deploy broken code. It's like a door without a lock.

## Anti-pattern
```
# BAD: No branch protection
# Anyone can: push directly to main, skip CI, skip review
# One bad commit = production down
```
