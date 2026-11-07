#!/usr/bin/env bash
# Restaurant Vision demo without Docker (used by `make demo-local`): the cloud on uvicorn with a
# SQLite database and the seeded demo tenant, a simulated edge paired to "Tel Aviv", and the
# dashboard + waiter dev servers. Ctrl-C stops everything.
#
# Usage: deploy/scripts/demo-local.sh [--no-web] [--speed N] [--scenario PATH] [--fresh] [--verbose]
#   --no-web         do not start the Vite dev servers (dashboard 5173, waiter 5174)
#   --speed N        simulation speed (default 20)
#   --scenario PATH  scenario file (default simulator/scenarios/demo_dinner.yaml)
#   --fresh          delete the demo database first
#   --verbose        INFO logs from the cloud and the edge (every request and event)
# Needs `make setup` first. State lives in $RV_DEMO_DIR (default: ${TMPDIR:-/tmp}/rv-demo).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd) # restaurant-vision/
VENV="$ROOT/.venv"
DEMO_DIR="${RV_DEMO_DIR:-${TMPDIR:-/tmp}/rv-demo}"
CLOUD_PORT="${RV_CLOUD_PORT:-8000}"
EDGE_PORT="${RV_EDGE_PORT:-8787}"
SPEED=20
SCENARIO="simulator/scenarios/demo_dinner.yaml"
WEB=1
FRESH=0
LOG_LEVEL=WARNING

usage() { sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-web) WEB=0 ;;
    --speed) SPEED="${2:?--speed needs a value}"; shift ;;
    --scenario) SCENARIO="${2:?--scenario needs a value}"; shift ;;
    --fresh) FRESH=1 ;;
    --verbose) LOG_LEVEL=INFO ;;
    -h | --help) usage; exit 0 ;;
    *) echo "error: unknown option $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -x $VENV/bin/rv-edge && -x $VENV/bin/uvicorn ]] || die "run 'make setup' first ($VENV is missing packages)"
"$VENV/bin/python" -c 'import rv_sim' 2>/dev/null || die "rv_sim is not installed; run 'make setup'"
if [[ $WEB -eq 1 ]]; then
  command -v pnpm >/dev/null || die "pnpm not found (use --no-web, or install Node 22 + pnpm)"
  [[ -d $ROOT/web/node_modules ]] || die "web dependencies missing; run 'make setup'"
fi

cd "$ROOT"
mkdir -p "$DEMO_DIR"
[[ $FRESH -eq 1 ]] && rm -f "$DEMO_DIR/rv_cloud.sqlite3"
rm -rf "$DEMO_DIR/edge" # a fresh simulated edge (and pairing) on every run

export RV_DATABASE_URL="sqlite:///$DEMO_DIR/rv_cloud.sqlite3"
export RV_LOG_JSON=false
export RV_LOG_LEVEL=$LOG_LEVEL
# Web Push keys, generated once per demo dir so browser subscriptions stay valid.
if [[ ! -f $DEMO_DIR/vapid.env ]]; then
  "$VENV/bin/python" -m rv_cloud.tools.gen_vapid >"$DEMO_DIR/vapid.env"
fi
set -a
# shellcheck disable=SC1091
. "$DEMO_DIR/vapid.env"
set +a

# Job control: every background service gets its own process group, so cleanup can stop it
# together with its children (uvicorn workers, vite, esbuild).
set -m
pids=()
cleanup() {
  trap - INT TERM EXIT
  if [[ ${#pids[@]} -gt 0 ]]; then
    say "Stopping the demo"
    for pid in "${pids[@]}"; do
      kill -TERM -- "-$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

# Runs "$@" in the background with every output line prefixed by a coloured tag.
start() {
  local tag=$1 color=$2
  shift 2
  ("$@" 2>&1 | sed -u "s/^/$(printf '\033[%sm[%s]\033[0m ' "$color" "$tag")/") &
  pids+=($!)
}

wait_http() {
  local url=$1 name=$2
  for _ in $(seq 1 60); do
    if "$VENV/bin/python" -c "import sys, urllib.request; urllib.request.urlopen(sys.argv[1], timeout=2)" \
      "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  die "$name did not answer at $url"
}

say "Seeding the demo tenant in $DEMO_DIR/rv_cloud.sqlite3"
seed_out=$("$VENV/bin/python" -m rv_cloud.tools.seed_demo)
printf '%s\n' "$seed_out" | sed 's/^/    /'
pair_code=$(printf '%s\n' "$seed_out" | awk 'index($0, "Site Tel Aviv ") == 1 { print $NF }')
[[ -n $pair_code ]] || die "no Tel Aviv pairing code in the seed output"

say "Starting the cloud on :$CLOUD_PORT"
start cloud 34 "$VENV/bin/uvicorn" rv_cloud.main:app --host 127.0.0.1 --port "$CLOUD_PORT" \
  --no-access-log --log-level "${LOG_LEVEL,,}"
wait_http "http://127.0.0.1:$CLOUD_PORT/healthz" "the cloud"

say "Starting the simulated edge on :$EDGE_PORT ($SCENARIO at speed $SPEED, pairing code $pair_code)"
start edge 35 "$VENV/bin/rv-edge" simulate --scenario "$SCENARIO" --speed "$SPEED" \
  --cloud "http://127.0.0.1:$CLOUD_PORT" --pair-code "$pair_code" \
  --data-dir "$DEMO_DIR/edge" --port "$EDGE_PORT" --log-level "$LOG_LEVEL"
wait_http "http://127.0.0.1:$EDGE_PORT/local/health" "the edge"

if [[ $WEB -eq 1 ]]; then
  say "Starting the dashboard (:5173) and waiter (:5174) dev servers"
  export VITE_PROXY_TARGET="http://127.0.0.1:$CLOUD_PORT"
  start web 33 pnpm --dir web dev
  wait_http "http://127.0.0.1:5173/" "the dashboard dev server"
fi

if [[ $WEB -eq 1 ]]; then
  dashboard="http://localhost:5173/"
  waiter="http://localhost:5174/"
else
  dashboard="http://localhost:$CLOUD_PORT/api/v1/docs (API only; run without --no-web for the UIs)"
  waiter="-"
fi
cat <<EOF

$(printf '\033[1;32m')Restaurant Vision local demo is running.$(printf '\033[0m')

  Dashboard     $dashboard
                owner   demo@example.com    / demo-password-123
                manager manager@example.com / demo-password-123  (Tel Aviv)
  Waiter PWA    $waiter
                waiter  waiter@example.com  / demo-password-123  (Tel Aviv)
  Cloud API     http://localhost:$CLOUD_PORT/api/v1/docs
  Edge LAN API  http://localhost:$EDGE_PORT/local/state

  Scenario $SCENARIO at speed $SPEED (the demo dinner plays in about 6 minutes).
  Logs below: [cloud] [edge] [web] (warnings only; --verbose for all). Ctrl-C stops everything.

EOF
wait
