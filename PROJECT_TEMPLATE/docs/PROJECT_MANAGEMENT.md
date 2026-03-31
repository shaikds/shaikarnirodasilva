# Project Management for Solo Developers

## How to Run a One-Person Project Like a Professional Team

---

## 1. Project Kickoff Document

Before writing ANY code, fill this out:

```markdown
# Project: [Name]

## Vision
[One paragraph: What is this? Who is it for? Why does it matter?]

## Goals
1. [Primary goal]
2. [Secondary goal]
3. [Learning goal - what skill am I developing?]

## Non-Goals (Explicitly Out of Scope)
1. [What this project will NOT do]
2. [What this project will NOT do]

## Tech Stack
| Component | Technology | Why? |
|-----------|-----------|------|
| Frontend | React | Already know it well |
| Backend | Node.js/Express | JavaScript everywhere |
| Database | PostgreSQL | Relational data, free tier |
| Hosting | Railway/Vercel | Free tier, easy deploy |
| CI/CD | GitHub Actions | Free, integrated |

## Architecture Overview
[Simple diagram or description of main components]

## MVP Features (V1.0)
- [ ] Feature 1 - [description]
- [ ] Feature 2 - [description]
- [ ] Feature 3 - [description]

## Future Features (V1.1+)
- [ ] Feature 4 - [description]
- [ ] Feature 5 - [description]

## Timeline
| Week | Goal |
|------|------|
| Week 1 | Project setup, infrastructure, basic models |
| Week 2 | Core feature 1 |
| Week 3 | Core feature 2 |
| Week 4 | Testing, polish, deploy |

## Risks
| Risk | Mitigation |
|------|------------|
| Unfamiliar with X | Spend first 2 hours on tutorial |
| API might be slow | Add caching layer |
```

---

## 2. GitHub Projects Setup (Kanban Board)

### Create Your Board
1. Go to your repository → Projects → New Project
2. Choose "Board" view
3. Create these columns:

```
┌──────────┬──────────┬────────────┬──────────┬──────────┐
│ Backlog  │ To Do    │ In Progress│ In Review│  Done    │
│          │(This Wk) │            │          │          │
├──────────┼──────────┼────────────┼──────────┼──────────┤
│ Items    │ 3-5      │ MAX 2      │ Your PRs │ Shipped! │
│ you'll   │ items    │ items at   │ waiting  │          │
│ do       │ picked   │ a time     │ for self │          │
│ someday  │ for this │ (focus!)   │ review   │          │
│          │ week     │            │          │          │
└──────────┴──────────┴────────────┴──────────┴──────────┘
```

### WIP Limit (Work in Progress)
**CRITICAL RULE: Never have more than 2 items "In Progress"**

Why? Context switching is the #1 productivity killer:
- Switching between 2 tasks: ~20% efficiency loss
- Switching between 3 tasks: ~40% efficiency loss
- Switching between 4+ tasks: ~60% efficiency loss

### Using Milestones for Releases
```
Milestone: V1.0 - MVP
  Due: 2024-02-28
  Issues: #1, #2, #3, #4, #5
  Progress: ████████░░ 80%

Milestone: V1.1 - Polish
  Due: 2024-03-15
  Issues: #6, #7, #8
  Progress: ░░░░░░░░░░ 0%
```

---

## 3. Weekly Routine

### Monday: Planning (30 min)
```markdown
## Week of [DATE]

### Last Week Review
- Completed: [issues]
- Carried over: [issues]
- Blocked by: [what?]

### This Week Goals
1. [ ] Primary goal
2. [ ] Secondary goal
3. [ ] Stretch goal (nice to have)

### Focus Areas
- [ ] Morning: Feature development
- [ ] Afternoon: Testing & reviews
- [ ] Evening: Documentation & planning
```

### Daily: Before Starting Work (5 min)
1. Open your Kanban board
2. Check: What's in progress?
3. Pick the highest priority item
4. Create/switch to the right branch
5. Start coding

### Daily: Before Stopping Work (5 min)
1. Commit and push your work
2. Update issue status if changed
3. Note any blockers for tomorrow
4. Move items on Kanban board

### Friday: Retrospective (15 min)
```markdown
## Retrospective - Week of [DATE]

### What went well?
- [thing that went well]

### What didn't go well?
- [thing that didn't go well]

### What will I do differently?
- [actionable improvement]

### Velocity
- Issues completed: X
- Story points completed: Y
- PRs merged: Z
```

---

## 4. Issue Writing Best Practices

### User Story Format
```markdown
As a [type of user],
I want to [action],
so that [benefit].

### Acceptance Criteria
- [ ] Given [context], when [action], then [result]
- [ ] Given [context], when [action], then [result]

### Technical Notes
- [Implementation hints]
- [Files that need to change]

### Estimation: [S/M/L]
```

### Breaking Down Large Tasks

**BAD:** One issue: "Build user authentication"

**GOOD:** Multiple focused issues:
```
#10 - feat: Create User model and database migration (S)
#11 - feat: Add registration endpoint with validation (M)
#12 - feat: Add login endpoint with JWT generation (M)
#13 - feat: Add authentication middleware (S)
#14 - feat: Add password reset flow (L)
#15 - test: Add auth integration tests (M)
#16 - docs: Document auth API endpoints (S)
```

Each issue should be completable in 1-4 hours.

---

## 5. Decision Making Framework

### For Technical Decisions
Use the **ADR (Architecture Decision Record)** format:

```markdown
# ADR-001: Choose PostgreSQL over MongoDB

## Status: Accepted
## Date: 2024-01-15

## Context
We need a database. Our data is relational (users, orders, products).

## Options Considered
1. PostgreSQL - Relational, ACID, great ecosystem
2. MongoDB - Document store, flexible schema
3. SQLite - Simple, file-based, no server needed

## Decision
PostgreSQL because:
- Data is relational with clear schema
- Need ACID transactions for orders
- Free tier on Railway/Supabase
- Industry standard, good to know

## Consequences
- Need to write SQL migrations
- Need to manage connection pooling
- More setup than SQLite
```

### For Priority Decisions
Use the **Eisenhower Matrix:**
```
                    URGENT              NOT URGENT
              ┌─────────────────┬─────────────────┐
  IMPORTANT   │    DO FIRST     │   SCHEDULE IT    │
              │                 │                   │
              │ Production bugs │ New features      │
              │ Security issues │ Refactoring       │
              │ Deadline items  │ Learning          │
              ├─────────────────┼─────────────────┤
NOT IMPORTANT │   DELEGATE/     │    ELIMINATE      │
              │   QUICK DO      │                   │
              │                 │                   │
              │ Minor bugs      │ Premature         │
              │ Quick fixes     │  optimization     │
              │ Small chores    │ Over-engineering   │
              └─────────────────┴─────────────────┘
```

---

## 6. Documentation Standards

### Every Project MUST Have

#### README.md (Public-facing)
```markdown
# Project Name

Brief description of what this does.

## Features
- Feature 1
- Feature 2

## Quick Start
​```bash
git clone ...
cd project
npm install
npm start
​```

## Tech Stack
- Frontend: React
- Backend: Node.js
- Database: PostgreSQL

## Screenshots
[screenshots here]

## API Documentation
[link to API docs]

## Contributing
See CONTRIBUTING.md

## License
MIT
```

#### CONTRIBUTING.md
```markdown
# Contributing

## Development Setup
1. Clone the repo
2. Install dependencies: `npm install`
3. Copy .env.example to .env
4. Run database migrations: `npm run db:migrate`
5. Start development server: `npm run dev`

## Development Workflow
1. Create a branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Write/update tests
4. Push and create a PR
5. Wait for review

## Code Style
- We use ESLint + Prettier
- Run `npm run lint` before committing
- Pre-commit hooks will check automatically

## Commit Messages
We follow Conventional Commits:
- feat: New feature
- fix: Bug fix
- docs: Documentation
- test: Testing
- refactor: Code restructuring
```

#### CHANGELOG.md
```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- [new things in development]

## [1.0.0] - 2024-01-15
### Added
- Initial release
- User authentication
- Basic CRUD operations
```

---

## 7. Quality Gates

### Before Every Commit
- [ ] Code compiles/runs without errors
- [ ] No linting warnings
- [ ] Related tests pass

### Before Every PR
- [ ] All tests pass
- [ ] Code is self-reviewed
- [ ] PR description is complete
- [ ] Related issue is linked

### Before Every Release
- [ ] All tests pass
- [ ] Manual smoke test done
- [ ] CHANGELOG updated
- [ ] Version number bumped
- [ ] Documentation updated

---

## 8. Learning & Growth Tracking

### Skills Matrix (Update Monthly)
```markdown
| Skill | Level (1-5) | Goal | Action |
|-------|-------------|------|--------|
| Java | 3 | 4 | Complete design patterns project |
| Git | 2 | 4 | Use PRs for all projects |
| Testing | 1 | 3 | Add tests to current project |
| CI/CD | 1 | 3 | Set up GitHub Actions |
| Docker | 0 | 2 | Dockerize one project |
| SQL | 3 | 4 | Practice complex queries |
```

### Project Post-Mortem (After Each Project)
```markdown
## Project: [Name]
## Duration: [Start] to [End]

### What I Built
[Brief description]

### What I Learned
1. [Technical skill]
2. [Process improvement]
3. [Tool/framework knowledge]

### What I Would Do Differently
1. [Thing to change]
2. [Thing to change]

### Skills Improved
- [Skill]: [from level X] → [to level Y]

### Portfolio Value
- GitHub link: [url]
- Demo link: [url]
- Key talking points for interviews:
  1. [interesting challenge you solved]
  2. [technology decision you made and why]
```
