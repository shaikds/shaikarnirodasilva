# Pull Request Templates

## Rule
Create a PR template with checklist to ensure consistent, well-documented PRs.

## Code
```markdown
<!-- .github/pull_request_template.md -->

## What does this PR do?
<!-- Brief description of the changes -->

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Refactoring
- [ ] Performance improvement

## How was this tested?
<!-- Describe the tests you ran -->

## Screenshots (if applicable)
<!-- Add screenshots for UI changes -->

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing tests pass locally
- [ ] I have updated the documentation
- [ ] I have added a changelog entry (if applicable)

## Related Issues
<!-- Closes #123, Fixes #456 -->
```

## Multiple Templates
```
.github/
├── pull_request_template.md          # Default template
└── PULL_REQUEST_TEMPLATE/
    ├── bug_fix.md                    # ?template=bug_fix
    ├── feature.md                    # ?template=feature
    └── release.md                    # ?template=release
```

## Why
PR templates prevent empty PRs with no context. Reviewers understand the what, why, and how immediately. Checklists catch common mistakes before review.
