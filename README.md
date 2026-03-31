# AI Agent Hub API

A production-ready REST API for creating, managing, and executing AI agents. Built with FastAPI and Python, following industry best practices.

## What is this?

AI Agent Hub is a platform API where you can:
- **Create AI Agents** - Define agents with specific roles, tools, and configurations
- **Execute Agents** - Run agents on tasks and get results
- **Track Executions** - Monitor agent runs with real-time status and logs
- **Manage Users** - Full authentication system with JWT tokens

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | FastAPI | Modern, fast, auto-docs (Swagger), async support |
| Database | SQLite + SQLAlchemy | Simple setup, easy to switch to PostgreSQL |
| Auth | JWT (jose) | Stateless, industry standard |
| Validation | Pydantic v2 | Built into FastAPI, excellent validation |
| Testing | pytest + httpx | Industry standard for Python APIs |
| Linting | Ruff | Fastest Python linter, replaces flake8+isort+black |
| CI/CD | GitHub Actions | Free, integrated with GitHub |

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/shaikds/ai-agent-hub.git
cd ai-agent-hub

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment
cp .env.example .env

# 5. Run the server
uvicorn src.main:app --reload

# 6. Open API docs
# http://localhost:8000/docs (Swagger UI)
# http://localhost:8000/redoc (ReDoc)
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register a new user |
| POST | `/api/v1/auth/login` | Login and get JWT token |
| GET | `/api/v1/auth/me` | Get current user profile |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agents` | Create a new agent |
| GET | `/api/v1/agents` | List all your agents |
| GET | `/api/v1/agents/{id}` | Get agent details |
| PUT | `/api/v1/agents/{id}` | Update an agent |
| DELETE | `/api/v1/agents/{id}` | Delete an agent |

### Executions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agents/{id}/execute` | Run an agent |
| GET | `/api/v1/executions` | List all executions |
| GET | `/api/v1/executions/{id}` | Get execution details + logs |
| POST | `/api/v1/executions/{id}/cancel` | Cancel a running execution |

## Project Structure

```
ai-agent-hub/
├── src/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Settings & environment variables
│   ├── database.py          # Database connection & session
│   ├── models/              # SQLAlchemy models
│   │   ├── user.py
│   │   ├── agent.py
│   │   └── execution.py
│   ├── schemas/             # Pydantic request/response schemas
│   │   ├── user.py
│   │   ├── agent.py
│   │   └── execution.py
│   ├── routers/             # API route handlers
│   │   ├── auth.py
│   │   ├── agents.py
│   │   └── executions.py
│   ├── services/            # Business logic
│   │   ├── auth_service.py
│   │   ├── agent_service.py
│   │   └── execution_service.py
│   └── middleware/          # Auth middleware, error handling
│       └── auth.py
├── tests/
│   ├── conftest.py          # Test fixtures
│   ├── test_auth.py
│   ├── test_agents.py
│   └── test_executions.py
├── docs/
│   └── ADR-001-tech-stack.md
├── .github/
│   ├── workflows/ci.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
├── .env.example
├── .gitignore
├── requirements.txt
├── Makefile
├── CLAUDE.md
└── README.md
```

## Development

```bash
make test          # Run tests
make lint          # Run linter
make format        # Format code
make check         # Run all checks (lint + test)
make dev           # Start dev server
```

## License

MIT
