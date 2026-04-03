# Environment Secrets (not Repository Secrets)

## Rule
Use Environment Secrets for deployments. They provide manual approval gates and per-environment isolation.

## Code
```yaml
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval + separate secrets
    steps:
      - run: deploy.sh
        env:
          API_KEY: ${{ secrets.PROD_API_KEY }}
```

## Environment Setup
```
Settings -> Environments -> New environment
- Name: production
- Required reviewers: @team-lead
- Deployment branches: main only
- Environment secrets: PROD_API_KEY, PROD_DB_URL
```

## Why
Environments provide: manual approval before deploy, separate secrets per environment (dev/staging/prod), branch restrictions on who can deploy.

## Anti-pattern
```yaml
# BAD: Repository-level secrets shared across all environments
env:
  API_KEY: ${{ secrets.API_KEY }}  # Same key for dev and prod!
```
