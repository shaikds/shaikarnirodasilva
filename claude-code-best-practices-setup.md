# Claude Code Setup - המבנה ש-90% מהאנשים מפספסים

> רוב המפתחים שמים הכל ב-CLAUDE.md אחד ומקווים לטוב.
> הנה המבנה המלא שהופך את Claude למכונה מכוילת.

---

## המבנה המלא

```
project/
├── CLAUDE.md                          # 1. ליבה - קצר וממוקד
├── CLAUDE.local.md                    # 2. אישי - לא ב-git
│
├── .claude/
│   ├── settings.json                  # 3. הרשאות + MCP servers
│   ├── settings.local.json            # 4. הגדרות אישיות (gitignored)
│   │
│   ├── rules/                         # 5. כללים מודולריים
│   │   ├── code-style.md              #    תמיד נטען
│   │   ├── security.md                #    תמיד נטען
│   │   ├── react-components.md        #    נטען רק עם קבצי tsx
│   │   ├── api-design.md              #    נטען רק עם קבצי api/
│   │   └── database.md               #    נטען רק עם קבצי db/
│   │
│   ├── agents/                        # 6. סוכני משנה מותאמים
│   │   ├── reviewer.md
│   │   ├── debugger.md
│   │   └── researcher.md
│   │
│   └── hooks/                         # 7. אוטומציה דטרמיניסטית
│       ├── format-on-save.sh
│       └── protect-files.sh
│
├── docs/                              # 8. מיובא דרך @syntax
│   ├── architecture.md
│   └── api-conventions.md
│
└── packages/                          # 9. מונוריפו - כל חבילה עם CLAUDE.md
    ├── frontend/CLAUDE.md             #    נטען עצלנית
    └── backend/CLAUDE.md              #    נטען עצלנית
```

---

## שכבה 1: CLAUDE.md - הליבה (מקסימום 50 שורות!)

**הטעות הנפוצה:** לדחוס 500 שורות לקובץ אחד. Claude קורא את הכל בכל סשן = בזבוז הקשר.

```markdown
# Project: My App

## Build & Test
- Build: `npm run build`
- Test: `npm test -- --watch`
- Lint: `npm run lint`

## Architecture
@docs/architecture.md

## API Conventions
@docs/api-conventions.md

## Git
- Commit messages in English, imperative mood
- Never force push to main
- PR required for all changes

## Compact Instructions
<!-- CRITICAL: This section survives /compact -->
- Build: `npm run build`
- Test: `npm test`
- Main entry: src/index.ts
- DB: PostgreSQL via Prisma
```

**למה זה עובד:**
- `@docs/architecture.md` - מייבא קבצים במקום לכפול תוכן
- `Compact Instructions` - שורד דחיסת הקשר
- HTML comments (`<!-- -->`) - נמחקים לפני הטעינה, חוסכים טוקנים

---

## שכבה 2: .claude/rules/ - הסוד שרוב האנשים לא מכירים

**בלי paths:** נטען תמיד בתחילת סשן
**עם paths:** נטען רק כשעובדים עם קבצים תואמים (חיסכון הקשר!)

### כלל גלובלי (תמיד פעיל):
```markdown
<!-- .claude/rules/code-style.md -->
# Code Style

- TypeScript strict mode
- 2-space indentation
- No `any` types
- Prefer `const` over `let`
- No default exports
```

### כלל ממוקד path (נטען רק כשצריך):
```markdown
<!-- .claude/rules/react-components.md -->
---
paths:
  - "src/components/**/*.tsx"
  - "src/components/**/*.css"
---

# React Component Rules

- Functional components only
- Props interface must be exported
- Use CSS Modules, not inline styles
- Every component needs a unit test in __tests__/
- Use React.memo() for list items
```

### כלל API:
```markdown
<!-- .claude/rules/api-design.md -->
---
paths:
  - "src/api/**/*.ts"
  - "src/routes/**/*.ts"
---

# API Design Rules

- All endpoints return { data, error, meta }
- Input validation with Zod schemas
- Rate limiting on public endpoints
- Log all 5xx errors
- Never expose internal IDs - use UUIDs
```

### כלל DB:
```markdown
<!-- .claude/rules/database.md -->
---
paths:
  - "prisma/**"
  - "src/db/**/*.ts"
---

# Database Rules

- All migrations must be reversible
- Never DROP TABLE without backup plan
- Index foreign keys
- Use transactions for multi-table writes
- Soft delete (deletedAt) not hard delete
```

---

## שכבה 3: settings.json - הרשאות, MCPs, ו-Hooks

```json
{
  "permissions": {
    "allow": [
      "Bash(npm *)",
      "Bash(npx *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Read",
      "Glob",
      "Grep"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(sudo *)",
      "Bash(git push --force *)"
    ]
  },

  "mcp_servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./docs"]
    }
  },

  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$CLAUDE_FILE_PATH\" 2>/dev/null || true"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"$CLAUDE_FILE_PATH\" | grep -qE '\\.(env|pem|key)$' && echo 'BLOCKED: sensitive file' >&2 && exit 2 || true"
          }
        ]
      }
    ]
  }
}
```

---

## שכבה 4: Custom Agents - סוכני משנה מותאמים

### Code Reviewer Agent:
```yaml
<!-- .claude/agents/reviewer.md -->
---
name: code-reviewer
description: Thorough code review for security, tests, and performance
allowed-tools: Read Grep Glob
---

# Code Review Protocol

For each file changed:
1. **Security** - Check for injection, XSS, auth bypass
2. **Tests** - Verify coverage for new logic
3. **Performance** - Flag N+1 queries, unnecessary re-renders
4. **Style** - Match project conventions

Output format:
- CRITICAL: Must fix before merge
- WARNING: Should fix
- SUGGESTION: Nice to have

Never approve code you haven't fully read.
```

### Debugger Agent:
```yaml
<!-- .claude/agents/debugger.md -->
---
name: debugger
description: Systematic bug investigation
allowed-tools: Read Grep Glob Bash
---

# Debug Protocol

1. Reproduce - Find the minimal reproduction
2. Isolate - Binary search for the cause
3. Understand - Why does this happen?
4. Fix - Minimal change that resolves root cause
5. Verify - Prove the fix works

NEVER guess. Always read the code first.
Log your reasoning at each step.
```

---

## שכבה 5: CLAUDE.local.md - הגדרות אישיות (gitignored)

```markdown
<!-- CLAUDE.local.md - not committed -->

# My Local Setup
- Local API: http://localhost:3000
- Local DB: postgresql://localhost:5432/myapp_dev
- I prefer verbose explanations
- Always show me the diff before committing
- Use Hebrew for comments in my personal branches
```

---

## הטריקים ש-90% מפספסים

### 1. HTML Comments = אפס טוקנים
```markdown
<!-- This is for humans reading the file. Claude never sees it. -->
<!-- Saves tokens! Use for maintainer notes. -->
```

### 2. Compact Instructions - שורד דחיסה
```markdown
## Compact Instructions
Build: npm run build | Test: npm test | DB: Prisma + PostgreSQL
Entry: src/index.ts | API: src/api/ | UI: src/components/
```
כשהשיחה נדחסת, Claude קורא מחדש את CLAUDE.md. הסקשן הזה שומר את ההקשר הקריטי.

### 3. @import - לא לכפול תוכן
```markdown
@docs/architecture.md    # מייבא inline
@README.md               # מייבא inline
@package.json            # Claude רואה את הפקודות
```
עד 5 רמות עומק. נתיב יחסי לקובץ המייבא.

### 4. Path-scoped rules = חיסכון הקשר מטורף
```markdown
---
paths:
  - "src/components/**/*.tsx"
---
```
Claude לא טוען את הכלל הזה עד שהוא נוגע בקובץ tsx. במונוריפו גדול זה חוסך אלפי טוקנים.

### 5. Hooks != CLAUDE.md
| | CLAUDE.md | Hooks |
|---|---|---|
| **מי מפעיל** | Claude (לא דטרמיניסטי) | המערכת (דטרמיניסטי) |
| **אמינות** | Claude יכול "לשכוח" | תמיד רץ |
| **שימוש** | הנחיות, סגנון, ארכיטקטורה | פורמט אוטומטי, חסימת קבצים, CI |

**הכלל:** אם אתה **חייב** שזה יקרה - שים ב-Hook. אם אתה **מעדיף** - שים ב-CLAUDE.md.

### 6. Monorepo Lazy Loading
```
packages/
  frontend/CLAUDE.md    # נטען רק כש-Claude קורא קבצים ב-frontend/
  backend/CLAUDE.md     # נטען רק כש-Claude קורא קבצים ב-backend/
  shared/CLAUDE.md      # נטען רק כש-Claude קורא קבצים ב-shared/
```

### 7. Symlinks לכללים משותפים
```bash
# שתף כללים בין פרויקטים
ln -s ~/my-claude-rules/security.md .claude/rules/security.md
ln -s ~/my-claude-rules/code-style.md .claude/rules/code-style.md
```

### 8. claudeMdExcludes - התעלם מקבצים לא רלוונטיים
```json
// .claude/settings.local.json
{
  "claudeMdExcludes": [
    "**/node_modules/**/CLAUDE.md",
    "**/other-team/CLAUDE.md"
  ]
}
```

---

## סדר העדיפויות (מהגבוה לנמוך)

```
1. Managed Policy    /etc/claude-code/CLAUDE.md     (ארגוני - לא ניתן לדריסה)
2. Project           ./CLAUDE.md                     (צוותי - ב-git)
3. User              ~/.claude/CLAUDE.md             (אישי - כל הפרויקטים)
4. Local             ./CLAUDE.local.md               (אישי - פרויקט זה)
5. Rules (global)    .claude/rules/*.md              (נטען בהתחלה)
6. Rules (scoped)    .claude/rules/*.md + paths      (נטען לפי צורך)
7. Subdir            packages/x/CLAUDE.md            (lazy loaded)
```

---

## TL;DR

1. **CLAUDE.md** - קצר (50 שורות), עם @imports ו-Compact Instructions
2. **rules/** - כללים מודולריים, עם paths לחיסכון הקשר
3. **settings.json** - הרשאות, MCPs, hooks
4. **agents/** - סוכנים מותאמים עם כלים מוגבלים
5. **CLAUDE.local.md** - הגדרות אישיות לא ב-git
6. **Hooks** - לדברים שחייבים לקרות (פורמט, חסימה)
7. **CLAUDE.md** - לדברים שמעדיפים שיקרו (סגנון, ארכיטקטורה)
