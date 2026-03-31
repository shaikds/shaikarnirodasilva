# No-Code → Production Pipeline

Complete process for taking a Base44/Lovable/no-code export to production quality.

---

## Overview

```
Export → Audit → Setup → Security → Code Quality → Testing → Performance → SEO → Deploy → Monitor
  1       2       3        4            5             6          7          8      9       10
```

**Typical timeline:** 3-6 weeks
**Typical effort:** 60-120 hours

---

## Phase A: Export & Audit (Day 1-2)

### Step 1: Get the Export
```bash
# Base44: Export from dashboard → Download ZIP
# Lovable: Connect to GitHub → Clone repo
# Other: Get source code access from client

git clone <client-repo-or-extract-zip>
cd project
```

### Step 2: Initial Audit
Complete [TECHNICAL_ASSESSMENT.md](../onboarding/TECHNICAL_ASSESSMENT.md) systematically.

**Quick diagnostic commands:**
```bash
# Check project size and structure
find . -type f | wc -l                    # Total files
find . -name "*.js" -o -name "*.ts" | wc -l  # Code files
du -sh node_modules/ 2>/dev/null          # Dependencies size

# Check for secrets in code
grep -r "sk-" --include="*.js" --include="*.ts" .
grep -r "password" --include="*.js" --include="*.ts" .
grep -r "api_key" --include="*.env*" .

# Check for security vulnerabilities
npm audit 2>/dev/null
pip audit 2>/dev/null

# Check if it builds
npm run build 2>/dev/null || echo "BUILD FAILED"
```

### Step 3: Document Findings
Create `docs/AUDIT_REPORT.md` with:
- Critical issues (must fix before launch)
- Important issues (should fix)
- Nice-to-have improvements
- Estimated hours per category

---

## Phase B: Infrastructure Setup (Day 2-3)

### Step 4: Git & CI/CD
```bash
# If not already in Git
git init
git remote add origin <new-repo-url>

# Copy standard configs from client-project-template
cp -r ~/shaikarnirodasilva/agency/client-project-template/.github .
cp ~/shaikarnirodasilva/agency/client-project-template/.gitignore .
cp ~/shaikarnirodasilva/agency/client-project-template/Makefile .
cp ~/shaikarnirodasilva/agency/client-project-template/.editorconfig .

# Set up branch protection on GitHub
# Settings → Branches → Add rule for "main"
```

### Step 5: Environment Setup
```bash
# Create .env.example with all needed variables
# Create .env (NEVER commit)
# Verify .gitignore includes .env

# Check: is .env in .gitignore?
grep ".env" .gitignore || echo "WARNING: .env not in .gitignore!"
```

### Step 6: Linting & Formatting
```bash
# For JavaScript/TypeScript:
npm install -D eslint prettier
npx eslint --init

# For Python:
pip install ruff
# Create ruff.toml

# Run initial format
npx prettier --write "**/*.{js,ts,jsx,tsx}"  # JS
ruff format .                                 # Python
```

---

## Phase C: Security Fixes (Day 3-5) ⚠️ HIGHEST PRIORITY

### Step 7: Secrets
- [ ] Remove ALL hardcoded API keys, passwords, secrets from code
- [ ] Move to environment variables
- [ ] Check git history: `git log --all --diff-filter=A -- "*.env"`
- [ ] If secrets were ever committed, rotate them immediately
- [ ] Add `.env` to `.gitignore`

### Step 8: Authentication
- [ ] Passwords hashed (bcrypt/argon2, NOT MD5/SHA)
- [ ] JWT tokens expire (max 24h for access, 7d for refresh)
- [ ] Protected routes actually check auth
- [ ] Rate limiting on login endpoint
- [ ] No sensitive data in JWT payload

### Step 9: Input Validation
- [ ] All user inputs validated (type, length, format)
- [ ] SQL injection protection (parameterized queries / ORM)
- [ ] XSS protection (output escaping, CSP headers)
- [ ] CORS configured (not `*` in production)
- [ ] File uploads validated (type, size limits)

### Step 10: Supabase/Firebase Security (if applicable)
- [ ] Row Level Security (RLS) policies enabled
- [ ] API keys are not exposed in client-side code
- [ ] Service role key only used server-side
- [ ] Database permissions are minimal (principle of least privilege)

---

## Phase D: Code Quality (Day 5-10)

### Step 11: Structure
- [ ] Organize into logical folders (components, pages, services, utils)
- [ ] Remove dead code and unused files
- [ ] Rename auto-generated component names to meaningful names
- [ ] Extract repeated logic into shared utilities
- [ ] Separate business logic from UI components

### Step 12: Error Handling
- [ ] Add try/catch around API calls
- [ ] Show user-friendly error messages (not stack traces)
- [ ] Handle network errors gracefully
- [ ] Add loading states for async operations
- [ ] Add 404 page
- [ ] Add global error boundary (React) or error handler (API)
- [ ] Log errors server-side

### Step 13: State Management
- [ ] No unnecessary global state
- [ ] Data fetching is clean (not duplicated)
- [ ] Forms have proper validation
- [ ] Optimistic updates where appropriate

---

## Phase E: Testing (Day 10-15)

### Step 14: Set Up Testing Framework
```bash
# React/Next.js
npm install -D vitest @testing-library/react @testing-library/jest-dom

# Python/FastAPI
pip install pytest httpx
```

### Step 15: Write Tests (Priority Order)
1. **Auth tests** - Login, register, protected routes
2. **Critical path tests** - The main user flow
3. **API endpoint tests** - All CRUD operations
4. **Edge case tests** - Empty states, errors, boundaries
5. **Integration tests** - Third-party service interactions

**Target:** Minimum 20-30 tests, >60% coverage on business logic

---

## Phase F: Performance (Day 15-18)

### Step 16: Frontend Performance
- [ ] Images: Convert to WebP, add lazy loading, set width/height
- [ ] Bundle: Code split, lazy load routes, tree shake
- [ ] Fonts: Preload, use `font-display: swap`
- [ ] CSS: Remove unused styles, minimize
- [ ] Caching: Set appropriate cache headers
- [ ] Target: Lighthouse score > 80

### Step 17: Backend Performance
- [ ] Database: Add indexes on frequently queried columns
- [ ] Queries: Fix N+1 queries, use eager loading
- [ ] Pagination: All list endpoints paginated
- [ ] Caching: Cache expensive queries (Redis if needed)
- [ ] Target: API response < 200ms for simple queries

---

## Phase G: SEO & Accessibility (Day 18-20)

### Step 18: SEO
- [ ] `<title>` and `<meta description>` on every page
- [ ] Open Graph tags for social sharing
- [ ] `sitemap.xml` generated
- [ ] `robots.txt` configured
- [ ] Clean semantic URLs
- [ ] Structured data (JSON-LD) where applicable
- [ ] Server-side rendering or pre-rendering for important pages

### Step 19: Accessibility
- [ ] Alt text on all images
- [ ] Proper heading hierarchy (h1 → h2 → h3)
- [ ] Keyboard navigation works
- [ ] Color contrast meets WCAG 2.1 AA
- [ ] Form inputs have labels
- [ ] Focus indicators visible
- [ ] ARIA attributes where semantic HTML isn't enough

---

## Phase H: Deployment (Day 20-22)

### Step 20: Production Setup
```bash
# Docker (recommended)
docker build -t client-app .
docker compose up -d

# Or platform deployment
# Railway: railway up
# Render: git push (auto-deploy)
# Vercel: vercel --prod
```

### Step 21: Production Checklist
- [ ] HTTPS enabled (SSL certificate)
- [ ] Environment variables set in production
- [ ] Database migrated
- [ ] Domain configured
- [ ] CDN configured (for static assets)
- [ ] Error monitoring set up (Sentry)
- [ ] Uptime monitoring set up (UptimeRobot)
- [ ] Automated backups configured
- [ ] CI/CD deploys from main branch

---

## Phase I: Handoff (Day 22-25)

Follow [PROJECT_CLOSEOUT.md](../contracts/PROJECT_CLOSEOUT.md).

---

## Common Issues by Platform

### Base44 Export Issues
| Issue | How to Fix | Effort |
|-------|-----------|--------|
| Supabase RLS not configured | Add RLS policies | 2-4h |
| API keys in client code | Move to server-side proxy | 4-8h |
| No error handling | Add try/catch + user messages | 8-12h |
| Auto-generated component names | Rename for clarity | 4-8h |
| No responsive design | Add media queries | 8-16h |
| No loading states | Add skeleton/spinner components | 4-8h |
| No tests | Set up testing + write suite | 16-24h |

### Lovable Export Issues
| Issue | How to Fix | Effort |
|-------|-----------|--------|
| TypeScript types incomplete | Add proper types | 4-8h |
| Supabase auth not production-ready | Harden auth flow | 8-12h |
| Components too tightly coupled | Extract and refactor | 8-16h |
| No environment separation | Add .env per environment | 2-4h |
| Missing form validation | Add Zod/Yup schemas | 4-8h |
| No CI/CD | Set up GitHub Actions | 4-8h |
| No tests | Set up testing + write suite | 16-24h |
