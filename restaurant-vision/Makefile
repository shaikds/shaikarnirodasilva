# Restaurant Vision developer tasks. Run `make` for the list.
# Python: one shared virtualenv in .venv (uv when available, else python3 -m venv).
# Web: pnpm workspace in web/ (Node 22).

SHELL := /bin/bash
.DEFAULT_GOAL := help

PYTHON   ?= python3
VENV     := .venv
BIN      := $(VENV)/bin
PY       := $(BIN)/python
PACKAGES := contracts edge cloud simulator
DEV_DEPS := ruff mypy pytest pytest-asyncio pytest-cov types-PyYAML types-psutil
MODEL    ?= tiny
COMPOSE  := docker compose -f deploy/docker-compose.yml --profile demo

.PHONY: help setup venv python web models test test-python test-web lint lint-python lint-web \
        schema smoke demo-local up down logs compliance-pdfs

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: python web models ## Everything for development: venv + editable installs, pnpm install, YOLOX model

$(PY):
	@if command -v uv >/dev/null; then uv venv $(VENV) --python $(PYTHON); else $(PYTHON) -m venv $(VENV); fi

venv: $(PY)

python: $(PY) ## Editable installs of the 4 Python packages + dev tools
	@if command -v uv >/dev/null; then \
	  uv pip install --python $(PY) $(addprefix -e ./,$(PACKAGES)) $(DEV_DEPS); \
	else \
	  $(PY) -m pip install --upgrade pip && $(PY) -m pip install $(addprefix -e ./,$(PACKAGES)) $(DEV_DEPS); \
	fi

web: ## pnpm install for the web workspace
	cd web && pnpm install --frozen-lockfile

models: $(PY) ## Download and verify the YOLOX model (MODEL=tiny|s|all, default tiny)
	$(PY) edge/scripts/fetch_models.py --model $(MODEL)

test: test-python test-web ## All tests

test-python: ## pytest for contracts, edge, cloud and simulator
	cd contracts && ../$(BIN)/pytest -q
	cd edge && ../$(BIN)/pytest -q --cov=rv_edge.analytics --cov-report=term --cov-fail-under=80
	cd cloud && ../$(BIN)/pytest -q --cov=rv_cloud --cov-report=term --cov-fail-under=80
	cd simulator && ../$(BIN)/pytest -q

test-web: ## vitest for the web workspace
	cd web && pnpm test

lint: lint-python lint-web schema ## All linters, type checks and the contracts schema check

lint-python: ## ruff + mypy (strict where configured)
	$(BIN)/ruff check $(PACKAGES)
	$(BIN)/ruff check --line-length 100 --select E,F,W,I,B,UP,SIM deploy
	cd contracts && ../$(BIN)/mypy rv_contracts
	cd edge && ../$(BIN)/mypy rv_edge && ../$(BIN)/mypy --strict rv_edge/analytics
	cd cloud && ../$(BIN)/mypy rv_cloud
	cd simulator && ../$(BIN)/mypy rv_sim

lint-web: ## tsc + eslint for the web workspace
	cd web && pnpm typecheck && pnpm lint

schema: ## Check web/packages/shared/src/contracts/schema.json matches rv_contracts
	$(PY) -m rv_contracts.schema_export --check web/packages/shared/src/contracts/schema.json

smoke: ## Analytics accuracy on the CI smoke scenario
	$(BIN)/rv-sim eval simulator/scenarios/smoke.yaml

demo-local: ## Demo without Docker: cloud (uvicorn + SQLite + seed), simulated edge, web dev servers
	deploy/scripts/demo-local.sh

up: ## Docker demo: Postgres + cloud + seeded tenant + simulated edge (deploy/scripts/demo-up.sh)
	deploy/scripts/demo-up.sh

down: ## Stop the Docker demo (keeps the database; deploy/scripts/demo-down.sh --purge deletes it)
	deploy/scripts/demo-down.sh

logs: ## Follow the Docker demo logs
	$(COMPOSE) logs -f

compliance-pdfs: ## Render docs/compliance to PDF in build/compliance (needs markdown + weasyprint)
	$(PY) deploy/scripts/compliance_pdfs.py docs/compliance build/compliance
