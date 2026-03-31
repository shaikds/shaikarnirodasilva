# ============================
# Project Makefile
# ============================
# Customize commands for your tech stack.
# Usage: `make help` to see all available commands

.PHONY: help install dev test lint format build clean

# Default target
help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ============================
# Setup
# ============================
install: ## Install dependencies
	@echo "Configure: npm install / pip install -r requirements.txt / mvn install"

setup: install ## First-time project setup
	@echo "Configure: copy .env.example, run migrations, etc."
	# cp .env.example .env
	# npm run db:migrate

# ============================
# Development
# ============================
dev: ## Start development server
	@echo "Configure: npm run dev / python manage.py runserver / mvn spring-boot:run"

# ============================
# Quality
# ============================
test: ## Run tests
	@echo "Configure: npm test / pytest / mvn test"

test-coverage: ## Run tests with coverage report
	@echo "Configure: npm run test:coverage / pytest --cov / mvn jacoco:report"

lint: ## Run linter
	@echo "Configure: npm run lint / ruff check . / mvn checkstyle:check"

format: ## Format code
	@echo "Configure: npm run format / ruff format . / mvn fmt:format"

check: lint test ## Run all checks (lint + test)

# ============================
# Build & Deploy
# ============================
build: ## Build for production
	@echo "Configure: npm run build / mvn package"

clean: ## Clean build artifacts
	@echo "Configure: rm -rf dist/ build/ target/ node_modules/"

# ============================
# Git Shortcuts
# ============================
branch: ## Show current branch info
	@git branch -v

log: ## Show recent commits
	@git log --oneline --graph -20

status: ## Show git status
	@git status

# ============================
# Docker (if applicable)
# ============================
# docker-up: ## Start Docker containers
# 	docker compose up -d
#
# docker-down: ## Stop Docker containers
# 	docker compose down
#
# docker-build: ## Build Docker image
# 	docker compose build
