# CLAUDE.md - [Project Name]

## Project Overview
[Brief description]. Built for [Client Name] by SilvA.i.

## Architecture
```
src/
├── models/       # Data structures
├── services/     # Business logic
├── routers/      # API endpoints (thin)
├── schemas/      # Pydantic validation
└── config.py     # Settings
```

## Key Rules
- Routers are thin: call service, return response
- Services contain logic: no HTTP concerns
- All user input validated via Pydantic schemas
- Use conventional commits: `feat|fix|test(scope): message`
- Always work on feature branches, merge via PR

## Commands
```bash
make dev    # Start dev server
make test   # Run tests
make lint   # Run linter
make check  # Lint + test
```
