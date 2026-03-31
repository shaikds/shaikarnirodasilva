# Contributing Guide

## Getting Started

### Prerequisites
- Git installed and configured
- Your tech stack's runtime (Node.js / Python / Java)
- A GitHub account

### Setup
```bash
# 1. Clone the repository
git clone https://github.com/shaikds/PROJECT_NAME.git
cd PROJECT_NAME

# 2. Install dependencies
make install

# 3. Set up environment
cp .env.example .env
# Edit .env with your local values

# 4. Set up pre-commit hooks
pip install pre-commit
pre-commit install

# 5. Run the project
make dev
```

## Development Workflow

### 1. Pick an Issue
- Check the [Kanban board](../../projects) for available tasks
- Assign yourself to the issue
- Move to "In Progress"

### 2. Create a Branch
```bash
git checkout main
git pull origin main
git checkout -b feature/42-short-description
```

Branch naming: `<type>/<issue-number>-<description>`
- `feature/42-user-login`
- `fix/87-cart-calculation`
- `refactor/103-extract-service`
- `docs/15-api-docs`

### 3. Develop
- Write code in small, logical commits
- Follow the existing code style
- Write tests for your changes
- Keep commits focused and well-messaged

### 4. Commit Messages
We use [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(auth): add Google OAuth login
fix(cart): prevent negative quantities
docs(api): add endpoint documentation
refactor(db): extract connection pooling
test(auth): add password validation tests
chore(deps): update dependencies
```

### 5. Push & Create PR
```bash
git push -u origin feature/42-short-description
```
Then create a Pull Request on GitHub using the PR template.

### 6. Code Review
- Fill in the PR template completely
- Self-review your code in the "Files changed" tab
- Ensure CI passes (green checkmarks)
- Address any review comments

### 7. Merge
- Use "Squash and merge" for clean history
- Delete the branch after merge
- Close the related issue

## Code Style

### General Rules
- Use meaningful names (variables, functions, classes)
- Keep functions small (under 30 lines ideally)
- No magic numbers - use named constants
- Handle errors explicitly
- Write self-documenting code; add comments only for "why"

### Project Structure
```
src/
├── models/          # Data structures
├── services/        # Business logic (testable)
├── controllers/     # Request/response handling
├── repositories/    # Data access
├── utils/           # Shared utilities
└── config/          # Configuration management
```

## Quality Standards
- All PRs must pass CI checks
- New features must include tests
- No hardcoded secrets or credentials
- Code must be linted and formatted
- PR description must explain the "why"
