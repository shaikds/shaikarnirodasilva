# CODEOWNERS

## Rule
ALWAYS create a CODEOWNERS file for automatic review assignment.

## Code
```
# .github/CODEOWNERS

# Default owners for everything
*                       @tech-lead

# Frontend team owns frontend code
/src/frontend/          @company/frontend-team
/src/components/        @company/frontend-team
*.css                   @company/frontend-team
*.tsx                   @company/frontend-team

# Backend team owns API code
/src/api/               @company/backend-team
/src/services/          @company/backend-team

# DevOps owns infrastructure
/terraform/             @company/devops-team
/.github/               @company/devops-team
Dockerfile              @company/devops-team
*.yml                   @company/devops-team

# Security-sensitive files need tech lead approval
package.json            @tech-lead
package-lock.json       @tech-lead
.env.example            @tech-lead @security-team
```

## Why
CODEOWNERS ensures the right people automatically review changes to their area. Works with Branch Protection to enforce required reviews from code owners.
