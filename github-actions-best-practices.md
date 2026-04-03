# GitHub Actions Best Practices - טיפים שרוב המפתחים לא מכירים

<div dir="rtl">

## 1. שימוש ב-`concurrency` למניעת ריצות מיותרות

רוב המפתחים לא יודעים שאפשר לבטל אוטומטית ריצות ישנות כשנפתחת ריצה חדשה על אותו branch:

</div>

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

<div dir="rtl">

> זה חוסך דקות build יקרות - במקום שכל push יריץ pipeline מלא, רק ה-push האחרון ירוץ.

---

## 2. Cache dependencies נכון עם `actions/cache`

במקום להוריד תלויות מחדש בכל ריצה:

</div>

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

<div dir="rtl">

> זה יכול לקצר build מ-5 דקות ל-30 שניות. עובד גם עם Maven, Gradle, pip ועוד.

---

## 3. שימוש ב-`timeout-minutes` למניעת ריצות תקועות

</div>

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: npm test
        timeout-minutes: 5
```

<div dir="rtl">

> ללא timeout, job תקוע יכול לרוץ עד 6 שעות ולשרוף לכם את כל הדקות החינמיות.

---

## 4. Matrix Strategy עם `fail-fast: false`

</div>

```yaml
strategy:
  fail-fast: false
  matrix:
    node-version: [18, 20, 22]
    os: [ubuntu-latest, windows-latest]
```

<div dir="rtl">

> ברירת המחדל של `fail-fast` היא `true` - מה שאומר שאם גרסה אחת נכשלת, כל השאר מתבטלות. ב-`false` תקבלו תמונה מלאה של מה עובד ומה לא.

---

## 5. שימוש ב-`needs` ליצירת Pipeline חכם

</div>

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test

  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint

  deploy:
    needs: [test, lint]  # ירוץ רק אחרי ששניהם הצליחו
    runs-on: ubuntu-latest
    steps:
      - run: npm run deploy
```

<div dir="rtl">

> `test` ו-`lint` ירוצו במקביל, ו-`deploy` יתחיל רק אחרי ששניהם סיימו בהצלחה. זה מקצר משמעותית את זמן ה-pipeline.

---

## 6. Environment Secrets ולא Repository Secrets

</div>

```yaml
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: production  # דורש אישור ידני + secrets נפרדים
    steps:
      - run: deploy.sh
        env:
          API_KEY: ${{ secrets.PROD_API_KEY }}
```

<div dir="rtl">

> Environments מאפשרים: אישור ידני לפני deploy, secrets נפרדים לכל סביבה, והגבלת branches שיכולים לעשות deploy.

---

## 7. `paths` ו-`paths-ignore` לטריגור חכם

</div>

```yaml
on:
  push:
    paths:
      - 'src/**'
      - 'package.json'
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

<div dir="rtl">

> למה להריץ את כל ה-CI כששיניתם רק קובץ README? פילטור לפי paths חוסך זמן וכסף.

---

## 8. Reusable Workflows - שימוש חוזר ב-workflows

</div>

```yaml
# .github/workflows/reusable-test.yml
on:
  workflow_call:
    inputs:
      node-version:
        required: true
        type: string

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm test
```

```yaml
# .github/workflows/ci.yml
jobs:
  call-tests:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: '20'
```

<div dir="rtl">

> במקום להעתיק את אותו workflow ל-10 repos, תכתבו אותו פעם אחת ותקראו לו מכל מקום. DRY בגדול.

---

## 9. Composite Actions - יצירת Actions מותאמים אישית

</div>

```yaml
# .github/actions/setup-project/action.yml
name: 'Setup Project'
description: 'Install dependencies and setup environment'
runs:
  using: 'composite'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    - run: npm ci
      shell: bash
```

```yaml
# שימוש ב-workflow
steps:
  - uses: ./.github/actions/setup-project
  - run: npm test
```

<div dir="rtl">

> Composite Actions מאפשרים לארוז כמה steps לתוך action אחד. מושלם לצעדי setup שחוזרים על עצמם.

---

## 10. `github.event` - שימוש בנתוני האירוע

</div>

```yaml
- name: Comment on PR
  if: github.event_name == 'pull_request'
  run: |
    echo "PR #${{ github.event.pull_request.number }}"
    echo "Author: ${{ github.event.pull_request.user.login }}"
    echo "Changed files: ${{ github.event.pull_request.changed_files }}"
```

<div dir="rtl">

> לכל אירוע ב-GitHub יש payload עשיר עם מידע. רוב האנשים משתמשים רק ב-`github.sha` ו-`github.ref`, אבל יש הרבה יותר.

---

## 11. `GITHUB_OUTPUT` במקום `set-output` (הוצא משימוש!)

</div>

```yaml
# ישן ומיושן (deprecated):
- run: echo "::set-output name=version::1.0.0"

# חדש ונכון:
- id: get-version
  run: echo "version=1.0.0" >> $GITHUB_OUTPUT

- run: echo "Version is ${{ steps.get-version.outputs.version }}"
```

<div dir="rtl">

> `set-output` הוצא משימוש בגלל פגיעות אבטחה. השתמשו תמיד ב-`GITHUB_OUTPUT`.

---

## 12. Artifacts - שיתוף קבצים בין jobs

</div>

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/
          retention-days: 5

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build-output
      - run: ./deploy.sh
```

<div dir="rtl">

> `retention-days: 5` חוסך storage. ברירת המחדל היא 90 יום - שזה מיותר לרוב ה-artifacts.

---

## 13. `permissions` - עקרון ה-Least Privilege

</div>

```yaml
permissions:
  contents: read
  pull-requests: write
  issues: read

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write  # ניתן גם ברמת job
    steps:
      - run: echo "Only has PR write access"
```

<div dir="rtl">

> לעולם אל תתנו `permissions: write-all`. הגדירו רק את ההרשאות שצריך - ברמת workflow או ברמת job.

---

## 14. `if: always()` - ריצה גם כשיש כישלון

</div>

```yaml
steps:
  - run: npm test
  
  - if: always()
    uses: actions/upload-artifact@v4
    with:
      name: test-results
      path: test-results/

  - if: failure()
    run: |
      curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
        -d '{"text":"CI Failed on ${{ github.ref }}"}'
```

<div dir="rtl">

> `if: always()` - ירוץ תמיד (גם בכישלון)  
> `if: failure()` - ירוץ רק בכישלון  
> `if: success()` - ירוץ רק בהצלחה (ברירת מחדל)  
> מושלם להתראות Slack, העלאת לוגים, וניקוי resources.

---

## 15. Dependabot + Auto-merge לעדכוני תלויות

</div>

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

```yaml
# .github/workflows/auto-merge-dependabot.yml
name: Auto-merge Dependabot
on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

<div dir="rtl">

> שילוב של Dependabot עם auto-merge שומר על התלויות שלכם מעודכנות אוטומטית, ללא התערבות ידנית.

---

## סיכום GitHub Actions

| טיפ | מה חוסך |
|-----|---------|
| `concurrency` | דקות build מיותרות |
| `cache` | זמן התקנת תלויות |
| `timeout-minutes` | ריצות תקועות |
| `paths` filter | ריצות על שינויים לא רלוונטיים |
| `fail-fast: false` | מידע על כשלונות |
| Reusable Workflows | שכפול קוד |
| `permissions` | סיכוני אבטחה |
| `GITHUB_OUTPUT` | פגיעויות אבטחה |
| Dependabot + auto-merge | עדכוני תלויות ידניים |

</div>

---

<div dir="rtl">

# GitHub Best Practices - טיפים כלליים לגיטהאב שרוב המפתחים לא מכירים

---

## 16. Branch Protection Rules - הגנה על הענפים שלכם

</div>

```
Settings → Branches → Add branch protection rule
```

<div dir="rtl">

הגדרות קריטיות שחייבים להפעיל על `main`:

- **Require pull request reviews** - אי אפשר לדחוף ישירות ל-main
- **Require status checks to pass** - CI חייב לעבור לפני merge
- **Require conversation resolution** - כל הערות ה-review חייבות להיפתר
- **Require linear history** - מונע merge commits מבולגנים
- **Include administrators** - גם מנהלים חייבים לעבור דרך PR

> 90% מהפרויקטים ב-GitHub לא מגדירים branch protection. זה כמו לשים דלת בלי מנעול.

---

## 17. CODEOWNERS - מי אחראי על מה

</div>

```
# .github/CODEOWNERS

# כל שינוי ב-frontend דורש אישור מצוות frontend
/src/frontend/          @company/frontend-team

# קבצי infrastructure דורשים אישור DevOps
/terraform/             @company/devops-team
*.yml                   @company/devops-team

# שינויי API דורשים אישור מ-2 אנשים ספציפיים
/src/api/               @john @sarah

# כל שינוי ב-package.json דורש אישור tech lead
package.json            @tech-lead
```

<div dir="rtl">

> CODEOWNERS מבטיח שהאנשים הנכונים תמיד עושים review לקוד שלהם. זה עובד אוטומטית עם Branch Protection.

---

## 18. Conventional Commits - מבנה אחיד ל-commit messages

</div>

```
feat: add user authentication system
fix: resolve memory leak in connection pool
docs: update API documentation
refactor: simplify payment processing logic
test: add unit tests for user service
chore: update dependencies
ci: add staging deployment workflow
perf: optimize database queries for search
breaking: remove deprecated v1 API endpoints
```

<div dir="rtl">

> Conventional Commits מאפשרים: changelog אוטומטי, versioning אוטומטי (semantic-release), וקריאות הרבה יותר טובה של ההיסטוריה.

---

## 19. Pull Request Templates - תבנית PR אחידה

</div>

```markdown
<!-- .github/pull_request_template.md -->

## What does this PR do?
<!-- Brief description of the changes -->

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How was this tested?
<!-- Describe the tests you ran -->

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing tests pass locally
- [ ] I have updated the documentation
```

<div dir="rtl">

> תבניות PR מונעות PRs חסרי הקשר. כש-reviewer מקבל PR, הוא מבין מיד מה, למה, ואיך.

---

## 20. Issue Templates עם Forms

</div>

```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug Report
description: Report a bug
labels: ["bug", "triage"]
body:
  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options:
        - Critical
        - High
        - Medium
        - Low
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected behavior

  - type: textarea
    id: screenshots
    attributes:
      label: Screenshots
      description: If applicable, add screenshots
```

<div dir="rtl">

> Issue Forms (ולא רק templates) מאלצים דיווח מסודר עם dropdowns, checkboxes וולידציה. כבר לא "it doesn't work" בלי פרטים.

---

## 21. GitHub CLI (`gh`) - עבודה מהטרמינל

</div>

```bash
# יצירת PR מהטרמינל
gh pr create --title "Add feature" --body "Description"

# review של PR
gh pr checkout 123
gh pr review --approve

# יצירת issue
gh issue create --title "Bug" --label "bug"

# צפייה בסטטוס CI
gh run list
gh run watch

# חיפוש קוד בכל repos של הארגון
gh search code "API_KEY" --owner my-org

# יצירת release
gh release create v1.0.0 --generate-notes
```

<div dir="rtl">

> `gh` חוסך המון זמן - אין צורך לעבור לדפדפן. אפשר לעשות הכל מהטרמינל.

---

## 22. `.gitattributes` - שליטה על Git behavior

</div>

```
# .gitattributes

# Ensure consistent line endings
* text=auto
*.sh text eol=lf
*.bat text eol=crlf

# Mark files as binary (no diff/merge)
*.png binary
*.jpg binary
*.pdf binary

# Custom diff for lock files
package-lock.json -diff
yarn.lock -diff

# Linguist: exclude from language stats
docs/** linguist-documentation
vendor/** linguist-vendored
*.min.js linguist-generated
```

<div dir="rtl">

> `linguist-vendored` ו-`linguist-generated` מונעים מקבצי vendor וקבצים שנוצרו אוטומטית להשפיע על סטטיסטיקת השפות של ה-repo. בלי `-diff` על lock files, כל PR מציג אלפי שורות שינויים מיותרים.

---

## 23. GitHub Releases עם Generated Notes

</div>

```yaml
# .github/release.yml
changelog:
  categories:
    - title: "New Features"
      labels:
        - "feature"
        - "enhancement"
    - title: "Bug Fixes"
      labels:
        - "bug"
        - "fix"
    - title: "Breaking Changes"
      labels:
        - "breaking"
    - title: "Documentation"
      labels:
        - "documentation"
    - title: "Other Changes"
      labels:
        - "*"
  exclude:
    labels:
      - "skip-changelog"
```

<div dir="rtl">

> GitHub יוצר changelog אוטומטי על בסיס labels של PRs. במקום לכתוב changelog ידנית, פשוט תעשו `gh release create v1.0.0 --generate-notes`.

---

## 24. Saved Replies - תשובות מוכנות מראש

</div>

```
Settings → Saved replies

# תשובה 1: "Needs Tests"
Thanks for the PR! Could you please add unit tests for this change?
Our coverage threshold requires at least 80% for new code.

# תשובה 2: "LGTM"  
LGTM! Great work. Just one minor suggestion (non-blocking).

# תשובה 3: "Stale Issue"
This issue has been inactive for 30 days. Closing due to inactivity.
Feel free to reopen if this is still relevant.
```

<div dir="rtl">

> Saved Replies חוסכות זמן על review comments שחוזרים על עצמם. קיצור מקלדת: `Ctrl+.` בתוך תיבת תגובה.

---

## 25. GitHub Search Operators - חיפוש מתקדם

</div>

```
# חיפוש קוד
language:java "implements Serializable" org:my-company
filename:docker-compose extension:yml path:deploy/

# חיפוש issues/PRs
is:issue is:open label:bug sort:reactions-+1-desc
is:pr review:required draft:false
is:issue assignee:@me milestone:"v2.0"

# חיפוש commits
author:username committer-date:>2024-01-01

# חיפוש repos
stars:>1000 language:python topic:machine-learning pushed:>2024-06-01
```

<div dir="rtl">

> חיפוש GitHub הוא עוצמתי - אבל רוב האנשים פשוט כותבים מילה בתיבת חיפוש. עם operators אפשר למצוא כל דבר.

---

## 26. `git blame` ו-GitHub Blame View

</div>

```bash
# מי שינה כל שורה ומתי
git blame src/main.js

# blame מתעלם מ-commits של formatting
git blame --ignore-rev <commit-hash> src/main.js

# קובץ עם רשימת commits להתעלם מהם
echo "<formatting-commit>" >> .git-blame-ignore-revs
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

<div dir="rtl">

> `.git-blame-ignore-revs` הוא game changer! אחרי שעשיתם prettier/format על כל הפרויקט, ה-blame עדיין מראה את המחבר המקורי ולא "formatted code".  
> GitHub תומך בזה נייטיב - פשוט הוסיפו את הקובץ ל-repo.

---

## 27. GitHub Projects (V2) - ניהול פרויקטים

</div>

```
# Custom Fields שכדאי להוסיף:
- Priority: P0 / P1 / P2 / P3
- Size: XS / S / M / L / XL  
- Sprint: Sprint 1 / Sprint 2 / ...
- Team: Frontend / Backend / DevOps

# Workflows אוטומטיים:
- Issue opened → Status: "Triage"
- PR merged → Status: "Done"
- PR opened → Status: "In Review"
```

<div dir="rtl">

> GitHub Projects V2 הוא לא ה-Projects הישן. יש בו custom fields, views מרובים (Board, Table, Roadmap), ו-workflows אוטומטיים. הרבה צוותים עדיין משתמשים ב-Jira כשזה כבר מיותר.

---

## 28. Security Features מובנים

</div>

```yaml
# secret scanning - מופעל אוטומטית
# מזהה API keys, tokens, passwords שנדחפו בטעות

# Dependabot security alerts - מופעל ב-Settings
# מתריע על vulnerabilities בתלויות

# Code scanning עם CodeQL
# .github/workflows/codeql.yml
name: CodeQL Analysis
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # כל יום שני ב-6 בבוקר

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript
      - uses: github/codeql-action/analyze@v3
```

<div dir="rtl">

> GitHub מציע 3 שכבות אבטחה חינמיות: Secret Scanning, Dependabot Alerts, ו-CodeQL. רוב ה-repos לא מפעילים את CodeQL, למרות שהוא מוצא באגי אבטחה אמיתיים.

---

## 29. GitHub Codespaces / `devcontainer.json` - סביבת פיתוח אחידה

</div>

```json
// .devcontainer/devcontainer.json
{
  "name": "My Project",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "postCreateCommand": "npm install",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ],
      "settings": {
        "editor.formatOnSave": true
      }
    }
  },
  "forwardPorts": [3000, 5432]
}
```

<div dir="rtl">

> `devcontainer.json` מבטיח שכל מפתח מקבל בדיוק את אותה סביבה - עם אותם כלים, extensions, והגדרות. נגמרו הימים של "אצלי זה עובד".

---

## 30. `.github/FUNDING.yml` - קישור למימון

</div>

```yaml
# .github/FUNDING.yml
github: [your-username]
patreon: your-patreon
buy_me_a_coffee: your-username
custom: ["https://your-donation-link.com"]
```

<div dir="rtl">

> מוסיף כפתור "Sponsor" בראש ה-repo. הרבה מפתחי open source לא יודעים שזה קיים - וזה יכול להביא תמיכה כספית לפרויקט.

---

## סיכום כללי GitHub

| טיפ | קטגוריה |
|-----|---------|
| Branch Protection Rules | אבטחה |
| CODEOWNERS | Code Review |
| Conventional Commits | תקשורת |
| PR Templates | תהליך |
| Issue Forms | תהליך |
| GitHub CLI (`gh`) | פרודוקטיביות |
| `.gitattributes` | תחזוקה |
| Generated Release Notes | תיעוד |
| Saved Replies | פרודוקטיביות |
| Search Operators | חיפוש |
| `.git-blame-ignore-revs` | היסטוריה |
| Projects V2 | ניהול |
| CodeQL + Secret Scanning | אבטחה |
| `devcontainer.json` | סביבת פיתוח |
| `FUNDING.yml` | קהילה |

</div>
