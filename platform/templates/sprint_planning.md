# Sprint Planning & Project Setup - {{project_name}}

**Client:** {{client_name}} ({{client_company}})
**Service Type:** {{service_type}}
**Date:** {{date}}
**Budget:** {{budget}}
**Timeline:** {{timeline}}

---

## Project Infrastructure Setup

### 1. Repository Setup
```
Repository: client-{{client_company}}-{{project_name}}
Branch strategy: main (production) + feature branches
PR policy: Always PR, never push directly to main
```

### 2. Environment Configuration
```
.env.example   - Template with all required variables
.env           - Local development (NEVER commit)
.env.staging   - Staging environment
.env.production - Production environment
```

### 3. CI/CD Pipeline
- [ ] GitHub Actions workflow configured
- [ ] Lint check on every PR
- [ ] Tests run on every PR
- [ ] Auto-deploy to staging on merge to main
- [ ] Manual deploy to production (approval required)

### 4. Kanban Board Columns
| Column | Purpose | WIP Limit |
|--------|---------|:---------:|
| Backlog | All planned tasks | None |
| Sprint | Current sprint tasks | 8 |
| In Progress | Actively being worked on | 2 |
| Review | PR submitted, awaiting review | 3 |
| Done | Completed and merged | None |

---

## Sprint Template

### Sprint #___
**Duration:** 1 week (Monday - Friday)
**Goal:** _[One clear sentence about what this sprint achieves]_

### Sprint Backlog
| # | Task | Size | Status | PR |
|---|------|:----:|:------:|:--:|
| 1 | _[Task]_ | S/M/L | Todo | - |
| 2 | _[Task]_ | S/M/L | Todo | - |
| 3 | _[Task]_ | S/M/L | Todo | - |
| 4 | _[Task]_ | S/M/L | Todo | - |

### Definition of Done
- [ ] Code is linted and formatted
- [ ] Tests written and passing
- [ ] PR reviewed (self-review minimum)
- [ ] No secrets or debug code
- [ ] Feature works on staging
- [ ] Documentation updated if needed

---

## Development Workflow

### Branch Naming
```
feature/01-user-authentication
feature/02-dashboard-api
fix/03-login-redirect-bug
refactor/04-database-queries
```

### Commit Messages
```
feat(auth): add JWT token refresh
fix(dashboard): correct revenue calculation
docs(api): update endpoint documentation
test(projects): add phase completion tests
refactor(services): extract validation logic
```

### PR Checklist
- [ ] Branch is up to date with main
- [ ] All tests pass (`make test`)
- [ ] Linter is clean (`make lint`)
- [ ] No console.log / print() debug statements
- [ ] No hardcoded secrets or API keys
- [ ] Feature has been tested on staging
- [ ] Screenshots/recording included (for UI changes)

---

## Communication Schedule

| Day | Activity |
|-----|----------|
| Monday | Sprint planning (15 min) |
| Wednesday | Mid-sprint check-in (async, Slack/email) |
| Friday | Sprint review + demo (30 min) |

### Weekly Report Template
- Completed this week: _[list]_
- Planned for next week: _[list]_
- Blockers: _[list or "None"]_
- Demo link: _[staging URL]_

---

## Project Milestones

| Milestone | Sprint | Deliverable | Status |
|-----------|:------:|-------------|:------:|
| M1 | Sprint 1-2 | Foundation + core models | Pending |
| M2 | Sprint 3-4 | Primary features | Pending |
| M3 | Sprint 5 | Integrations + testing | Pending |
| M4 | Sprint 6 | Deployment + handoff | Pending |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Unclear requirements | Scope creep | Document everything, get sign-off |
| Third-party API issues | Feature delays | Build mock/fallback first |
| Client responsiveness | Timeline slip | Set response SLA in contract |
| Technical complexity | Budget overrun | Spike tasks before committing |
