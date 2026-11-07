#!/usr/bin/env bash
# Install or update the Restaurant Vision edge engine on Linux (systemd). Idempotent: re-run it
# to upgrade the code; existing settings, pairing and data are kept.
#
# Usage (as root, from a restaurant-vision source checkout or release bundle):
#   sudo deploy/edge/linux/install.sh [options]
# Options:
#   --cloud URL         cloud base URL (written to a new edge.yaml; used for pairing)
#   --pair-code CODE    pair with the cloud now (from the dashboard: Settings > Devices)
#   --model tiny|s      YOLOX model to fetch (default tiny)
#   --python PATH       Python 3.11+ interpreter (default: python3)
#   --with-simulator    also install rv_sim (demo scenarios: rv-edge simulate)
#   --no-start          install everything but do not (re)start the service
#
# Layout: /opt/rv-edge/{venv,models,edge-ui,scripts} (code, root-owned),
# /etc/rv-edge/edge.yaml (settings), /var/lib/rv-edge (secrets, site config, outbox; owner-only),
# service user rv-edge, systemd unit rv-edge.service.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC=$(cd "$SCRIPT_DIR/../../.." && pwd) # restaurant-vision/

PREFIX=/opt/rv-edge
VENV=$PREFIX/venv
CONF_DIR=/etc/rv-edge
CONF=$CONF_DIR/edge.yaml
DATA_DIR=/var/lib/rv-edge
UNIT=/etc/systemd/system/rv-edge.service
SVC_USER=rv-edge

CLOUD_URL=""
PAIR_CODE=""
MODEL=tiny
PYTHON=python3
WITH_SIM=0
START=1

usage() { sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cloud) CLOUD_URL="${2:?--cloud needs a URL}"; shift ;;
    --pair-code) PAIR_CODE="${2:?--pair-code needs a code}"; shift ;;
    --model) MODEL="${2:?--model needs tiny or s}"; shift ;;
    --python) PYTHON="${2:?--python needs a path}"; shift ;;
    --with-simulator) WITH_SIM=1 ;;
    --no-start) START=0 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "error: unknown option $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run as root (sudo $0 ...)"
[[ $MODEL == tiny || $MODEL == s ]] || die "--model must be tiny or s"
[[ -z $PAIR_CODE || -n $CLOUD_URL ]] || die "--pair-code needs --cloud URL"
[[ -f $SRC/edge/pyproject.toml && -f $SRC/contracts/pyproject.toml ]] \
  || die "run this script from a restaurant-vision checkout (missing $SRC/edge)"
command -v systemctl >/dev/null || die "systemd is required (see the Docker option in docs/runbooks/install-edge.md)"

# ---------------------------------------------------------------------------------- Python
command -v "$PYTHON" >/dev/null || die "$PYTHON not found; install Python 3.11 or newer"
"$PYTHON" -c 'import sys; sys.exit(sys.version_info < (3, 11))' \
  || die "Python 3.11+ is required (found $("$PYTHON" -V 2>&1)); pass --python /usr/bin/python3.12"
if ! "$PYTHON" -c 'import ensurepip, venv' >/dev/null 2>&1; then
  if command -v apt-get >/dev/null; then
    pyver=$("$PYTHON" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
    say "Installing python$pyver-venv"
    apt-get update -qq && apt-get install -y -qq "python$pyver-venv"
  else
    die "the Python venv module is missing; install your distribution's python3-venv package"
  fi
fi
# OpenCV (headless) needs glib at runtime; present on desktops, missing on minimal servers.
if command -v apt-get >/dev/null && ! ldconfig -p | grep -q 'libglib-2.0.so.0'; then
  say "Installing libglib2.0-0 (OpenCV runtime)"
  apt-get update -qq && apt-get install -y -qq libglib2.0-0
fi

# ------------------------------------------------------------------------ user and folders
if ! id -u "$SVC_USER" >/dev/null 2>&1; then
  say "Creating system user $SVC_USER"
  useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin \
    --user-group "$SVC_USER"
fi
install -d -m 0755 -o root -g root "$PREFIX" "$PREFIX/models" "$PREFIX/scripts"
install -d -m 0750 -o root -g "$SVC_USER" "$CONF_DIR"
install -d -m 0700 -o "$SVC_USER" -g "$SVC_USER" "$DATA_DIR"

# ------------------------------------------------------------------------ virtualenv + code
if [[ ! -x $VENV/bin/python ]]; then
  say "Creating virtualenv $VENV"
  "$PYTHON" -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install --quiet --disable-pip-version-check --upgrade pip
packages=("$SRC/contracts" "$SRC/edge")
[[ $WITH_SIM -eq 1 ]] && packages+=("$SRC/simulator")
say "Installing rv-edge into $VENV"
"$VENV/bin/python" -m pip install --quiet --disable-pip-version-check "${packages[@]}"
# Same version number, new code: reinstall our own packages without touching dependencies.
"$VENV/bin/python" -m pip install --quiet --disable-pip-version-check --no-deps --force-reinstall \
  "${packages[@]}"
chmod -R go-w "$PREFIX"

# ---------------------------------------------------------------------------------- model
install -m 0644 "$SRC/edge/scripts/fetch_models.py" "$PREFIX/scripts/fetch_models.py"
model_file="yolox_$MODEL.onnx"
if [[ -f $SRC/edge/models/$model_file && ! -f $PREFIX/models/$model_file ]]; then
  install -m 0644 "$SRC/edge/models/$model_file" "$PREFIX/models/$model_file"
fi
say "Fetching / verifying $model_file"
"$VENV/bin/python" "$PREFIX/scripts/fetch_models.py" --model "$MODEL" --dest "$PREFIX/models" \
  || die "model download failed; copy $model_file into $PREFIX/models and re-run"

# ------------------------------------------------------------------- edge-ui (setup wizard)
ui_dist="$SRC/web/apps/edge-ui/dist"
if [[ -f $ui_dist/index.html ]]; then
  say "Installing the setup wizard (edge-ui)"
  rm -rf "$PREFIX/edge-ui.new"
  cp -r "$ui_dist" "$PREFIX/edge-ui.new"
  rm -rf "$PREFIX/edge-ui"
  mv "$PREFIX/edge-ui.new" "$PREFIX/edge-ui"
  chmod -R a+rX,go-w "$PREFIX/edge-ui"
elif [[ ! -d $PREFIX/edge-ui ]]; then
  warn "edge-ui is not built ($ui_dist missing): the LAN API works, the setup wizard page does not."
  warn "Build it on a dev machine (cd web && pnpm --filter ./apps/edge-ui build) and re-run."
fi

# ------------------------------------------------------------------------------- settings
if [[ ! -f $CONF ]]; then
  say "Writing $CONF"
  tmp=$(mktemp)
  sed -e "s#^model_path: .*#model_path: $PREFIX/models/$model_file#" \
    "$SRC/deploy/edge/edge.example.yaml" >"$tmp"
  if [[ -n $CLOUD_URL ]]; then
    sed -i "s#^cloud_url:.*#cloud_url: $CLOUD_URL#" "$tmp"
  fi
  install -m 0640 -o root -g "$SVC_USER" "$tmp" "$CONF"
  rm -f "$tmp"
else
  say "Keeping existing $CONF"
  grep -q "^model_path: $PREFIX/models/$model_file" "$CONF" \
    || warn "$CONF uses another model_path; edit it to switch to $model_file"
fi

# -------------------------------------------------------------------------------- systemd
say "Installing $UNIT"
install -m 0644 "$SRC/deploy/edge/linux/rv-edge.service" "$UNIT"
systemctl daemon-reload
systemctl enable rv-edge.service >/dev/null

# --------------------------------------------------------------------------------- pairing
if [[ -n $PAIR_CODE ]]; then
  say "Pairing with $CLOUD_URL"
  systemctl stop rv-edge.service 2>/dev/null || true # the running engine holds the secrets file
  runuser -u "$SVC_USER" -- "$VENV/bin/rv-edge" pair --config "$CONF" \
    --code "$PAIR_CODE" --cloud "$CLOUD_URL"
fi

if [[ $START -eq 1 ]]; then
  say "Starting rv-edge.service"
  systemctl restart rv-edge.service
  sleep 3
  systemctl --no-pager --lines=0 status rv-edge.service || true
  if command -v curl >/dev/null; then
    port=$(sed -n 's/^local_port:[[:space:]]*\([0-9]*\).*/\1/p' "$CONF")
    for _ in $(seq 1 20); do
      curl -fsS "http://127.0.0.1:${port:-8787}/local/health" >/dev/null 2>&1 && break
      sleep 1
    done
    curl -fsS "http://127.0.0.1:${port:-8787}/local/health" >/dev/null 2>&1 \
      || warn "the LAN API does not answer yet; check: journalctl -u rv-edge -n 50"
  fi
fi

ip=$(hostname -I 2>/dev/null | awk '{print $1}')
cat <<EOF

Restaurant Vision edge installed.
  Setup wizard   http://${ip:-<this-pc-ip>}:8787/   (choose the setup PIN on first visit)
  Local alerts   http://${ip:-<this-pc-ip>}:8787/local-alerts
  Settings       $CONF
  Data           $DATA_DIR (back up; contains the device token and camera credentials)
  Logs           journalctl -u rv-edge -f
  Pair later     sudo -u $SVC_USER $VENV/bin/rv-edge pair --config $CONF --code CODE --cloud URL
                 then: sudo systemctl restart rv-edge
  Capacity       sudo -u $SVC_USER $VENV/bin/rv-edge check --config $CONF
Allow TCP 8787 from the restaurant LAN only (e.g. ufw allow from 192.168.1.0/24 to any port 8787).
EOF
