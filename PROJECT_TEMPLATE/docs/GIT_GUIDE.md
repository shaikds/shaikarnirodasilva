# Git Complete Guide - From Basics to Professional Workflows

## Table of Contents
1. [Git Basics Refresher](#git-basics-refresher)
2. [Professional Git Workflow](#professional-git-workflow)
3. [Git Commands Cheat Sheet](#git-commands-cheat-sheet)
4. [Conflict Resolution](#conflict-resolution)
5. [Git Best Practices](#git-best-practices)
6. [Advanced Git Techniques](#advanced-git-techniques)
7. [Common Mistakes & How to Fix Them](#common-mistakes--how-to-fix-them)

---

## Git Basics Refresher

### The Three States of Git
```
Working Directory    →   Staging Area    →   Repository
(your files)         (git add)           (git commit)
                     (index)             (.git directory)

     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ Modified  │───▶│  Staged  │───▶│Committed │
     │  Files    │    │  Files   │    │  Files   │
     └──────────┘    └──────────┘    └──────────┘
          ▲                               │
          └───────────────────────────────┘
                  (checkout / reset)
```

### Basic Flow
```bash
# Initialize a new repository
git init

# Clone an existing repository
git clone https://github.com/user/repo.git

# Check what's changed
git status

# Stage specific files
git add src/main.js src/utils.js

# Stage all changes in a directory
git add src/

# Commit with a message
git commit -m "feat(auth): add login validation"

# Push to remote
git push -u origin feature/my-feature

# Pull latest changes
git pull origin main
```

---

## Professional Git Workflow

### Starting a New Feature
```bash
# 1. Make sure you're on an updated main
git checkout main
git pull origin main

# 2. Create a new feature branch
git checkout -b feature/42-user-authentication

# 3. Work on your feature, making logical commits
#    ... write code ...
git add src/auth/login.js
git commit -m "feat(auth): add login form component"

#    ... write more code ...
git add src/auth/validation.js test/auth/validation.test.js
git commit -m "feat(auth): add input validation with tests"

#    ... write more code ...
git add src/auth/api.js
git commit -m "feat(auth): connect login to backend API"

# 4. Push your branch
git push -u origin feature/42-user-authentication

# 5. Create PR on GitHub (via browser or gh CLI)

# 6. After PR is approved and merged, clean up
git checkout main
git pull origin main
git branch -d feature/42-user-authentication
```

### Keeping Your Branch Updated
```bash
# Option 1: Rebase (PREFERRED - clean history)
git fetch origin main
git rebase origin/main
# If conflicts: resolve them, then:
git add .
git rebase --continue
# Push (need force because rebase rewrites history)
git push --force-with-lease

# Option 2: Merge (simpler but messier history)
git fetch origin main
git merge origin/main
# If conflicts: resolve them, then:
git add .
git commit -m "merge: update from main"
git push
```

### When to Rebase vs Merge
| Scenario | Use |
|----------|-----|
| Updating feature branch from main | Rebase |
| Merging feature into main (via PR) | Squash & Merge |
| Shared branch multiple people work on | Merge |
| Personal branch only you use | Rebase |

---

## Git Commands Cheat Sheet

### Daily Commands
```bash
# Status & Info
git status                          # What's changed?
git log --oneline -10               # Last 10 commits
git log --oneline --graph --all     # Visual branch history
git diff                            # See unstaged changes
git diff --staged                   # See staged changes
git diff main..feature/x            # Difference between branches

# Branching
git branch                          # List local branches
git branch -a                       # List all branches (incl. remote)
git checkout -b feature/new         # Create and switch to new branch
git checkout main                   # Switch to main
git branch -d feature/done          # Delete merged branch
git branch -D feature/abandoned     # Force delete unmerged branch

# Staging & Committing
git add file.js                     # Stage specific file
git add src/                        # Stage directory
git add -p                          # Stage interactively (patch mode)
git commit -m "type: message"       # Commit with message
git commit --amend                  # Modify last commit message

# Remote Operations
git push -u origin branch-name      # Push and set upstream
git push                            # Push (after upstream is set)
git push --force-with-lease         # Force push safely (after rebase)
git pull origin main                # Pull from remote
git fetch origin                    # Fetch without merging

# Stashing (save work temporarily)
git stash                           # Save uncommitted changes
git stash pop                       # Restore stashed changes
git stash list                      # List all stashes
git stash drop                      # Delete most recent stash
```

### Information Commands
```bash
# See who changed what
git blame src/main.js               # Who wrote each line?
git log --follow src/main.js        # History of a specific file
git log --author="Shaik"            # Commits by specific author
git log --since="2024-01-01"        # Commits after date
git log --grep="auth"               # Search commit messages

# Compare
git diff HEAD~3..HEAD               # Last 3 commits' changes
git diff branch1..branch2           # Difference between branches
git log main..feature/x --oneline   # Commits in feature not in main
```

---

## Conflict Resolution

### Understanding Conflicts
```
When Git can't automatically merge:

<<<<<<< HEAD (your changes)
function login(email, password) {
    return api.post('/auth/login', { email, password });
}
=======
function login(username, pass) {
    return api.post('/api/login', { username, pass });
}
>>>>>>> feature/new-auth (incoming changes)
```

### Step-by-Step Conflict Resolution
```bash
# 1. You'll see conflicts during rebase/merge
git rebase origin/main
# CONFLICT in src/auth.js

# 2. Open the conflicting file and look for markers
#    <<<<<<< HEAD
#    (your version)
#    =======
#    (their version)
#    >>>>>>> 

# 3. Choose the correct version (or combine both)
#    Remove ALL conflict markers (<<<<, ====, >>>>)
#    Keep the code that should survive

# 4. Stage the resolved file
git add src/auth.js

# 5. Continue the rebase/merge
git rebase --continue    # if rebasing
git commit               # if merging

# 6. Push
git push --force-with-lease  # if rebased
git push                     # if merged
```

### Conflict Prevention
1. **Keep branches short-lived** - merge within 1-3 days
2. **Pull from main frequently** - daily rebase
3. **Communicate** - if working with others, coordinate who edits what
4. **Small PRs** - less code changed = fewer conflicts

### Using a Merge Tool (Visual)
```bash
# Configure a merge tool
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'

# When conflict occurs:
git mergetool
# Opens visual tool to resolve conflicts
```

---

## Git Best Practices

### Commit Message Format (Conventional Commits)
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Complete Example:**
```
feat(auth): add password strength indicator

Add a real-time password strength indicator to the registration
form. Uses zxcvbn library for accurate strength estimation.
Shows visual feedback (weak/fair/strong) as user types.

Closes #42
```

### What Makes a Good Commit

#### Good Commits
```bash
git commit -m "feat(cart): add quantity validation on checkout"
git commit -m "fix(auth): handle expired JWT tokens gracefully"
git commit -m "refactor(db): extract connection pool to separate module"
git commit -m "test(payment): add integration tests for Stripe webhook"
git commit -m "docs(api): add OpenAPI spec for user endpoints"
```

#### Bad Commits
```bash
git commit -m "fix"
git commit -m "update"
git commit -m "WIP"
git commit -m "changes"
git commit -m "asdfgh"
git commit -m "fixed a thing and also added some stuff and refactored"
```

### Atomic Commits
Each commit should be ONE logical change:

```bash
# BAD: One giant commit
git add .
git commit -m "add user authentication, fix cart bug, update readme"

# GOOD: Separate logical commits
git add src/auth/
git commit -m "feat(auth): add login/register endpoints"

git add src/cart/total.js test/cart/total.test.js
git commit -m "fix(cart): correct total calculation for discounts"

git add README.md
git commit -m "docs: update setup instructions"
```

### .gitignore Best Practices
```gitignore
# Dependencies
node_modules/
vendor/
__pycache__/
.gradle/

# Build outputs
dist/
build/
target/
*.class
*.jar

# Environment & secrets
.env
.env.local
.env.production
*.pem
*.key
credentials.json

# IDE
.idea/
.vscode/
*.swp
*.swo
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.pytest_cache/
```

---

## Advanced Git Techniques

### Interactive Rebase (Clean Up Before PR)
```bash
# Squash last 4 commits into 1
git rebase -i HEAD~4

# In the editor that opens:
pick abc1234 feat(auth): start login implementation
squash def5678 WIP: more login work
squash ghi9012 fix typo
squash jkl3456 finish login

# Save → Edit the combined commit message → Save
# Result: One clean commit instead of 4 messy ones
```

### Cherry-Pick (Copy a Specific Commit)
```bash
# Copy a commit from another branch
git cherry-pick abc1234

# Useful when:
# - A fix on branch A is also needed on branch B
# - You committed to the wrong branch
```

### Bisect (Find Which Commit Broke Something)
```bash
# Find the commit that introduced a bug
git bisect start
git bisect bad                  # Current commit is broken
git bisect good v1.0            # This version worked

# Git will checkout commits in between
# Test each one, then tell git:
git bisect good    # or
git bisect bad

# Git will narrow down to the exact commit that broke it
git bisect reset   # Go back to normal
```

### Reflog (Recover Lost Work)
```bash
# See ALL recent actions (even deleted commits)
git reflog

# Recover a commit you accidentally deleted
git checkout abc1234

# Undo a bad rebase
git reflog
# Find the commit before the rebase
git reset --hard HEAD@{5}
```

### Worktrees (Work on Multiple Branches Simultaneously)
```bash
# Instead of stashing, create a separate working directory
git worktree add ../project-hotfix hotfix/critical-bug

# Now you have two directories:
# ./project          → feature/current-work
# ../project-hotfix  → hotfix/critical-bug

# Clean up when done
git worktree remove ../project-hotfix
```

---

## Common Mistakes & How to Fix Them

### "I committed to the wrong branch"
```bash
# Option 1: Move last commit to correct branch
git checkout correct-branch
git cherry-pick wrong-branch
git checkout wrong-branch
git reset --hard HEAD~1
```

### "I need to undo my last commit"
```bash
# Keep changes, just undo the commit
git reset --soft HEAD~1

# Undo commit AND unstage changes
git reset HEAD~1

# Undo commit AND discard changes (DANGEROUS)
git reset --hard HEAD~1
```

### "I accidentally staged a file"
```bash
git reset HEAD secret.env
```

### "I need to change my last commit message"
```bash
git commit --amend -m "correct message here"
# Only do this if you haven't pushed yet!
```

### "I pushed a secret to GitHub"
```bash
# 1. Remove from history (requires force push)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch path/to/secret.env' \
  --prune-empty --tag-name-filter cat -- --all
git push --force-with-lease

# 2. IMMEDIATELY rotate the secret (new password, new API key)
# The old one is compromised even if removed from Git

# 3. Add to .gitignore to prevent recurrence
echo "secret.env" >> .gitignore
```

### "My branch is way behind main and full of conflicts"
```bash
# Nuclear option: recreate branch with your changes
git checkout main
git pull origin main
git checkout -b feature/42-v2  # New branch from updated main

# Cherry-pick your important commits from old branch
git cherry-pick abc1234 def5678 ghi9012

# Delete the old messy branch
git branch -D feature/42-old
```

### "I want to undo a merge"
```bash
# If not pushed yet
git reset --hard HEAD~1

# If already pushed (creates a new commit that undoes the merge)
git revert -m 1 <merge-commit-hash>
```

---

## Git Aliases (Productivity Shortcuts)

Add these to `~/.gitconfig`:
```ini
[alias]
    # Short commands
    s = status
    co = checkout
    br = branch
    ci = commit
    
    # Useful shortcuts
    new = checkout -b
    last = log -1 HEAD
    unstage = reset HEAD --
    
    # Pretty log
    lg = log --oneline --graph --all --decorate
    
    # Show what I did today
    today = log --since=midnight --author='Your Name' --oneline
    
    # Quick amend (no message change)
    amend = commit --amend --no-edit
    
    # Delete merged branches
    cleanup = "!git branch --merged | grep -v '\\*\\|main\\|master' | xargs -n 1 git branch -d"
```

Usage:
```bash
git s           # instead of: git status
git new my-feat # instead of: git checkout -b my-feat
git lg          # beautiful log graph
git today       # what did I commit today?
git cleanup     # delete all merged branches
```
