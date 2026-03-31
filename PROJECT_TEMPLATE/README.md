# Project Template - Infrastructure & Best Practices

## Quick Start

```bash
# 1. Clone this template into your new project
cp -r PROJECT_TEMPLATE/ ~/my-new-project/
cd ~/my-new-project/

# 2. Initialize git
git init
git remote add origin https://github.com/shaikds/my-new-project.git

# 3. Install dependencies (choose your stack)
# For Node.js:
npm install
# For Python:
pip install -r requirements.txt
# For Java/Maven:
mvn install

# 4. Set up pre-commit hooks
cp .githooks/* .git/hooks/
chmod +x .git/hooks/*

# 5. Create your first branch and start working
git checkout -b feature/initial-setup
```

## What's Included

| File/Folder | Purpose |
|---|---|
| `docs/BOTTLENECKS.md` | Common bottlenecks in dev projects & how to avoid them |
| `docs/WORKFLOW_GUIDE.md` | Complete development workflow (branches, PRs, reviews) |
| `docs/CODE_REVIEW_CHECKLIST.md` | Checklist for reviewing code like a pro |
| `docs/PROJECT_MANAGEMENT.md` | How to manage a project solo like a team |
| `docs/GIT_GUIDE.md` | Complete Git workflow guide with examples |
| `docs/ARCHITECTURE_DECISION_RECORDS.md` | Template for documenting architecture decisions |
| `.github/ISSUE_TEMPLATE/` | GitHub issue templates (bug, feature, task) |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR template with checklist |
| `.github/workflows/` | CI/CD pipeline templates |
| `.gitignore` | Comprehensive gitignore |
| `CLAUDE.md` | Instructions for AI-assisted development |
| `Makefile` | Common commands shortcut |
| `.editorconfig` | Consistent coding style across editors |
| `.pre-commit-config.yaml` | Pre-commit hooks configuration |

## Philosophy

This template follows the principle: **"Work like you're in a team, even when you're solo."**

Why? Because:
1. You build habits that transfer directly to industry
2. Your projects become maintainable and professional
3. You can onboard collaborators instantly
4. Your GitHub profile shows engineering maturity to recruiters
