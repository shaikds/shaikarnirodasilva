# CLAUDE.md - AI Agent Hub

## Project Overview
REST API for managing and executing AI agents. Built with FastAPI + SQLAlchemy + SQLite.

## Architecture
```
src/
├── main.py          # App entry point, router registration
├── config.py        # Settings from environment variables
├── database.py      # SQLAlchemy engine, session, Base
├── models/          # SQLAlchemy ORM models (DB tables)
├── schemas/         # Pydantic schemas (request/response validation)
├── routers/         # API endpoint handlers (thin - delegate to services)
├── services/        # Business logic (testable, no HTTP concerns)
└── middleware/       # Auth middleware (JWT verification)
```

## Key Patterns
- **Routers** are thin: validate input, call service, return response
- **Services** contain business logic: no HTTP concerns, easy to test
- **Models** are SQLAlchemy: define DB schema
- **Schemas** are Pydantic: define API contracts

## Commands
```bash
make dev        # Start server (http://localhost:8000/docs)
make test       # Run pytest
make lint       # Run ruff linter
make format     # Auto-format code
make check      # lint + test
```

## Git Workflow
- Branch naming: `feature/xx-description` or `fix/xx-description`
- Commit format: `feat|fix|docs|test|refactor(scope): message`
- Always create PRs, never push directly to main
