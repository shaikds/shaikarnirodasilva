# Dev Containers (devcontainer.json)

## Rule
Create `devcontainer.json` for consistent development environments across the team.

## Code
```json
// .devcontainer/devcontainer.json
{
  "name": "My Project",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/github-cli:1": {},
    "ghcr.io/devcontainers/features/aws-cli:1": {}
  },
  "postCreateCommand": "npm install",
  "postStartCommand": "npm run dev",
  "forwardPorts": [3000, 5432],
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss",
        "ms-azuretools.vscode-docker"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode"
      }
    }
  },
  "portsAttributes": {
    "3000": { "label": "App", "onAutoForward": "openBrowser" },
    "5432": { "label": "Database", "onAutoForward": "ignore" }
  }
}
```

## With Docker Compose
```json
// .devcontainer/devcontainer.json
{
  "name": "Full Stack",
  "dockerComposeFile": "docker-compose.yml",
  "service": "app",
  "workspaceFolder": "/workspace",
  "postCreateCommand": "npm install"
}
```

## Common Base Images
```
mcr.microsoft.com/devcontainers/javascript-node:20
mcr.microsoft.com/devcontainers/python:3.12
mcr.microsoft.com/devcontainers/java:21
mcr.microsoft.com/devcontainers/go:1.22
mcr.microsoft.com/devcontainers/typescript-node:20
mcr.microsoft.com/devcontainers/base:ubuntu
```

## Why
`devcontainer.json` ensures every developer gets the exact same environment - same tools, extensions, and settings. Works with GitHub Codespaces (cloud) and VS Code Dev Containers (local). No more "it works on my machine".
