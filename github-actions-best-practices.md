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

## סיכום

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
