# CLAUDE.md - AI Development Instructions

## Project Overview
<!-- Update this for each project -->
This is a [type] project built with [tech stack].

## Architecture
<!-- Describe the project structure -->
```
src/
├── models/       # Data structures and database models
├── services/     # Business logic
├── controllers/  # Request handlers
├── repositories/ # Data access layer
├── utils/        # Shared utilities
└── config/       # Configuration
```

## Development Guidelines

### Code Style
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Keep functions small and focused (single responsibility)
- Use conventional commits: `feat|fix|docs|refactor|test(scope): message`

### Testing
- Write tests for all new features
- Tests go in `tests/` directory, mirroring `src/` structure
- Run tests with: `make test`
- Aim for >80% coverage on business logic

### Git Workflow
- Always work on feature branches: `feature/description`
- Create PRs for all changes (never push directly to main)
- Use squash and merge for clean history
- Keep PRs small (<200 lines changed)

### Before Committing
- Run `make check` (lint + test)
- Self-review the diff: `git diff --staged`
- No debug code (console.log, print, TODO)
- No hardcoded secrets

### Common Commands
```bash
make install    # Install dependencies
make dev        # Start dev server
make test       # Run tests
make lint       # Run linter
make check      # Run all checks
make build      # Build for production
```

## Important Notes
<!-- Project-specific warnings and info -->
- Environment variables are in `.env` (never commit this)
- Database migrations must be run before testing
- API keys are stored in environment variables, not in code
