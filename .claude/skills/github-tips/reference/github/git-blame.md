# Git Blame + Ignore Revs

## Rule
Use `.git-blame-ignore-revs` to skip formatting commits in blame view.

## Setup
```bash
# Create the ignore file
echo "# Prettier formatting commit" >> .git-blame-ignore-revs
echo "abc123def456" >> .git-blame-ignore-revs

# Configure Git to use it locally
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## File Format
```
# .git-blame-ignore-revs

# Prettier formatting (2024-01-15)
abc123def456789abc123def456789abc123de

# ESLint autofix (2024-02-20)
def456789abc123def456789abc123def456789

# Tabs to spaces migration (2024-03-01)
789abc123def456789abc123def456789abc123
```

## Usage
```bash
# Standard blame
git blame src/main.js

# Blame ignoring specific commits
git blame --ignore-rev abc123 src/main.js

# Blame using the ignore file
git blame --ignore-revs-file .git-blame-ignore-revs src/main.js
```

## GitHub Native Support
GitHub automatically detects `.git-blame-ignore-revs` in your repo root and applies it to the Blame view on the website. No configuration needed.

## Why
After running Prettier/ESLint/formatting on the whole project, `git blame` shows the formatter as the author of every line. With `.git-blame-ignore-revs`, blame skips those commits and shows the real author. GitHub supports this natively.
