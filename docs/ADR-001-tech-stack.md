# ADR-001: Technology Stack Selection

## Status
Accepted

## Date
2026-03-31

## Context
Building a REST API for managing and executing AI agents. Need to choose
the core technology stack that supports async operations, has great
documentation tooling, and is production-ready.

## Options Considered

### Option 1: FastAPI + SQLAlchemy + SQLite
- **Pros:** Modern async Python, auto-generated API docs (Swagger/ReDoc),
  Pydantic validation built-in, SQLite for easy setup, SQLAlchemy for
  ORM with easy migration to PostgreSQL
- **Cons:** SQLite limitations for concurrent writes (acceptable for learning)

### Option 2: Flask + SQLAlchemy
- **Pros:** Mature, large community, lots of tutorials
- **Cons:** No built-in async, no auto API docs, more boilerplate

### Option 3: Django REST Framework
- **Pros:** Batteries included, admin panel, mature ORM
- **Cons:** Heavy for an API-only project, steeper learning curve

## Decision
FastAPI + SQLAlchemy + SQLite because:
- FastAPI is the fastest-growing Python web framework
- Built-in Swagger UI means instant interactive API documentation
- Pydantic v2 provides excellent request/response validation
- Async support is native (important for agent execution)
- SQLite keeps setup simple; SQLAlchemy makes switching to PostgreSQL trivial
- Most demanded Python API framework in job listings (2024-2026)

## Consequences
### Positive
- Auto-generated API docs at `/docs` and `/redoc`
- Type safety with Pydantic schemas
- Easy to learn and extend
- Great developer experience with hot reload

### Negative
- SQLite doesn't support concurrent writes well (fine for solo dev)
- Need to manage async patterns carefully

### Risks
- SQLite may need to be replaced for production (mitigated: SQLAlchemy abstraction)
