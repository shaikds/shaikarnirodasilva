#!/usr/bin/env bash
# Stop the Restaurant Vision Docker demo started by demo-up.sh.
#
# Usage: deploy/scripts/demo-down.sh [--purge]
#   --purge  also delete the Postgres volume (demo tenant, events) and deploy/.env (demo secrets)
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(dirname "$SCRIPT_DIR")
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
PURGE=0

case "${1:-}" in
  "") ;;
  --purge) PURGE=1 ;;
  -h | --help) sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "error: unknown option $1" >&2; exit 2 ;;
esac

if [[ $PURGE -eq 1 ]]; then
  docker compose -f "$COMPOSE_FILE" --profile demo down --volumes --remove-orphans
  rm -f "$DEPLOY_DIR/.env"
  echo "Demo stopped; database volume and deploy/.env removed."
else
  docker compose -f "$COMPOSE_FILE" --profile demo down --remove-orphans
  echo "Demo stopped; the database volume is kept (use --purge to delete it)."
fi
