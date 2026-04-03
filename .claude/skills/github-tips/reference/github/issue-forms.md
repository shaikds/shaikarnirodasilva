# Issue Forms (not just Templates)

## Rule
Use Issue Forms with dropdowns, validation, and structured fields instead of plain markdown templates.

## Bug Report Form
```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug Report
description: Report a bug
labels: ["bug", "triage"]
assignees: []
body:
  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options:
        - Critical (app crashes / data loss)
        - High (feature broken, no workaround)
        - Medium (feature broken, workaround exists)
        - Low (cosmetic / minor issue)
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
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true

  - type: input
    id: version
    attributes:
      label: Version
      placeholder: "e.g., 1.2.3"

  - type: textarea
    id: screenshots
    attributes:
      label: Screenshots
      description: If applicable, add screenshots
```

## Feature Request Form
```yaml
# .github/ISSUE_TEMPLATE/feature_request.yml
name: Feature Request
description: Suggest a new feature
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What problem does this solve?
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
    validations:
      required: true

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - Nice to have
        - Important
        - Critical
```

## Config to choose template
```yaml
# .github/ISSUE_TEMPLATE/config.yml
blank_issues_enabled: false  # Force users to use templates
contact_links:
  - name: Questions
    url: https://github.com/org/repo/discussions
    about: Ask questions in Discussions, not Issues
```

## Why
Issue Forms enforce structured data with dropdowns, required fields, and validation. No more "it doesn't work" with zero details.
