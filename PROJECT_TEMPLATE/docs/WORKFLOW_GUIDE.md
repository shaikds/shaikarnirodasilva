# Complete Development Workflow Guide

## Table of Contents
1. [Daily Development Workflow](#daily-development-workflow)
2. [Branch Strategy](#branch-strategy)
3. [How to Create a Pull Request (PR)](#how-to-create-a-pull-request-pr)
4. [Code Review Process](#code-review-process)
5. [Issue Management](#issue-management)
6. [Sprint/Week Planning](#sprintweek-planning)
7. [Release Process](#release-process)
8. [Emergency Hotfix Process](#emergency-hotfix-process)

---

## Daily Development Workflow

### Morning Routine (5 minutes)
```bash
# 1. Update your local main
git checkout main
git pull origin main

# 2. Check your open PRs - any reviews to address?
# Go to: github.com/YOUR_REPO/pulls

# 3. Check your Kanban board
# Go to: github.com/YOUR_REPO/projects

# 4. Pick the top priority issue and start
git checkout -b feature/issue-42-add-login
```

### During Development
```bash
# Make small, logical commits as you work
git add src/auth/login.js src/auth/login.test.js
git commit -m "feat(auth): add login form component"

git add src/auth/validation.js
git commit -m "feat(auth): add email/password validation"

# Push regularly (backup + CI runs)
git push -u origin feature/issue-42-add-login
```

### End of Day
```bash
# 1. Push your work
git push

# 2. If feature is complete → Create PR
# 3. If not complete → That's fine, continue tomorrow
# 4. Update your Kanban board
```

---

## Branch Strategy

### Branch Naming Convention
```
<type>/<issue-number>-<short-description>

Examples:
feature/42-user-authentication
fix/87-cart-total-calculation
refactor/103-extract-email-service
docs/15-api-documentation
chore/120-update-dependencies
test/95-add-payment-tests
```

### Branch Lifecycle
```
1. Create branch from main
   git checkout main
   git pull origin main
   git checkout -b feature/42-user-auth

2. Develop on branch
   git add .
   git commit -m "feat(auth): implement login"
   git push -u origin feature/42-user-auth

3. Keep branch updated
   git fetch origin main
   git rebase origin/main
   # Resolve conflicts if any
   git push --force-with-lease

4. Create PR when ready

5. Address review comments (if any)

6. Squash & Merge via GitHub

7. Delete branch after merge
   git checkout main
   git pull origin main
   git branch -d feature/42-user-auth
```

### Branch Protection Rules (Set Up on GitHub)
Go to: Repository → Settings → Branches → Add rule

For `main` branch:
- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
- [x] Require branches to be up to date before merging
- [x] Include administrators (even you must use PRs!)

---

## How to Create a Pull Request (PR)

### Step-by-Step Guide

#### Step 1: Prepare Your Branch
```bash
# Make sure all tests pass locally
npm test          # or: mvn test, pytest, etc.

# Make sure linting passes
npm run lint      # or: pylint, checkstyle, etc.

# Rebase on latest main
git fetch origin main
git rebase origin/main

# Push your branch
git push -u origin feature/42-user-auth
```

#### Step 2: Create PR on GitHub
1. Go to your repository on GitHub
2. Click "Compare & pull request" (or "New pull request")
3. Set base: `main` ← compare: `feature/42-user-auth`
4. Fill in the PR template (see below)
5. Add labels: `feature`, `ready-for-review`, etc.
6. Link the issue: "Closes #42" in the description
7. Request reviewers (if working with others)

#### Step 3: PR Template (Filled Example)
```markdown
## Summary
Implements user authentication with email/password login.

## Changes
- Added login form component with validation
- Added JWT token handling in auth service
- Added login API endpoint
- Added unit tests for validation and auth service

## Related Issue
Closes #42

## Type of Change
- [x] New feature
- [ ] Bug fix
- [ ] Refactoring
- [ ] Documentation

## Testing
- [x] Unit tests added
- [x] Integration tests added
- [x] Manual testing done

## Screenshots (if UI changes)
![Login Form](screenshots/login-form.png)

## Checklist
- [x] My code follows the project's style guide
- [x] I have performed a self-review of my code
- [x] I have added tests that prove my fix/feature works
- [x] New and existing tests pass locally
- [x] I have updated documentation if needed
```

#### Step 4: Self-Review (CRITICAL for Solo Developers)
Before marking as ready:
1. Go to the "Files changed" tab
2. Review EVERY line of code as if someone else wrote it
3. Look for:
   - Leftover debug code (`console.log`, `print`)
   - Hardcoded values
   - Missing error handling
   - Security issues (exposed secrets, SQL injection)
   - Missing tests
   - Unclear variable names
4. Add review comments to yourself if needed
5. Wait 24 hours and review again with fresh eyes (for important PRs)

#### Step 5: Merge
- Use **"Squash and merge"** for clean history
- Delete the branch after merge
- Verify the CI/CD pipeline passes after merge

### PR Size Guidelines
| Size | Lines Changed | Review Time | Recommendation |
|------|--------------|-------------|----------------|
| XS | 1-10 | 5 min | Perfect |
| S | 11-50 | 15 min | Great |
| M | 51-200 | 30 min | Good |
| L | 201-500 | 1 hour | Try to split |
| XL | 500+ | 2+ hours | MUST split |

**Rule: If a PR is larger than 200 lines, ask yourself: "Can I split this into 2-3 smaller PRs?"**

---

## Code Review Process

### What to Look For (Review Checklist)

#### Correctness
- [ ] Does the code do what the PR says it does?
- [ ] Are there edge cases not handled?
- [ ] Is the error handling appropriate?

#### Design
- [ ] Is this the right approach?
- [ ] Does it fit with the existing architecture?
- [ ] Are there simpler alternatives?

#### Readability
- [ ] Can I understand the code without asking the author?
- [ ] Are names clear and descriptive?
- [ ] Is there unnecessary complexity?

#### Testing
- [ ] Are there tests for the new code?
- [ ] Do tests cover edge cases?
- [ ] Are tests readable and maintainable?

#### Security
- [ ] No hardcoded secrets?
- [ ] Input validation present?
- [ ] No SQL injection, XSS, etc.?

#### Performance
- [ ] No obvious performance issues?
- [ ] No unnecessary database queries in loops?
- [ ] Appropriate data structures used?

### How to Give Review Feedback (for when you work with others)
```
# Good review comment
"Consider using a Map instead of iterating through the array here - 
the lookup is O(n) currently but could be O(1). Since this runs 
for every request, it could matter at scale."

# Bad review comment  
"This is wrong"
"Use a Map"
"Why?"
```

### Review Comment Prefixes
| Prefix | Meaning |
|--------|---------|
| `nit:` | Minor style/preference, not blocking |
| `suggestion:` | Consider this alternative |
| `question:` | I don't understand this, please explain |
| `issue:` | This needs to be fixed before merge |
| `praise:` | This is great! (positive feedback matters) |

---

## Issue Management

### Creating Good Issues

#### Bug Report Template
```markdown
## Bug Description
[Clear description of the bug]

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Environment
- OS: [e.g., Windows 11]
- Browser: [e.g., Chrome 120]
- Version: [e.g., 1.2.3]

## Screenshots/Logs
[Attach relevant screenshots or error logs]
```

#### Feature Request Template
```markdown
## Feature Description
[Clear description of the desired feature]

## Problem it Solves
[Why is this needed? What pain point does it address?]

## Proposed Solution
[How you think it should work]

## Alternatives Considered
[Other approaches you thought about]

## Acceptance Criteria
- [ ] User can...
- [ ] System should...
- [ ] Error handling for...
```

### Issue Labels System
```
Priority:
  P0-critical     (red)     - Production is broken
  P1-important    (orange)  - Must do this sprint
  P2-normal       (yellow)  - Should do soon
  P3-low          (green)   - Nice to have

Type:
  bug             (red)     - Something is broken
  feature         (blue)    - New functionality
  enhancement     (cyan)    - Improvement to existing
  refactor        (purple)  - Code restructuring
  docs            (gray)    - Documentation
  tech-debt       (brown)   - Technical debt to pay off
  chore           (gray)    - Maintenance tasks

Status:
  needs-triage    (white)   - New, needs assessment
  ready           (green)   - Ready to work on
  in-progress     (yellow)  - Being worked on
  blocked         (red)     - Blocked by dependency
  review          (purple)  - In PR review
```

### Issue Organization with Milestones
```
Milestone: V1.0 - MVP Launch
  └── Issue #1: Set up project infrastructure
  └── Issue #2: User authentication
  └── Issue #3: Basic CRUD operations
  └── Issue #4: Deploy to production

Milestone: V1.1 - User Feedback
  └── Issue #5: Add search functionality
  └── Issue #6: Improve error messages
  └── Issue #7: Performance optimization
```

---

## Sprint/Week Planning

### Weekly Workflow (for Solo Developer)

#### Sunday/Monday: Planning (30 min)
1. Review last week:
   - What was completed?
   - What wasn't? Why?
   - Any blockers?
2. This week's goals:
   - Pick 3-5 issues from backlog
   - Move to "In Progress" column
   - Estimate effort (S/M/L)
3. Update Kanban board

#### During the Week: Execution
```
Kanban Board Columns:
┌──────────┬───────────┬──────────┬──────┐
│ Backlog  │ This Week │ In PR    │ Done │
├──────────┼───────────┼──────────┼──────┤
│ Issue #8 │ Issue #5  │ Issue #3 │ #1   │
│ Issue #9 │ Issue #6  │          │ #2   │
│ Issue #10│           │          │ #4   │
└──────────┴───────────┴──────────┴──────┘
```

#### Friday/Saturday: Review (15 min)
1. Close completed issues
2. Archive done items
3. Note what blocked you
4. Celebrate what you shipped!

### Estimation Guide
| Size | Time | Example |
|------|------|---------|
| XS | < 1 hour | Fix typo, update config |
| S | 1-4 hours | Simple bug fix, add test |
| M | 4-8 hours | New feature, refactor module |
| L | 1-3 days | Complex feature, new integration |
| XL | 3+ days | Split this into smaller tasks! |

---

## Release Process

### Semantic Versioning (SemVer)
```
MAJOR.MINOR.PATCH
  │     │     └── Bug fixes, no API changes (1.0.1)
  │     └──────── New features, backward compatible (1.1.0)
  └────────────── Breaking changes (2.0.0)
```

### Release Checklist
```markdown
## Release v1.2.0

### Pre-Release
- [ ] All PRs for this release are merged
- [ ] All tests pass on main
- [ ] Update version number in package.json/pom.xml
- [ ] Update CHANGELOG.md
- [ ] Run full test suite locally
- [ ] Test deployment in staging (if available)

### Release
- [ ] Create GitHub Release with tag v1.2.0
- [ ] Write release notes (what's new, what's fixed)
- [ ] Deploy to production
- [ ] Verify production deployment

### Post-Release
- [ ] Monitor for errors (check logs)
- [ ] Announce release (if applicable)
- [ ] Update project board
```

### CHANGELOG Format
```markdown
# Changelog

## [1.2.0] - 2024-01-15
### Added
- User profile page (#42)
- Email notifications (#45)

### Changed
- Improved login page design (#48)

### Fixed
- Cart total calculation error (#50)
- Memory leak in image processing (#52)

## [1.1.0] - 2024-01-01
### Added
- Search functionality (#30)
...
```

---

## Emergency Hotfix Process

```
When production is broken:

1. DON'T PANIC

2. Create hotfix branch from main
   git checkout main
   git pull origin main
   git checkout -b hotfix/critical-bug-description

3. Fix the issue (minimal change)
   git add .
   git commit -m "fix: [describe the critical fix]"

4. Test the fix locally

5. Push and create PR
   git push -u origin hotfix/critical-bug-description
   # Create PR → fast review → merge

6. Deploy immediately

7. Create a proper issue for follow-up
   "Investigate root cause of [bug]"
   "Add tests to prevent regression of [bug]"
```

---

## Quick Reference Card

```
DAILY:
  git pull origin main          # Stay updated
  git checkout -b feature/xxx   # New branch
  git add <files>               # Stage changes
  git commit -m "type: msg"     # Commit
  git push                      # Push to remote

PR FLOW:
  Develop → Push → Create PR → Self-Review → Merge → Delete branch

COMMIT MESSAGE:
  feat|fix|docs|style|refactor|test|chore(scope): description

BRANCH NAMING:
  feature/42-short-description
  fix/87-bug-description

ISSUE LABELS:
  P0/P1/P2/P3 + bug/feature/enhancement/refactor/docs
```
