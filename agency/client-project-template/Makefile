.PHONY: help install dev test lint format check clean

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pip install -r requirements.txt

dev: ## Start development server
	uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test: ## Run tests
	python -m pytest tests/ -v

lint: ## Run linter
	ruff check src/ tests/

format: ## Format code
	ruff format src/ tests/

check: lint test ## Run all checks

clean: ## Clean generated files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	rm -rf .pytest_cache .ruff_cache htmlcov .coverage
