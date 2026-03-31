# Client Project Setup Guide

Step-by-step process for creating a new client project repository.

---

## Step 1: Create Repository

### Naming Convention
```
client-{clientname}-{projecttype}

Examples:
  client-acme-dashboard
  client-startup-mvp
  client-clinic-booking
  client-retail-automation
```

### On GitHub
1. Go to github.com/shaikds → New Repository
2. Name: `client-{name}-{project}`
3. Visibility: **Private**
4. Initialize with README: No (we'll push our template)
5. Create repository

---

## Step 2: Initialize from Template

```bash
# Clone the empty repo
git clone https://github.com/shaikds/client-{name}-{project}.git
cd client-{name}-{project}

# Copy client project template
cp -r ~/shaikarnirodasilva/agency/client-project-template/* .
cp -r ~/shaikarnirodasilva/agency/client-project-template/.* . 2>/dev/null

# Customize
# Edit README.md - Add client project details
# Edit CLAUDE.md - Add project-specific instructions
# Edit .env.example - Add project-specific variables
# Edit .github/workflows/ci.yml - Uncomment relevant stack

# Initial commit
git add .
git commit -m "chore: initial project setup from SilvA.i template"
git push -u origin main
```

---

## Step 3: Branch Protection

Go to: Repository → Settings → Branches → Add rule

For `main` branch:
- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
- [x] Include administrators

---

## Step 4: Set Up Project Board

1. Repository → Projects → New Project → Board
2. Create columns:
   - **Backlog**
   - **Sprint** (this week)
   - **In Progress** (WIP limit: 2)
   - **In Review** (PRs)
   - **Done**

---

## Step 5: Create Issues

Based on the project scope, create issues following this pattern:

```
Title: feat: [short description]
Labels: feature + P1-important (or P0/P2)
Milestone: V1.0

Body:
## Description
[What needs to be built]

## Acceptance Criteria
- [ ] [Specific requirement]
- [ ] [Specific requirement]

## Estimation: [S/M/L]
```

### Standard issues for every project:
```
#1  chore: Initial project setup and infrastructure     [S]
#2  feat: Database models and migrations                [S-M]
#3  feat: Authentication system                         [M]
#4  feat: [Core feature 1]                             [M-L]
#5  feat: [Core feature 2]                             [M-L]
#6  feat: [Core feature 3]                             [M]
#7  test: Write test suite                             [M]
#8  chore: CI/CD pipeline configuration                [S]
#9  chore: Production deployment                       [S-M]
#10 docs: Documentation and handoff preparation        [S]
```

---

## Step 6: Environment Setup

```bash
# Create .env from template
cp .env.example .env

# Fill in actual values (NEVER commit .env)
# Verify it's gitignored:
grep ".env" .gitignore

# Install dependencies
make install  # or: npm install / pip install -r requirements.txt

# Verify everything works
make dev      # Start dev server
make test     # Run tests
make lint     # Run linter
```

---

## Step 7: If Converting No-Code Export

```bash
# 1. Get the export/code from client
# 2. Put it in the repo (or create new branch)
git checkout -b feature/1-initial-setup

# 3. Run the audit
# Follow NOCODE_TO_PRODUCTION_PIPELINE.md Phase A

# 4. Set up infrastructure around it
# Add: .gitignore, CI/CD, linting, testing framework

# 5. Create PR
git push -u origin feature/1-initial-setup
# Create PR → Self-review → Merge
```

---

## Step 8: Invite Client (If Needed)

If client wants visibility into the repo:
1. Repository → Settings → Collaborators
2. Add client's GitHub username
3. Set role to **Read** (they can see, not edit)

Or set up a staging URL they can check instead.

---

## Checklist

- [ ] Repository created with correct naming
- [ ] Template files copied and customized
- [ ] Branch protection enabled
- [ ] Project board created with columns
- [ ] V1.0 milestone created
- [ ] Issues created for all scope items
- [ ] .env.example configured
- [ ] CI/CD pipeline configured
- [ ] First commit pushed
- [ ] Client communication channel set up
