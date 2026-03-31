# New Project Quick Start Checklist

## When Starting a New Project, Follow These Steps:

### Phase 0: Planning (Before Writing Code) - 1 Hour
- [ ] Write a project kickoff document (see PROJECT_MANAGEMENT.md)
- [ ] Define MVP - what are the 3-5 MUST-HAVE features?
- [ ] Choose tech stack and document WHY (write an ADR)
- [ ] Draw a simple architecture diagram (even on paper)
- [ ] Break down MVP into GitHub Issues

### Phase 1: Infrastructure Setup - 30 Minutes
- [ ] Create GitHub repository
- [ ] Copy this PROJECT_TEMPLATE into the new repo
- [ ] Set up `.gitignore` (customize from template)
- [ ] Set up `.env.example` (customize for project)
- [ ] Create initial `README.md`
- [ ] Set up branch protection rules on GitHub
  - Require PRs for main
  - Require status checks to pass
- [ ] Create a GitHub Project board (Kanban)
- [ ] Set up labels on the repo (see label system in WORKFLOW_GUIDE.md)
- [ ] Create V1.0 milestone

### Phase 2: Development Environment - 30 Minutes
- [ ] Set up linter for your language
- [ ] Set up formatter for your language
- [ ] Set up `.editorconfig`
- [ ] Set up pre-commit hooks
- [ ] Customize `Makefile` commands for your stack
- [ ] Customize CI/CD workflow (`.github/workflows/ci.yml`)
- [ ] Verify `make check` works (lint + test)

### Phase 3: Project Structure - 30 Minutes
- [ ] Create the folder structure:
  ```
  src/
  ├── models/
  ├── services/
  ├── controllers/
  ├── repositories/
  ├── utils/
  └── config/
  tests/
  ├── unit/
  ├── integration/
  └── fixtures/
  docs/
  ```
- [ ] Add a "hello world" endpoint/page to verify stack works
- [ ] Write first test to verify testing framework works
- [ ] Create first PR: "chore: initial project setup"

### Phase 4: Start Building! - The Fun Part
- [ ] Pick Issue #1 from your Kanban board
- [ ] Create feature branch: `feature/1-first-feature`
- [ ] Develop with small, logical commits
- [ ] Push and create PR
- [ ] Self-review, merge, celebrate!

---

## The "Never Forget" Rules

1. **NEVER commit directly to main** - always use branches + PRs
2. **NEVER commit secrets** - use `.env` files, check `.gitignore`
3. **NEVER push broken code** - run `make check` before pushing
4. **ALWAYS write meaningful commit messages** - use conventional commits
5. **ALWAYS break big tasks into small issues** - max 4 hours each
6. **ALWAYS push your work daily** - GitHub is your backup
7. **ALWAYS self-review your PRs** - catch bugs before they merge
8. **ALWAYS update documentation** - future you will thank present you

---

## Copy-Paste Commands for New Project

```bash
# ============================
# Create new project from template
# ============================

# 1. Create repo on GitHub first, then:
git clone https://github.com/shaikds/NEW_PROJECT_NAME.git
cd NEW_PROJECT_NAME

# 2. Copy template files
cp -r ~/shaikarnirodasilva/PROJECT_TEMPLATE/* .
cp -r ~/shaikarnirodasilva/PROJECT_TEMPLATE/.* . 2>/dev/null

# 3. Initialize
git checkout -b feature/1-initial-setup
make install
cp .env.example .env

# 4. Customize these files:
#    - README.md (project description)
#    - CLAUDE.md (project-specific instructions)
#    - .gitignore (add language-specific patterns)
#    - .github/workflows/ci.yml (uncomment your stack)
#    - Makefile (configure commands for your stack)
#    - .env.example (project-specific variables)

# 5. First commit & PR
git add .
git commit -m "chore: initial project setup with infrastructure template"
git push -u origin feature/1-initial-setup
# Create PR on GitHub → Self-review → Merge
```
