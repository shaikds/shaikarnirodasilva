.PHONY: help install dev test lint format check clean

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pip install -r requirements.txt

dev: ## Start development server with hot reload
	uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test: ## Run tests
	python -m pytest tests/ -v

test-coverage: ## Run tests with coverage report
	python -m pytest tests/ -v --cov=src --cov-report=html --cov-report=term

lint: ## Run linter
	ruff check src/ tests/

format: ## Format code
	ruff format src/ tests/
	ruff check --fix src/ tests/

check: lint test ## Run all checks (lint + test)

clean: ## Clean generated files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null; true
	rm -rf htmlcov/ .coverage coverage.xml
