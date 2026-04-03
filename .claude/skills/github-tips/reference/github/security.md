# Security Features (CodeQL, Secret Scanning, Dependabot Alerts)

## Rule
Enable all 3 free security layers: Secret Scanning, Dependabot Alerts, and CodeQL.

## 1. Secret Scanning (automatic)
```
Settings -> Code security and analysis -> Secret scanning: Enable

Detects: API keys, tokens, passwords pushed by mistake
Action: Alerts you + can auto-revoke some tokens (GitHub, AWS, etc.)
```

## 2. Dependabot Alerts (automatic)
```
Settings -> Code security and analysis -> Dependabot alerts: Enable
Also enable: Dependabot security updates (auto-creates PRs)

Detects: Known vulnerabilities in your dependencies
Action: Alerts you + creates PRs to fix vulnerable packages
```

## 3. CodeQL (requires workflow)
```yaml
# .github/workflows/codeql.yml
name: CodeQL Analysis
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday 6am

jobs:
  analyze:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      security-events: write
      contents: read
    strategy:
      matrix:
        language: ['javascript']  # Also: python, java, go, ruby, csharp, cpp
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
      - uses: github/codeql-action/analyze@v3
```

## Supported CodeQL Languages
JavaScript/TypeScript, Python, Java/Kotlin, Go, Ruby, C#, C/C++, Swift

## Why
3 free security layers that most repos don't enable. Secret Scanning catches leaked keys. Dependabot catches vulnerable dependencies. CodeQL catches real security bugs (SQL injection, XSS, etc.) in your own code.
