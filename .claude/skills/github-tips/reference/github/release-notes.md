# Auto-generated Release Notes

## Rule
Configure `.github/release.yml` for automatic changelog generation based on PR labels.

## Code
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
    - title: "Performance"
      labels:
        - "performance"
    - title: "Documentation"
      labels:
        - "documentation"
    - title: "Dependencies"
      labels:
        - "dependencies"
    - title: "Other Changes"
      labels:
        - "*"
  exclude:
    labels:
      - "skip-changelog"
    authors:
      - "dependabot"
```

## Usage
```bash
# Create release with auto-generated notes
gh release create v1.0.0 --generate-notes

# Create draft release for review
gh release create v1.0.0 --draft --generate-notes
```

## Why
GitHub automatically builds a changelog grouped by category from merged PRs. No manual changelog writing. Just label your PRs correctly and `--generate-notes` does the rest.
