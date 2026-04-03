# .gitattributes

## Rule
Configure `.gitattributes` for consistent line endings, binary handling, and language stats.

## Code
```
# .gitattributes

# Auto-detect text files and normalize line endings
* text=auto

# Force LF for shell scripts (even on Windows)
*.sh text eol=lf
*.bash text eol=lf

# Force CRLF for Windows batch files
*.bat text eol=crlf
*.cmd text eol=crlf

# Mark binary files (no diff, no merge)
*.png binary
*.jpg binary
*.gif binary
*.ico binary
*.pdf binary
*.zip binary
*.jar binary
*.woff binary
*.woff2 binary
*.ttf binary

# Suppress noisy diffs for lock files
package-lock.json -diff
yarn.lock -diff
pnpm-lock.yaml -diff

# Linguist: fix language stats on GitHub
docs/**            linguist-documentation
vendor/**          linguist-vendored
*.min.js           linguist-generated
*.min.css          linguist-generated
dist/**            linguist-generated
build/**           linguist-generated
```

## Why
- `text=auto` prevents line ending issues across Windows/Mac/Linux
- `binary` prevents Git from corrupting images and fonts
- `-diff` on lock files removes thousands of noisy lines from PRs
- `linguist-*` fixes GitHub language stats (your repo won't show as "99% JavaScript" because of minified files)
