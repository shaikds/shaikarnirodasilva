# Conventional Commits

## Rule
Use Conventional Commits format for all commit messages.

## Format
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Types
```
feat:     New feature (triggers minor version bump)
fix:      Bug fix (triggers patch version bump)
docs:     Documentation changes
refactor: Code refactoring (no feature/fix change)
test:     Adding or updating tests
chore:    Build process, dependencies, tooling
ci:       CI/CD changes
perf:     Performance improvement
style:    Code style (formatting, semicolons, etc.)
breaking: Breaking API change (triggers major version bump)
```

## Examples
```
feat(auth): add OAuth2 login support
fix(api): resolve null pointer in user service
docs: update API endpoint documentation
refactor(payment): simplify checkout flow
test(user): add integration tests for registration
chore: update dependencies to latest versions
ci: add staging deployment workflow
perf(db): optimize search queries with indexing
feat!: remove deprecated v1 API endpoints
```

## Why
Enables: automatic changelog generation, automatic semantic versioning (semantic-release), better readability of git history, and easier filtering of changes.
