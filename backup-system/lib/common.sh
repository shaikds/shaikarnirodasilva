#!/usr/bin/env bash
# lib/common.sh - Shared utilities: logging, config reading, error handling
# Single Responsibility: provides foundation functions for all other scripts

set -euo pipefail

# ──────────────────────────────────────────────
# Global variables (set once, read everywhere)
# ──────────────────────────────────────────────

BACKUP_SYSTEM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${CONFIG_FILE:-${BACKUP_SYSTEM_DIR}/config/backup.yaml}"
LOG_FILE="${LOG_FILE:-${BACKUP_SYSTEM_DIR}/logs/backup.log}"
TEMP_DIR="${TEMP_DIR:-/tmp/backup-staging}"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"
BACKUP_START_TIME=""
BACKUP_ERRORS=0
BACKUP_SUCCESSES=0

# ──────────────────────────────────────────────
# Colors (disabled if not a terminal)
# ──────────────────────────────────────────────

if [[ -t 1 ]]; then
    COLOR_RED='\033[0;31m'
    COLOR_GREEN='\033[0;32m'
    COLOR_YELLOW='\033[0;33m'
    COLOR_BLUE='\033[0;34m'
    COLOR_CYAN='\033[0;36m'
    COLOR_RESET='\033[0m'
    COLOR_BOLD='\033[1m'
else
    COLOR_RED=''
    COLOR_GREEN=''
    COLOR_YELLOW=''
    COLOR_BLUE=''
    COLOR_CYAN=''
    COLOR_RESET=''
    COLOR_BOLD=''
fi

# ──────────────────────────────────────────────
# Logging (each function = one log level)
# ──────────────────────────────────────────────

common_log() {
    local level="$1" color="$2" message="$3"
    local timestamp
    timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
    local formatted="${color}[${timestamp}] [${level}]${COLOR_RESET} ${message}"

    echo -e "$formatted" >&2

    # Append to log file (without color codes)
    local log_dir
    log_dir="$(dirname "$LOG_FILE")"
    [[ -d "$log_dir" ]] || mkdir -p "$log_dir"
    echo "[${timestamp}] [${level}] ${message}" >> "$LOG_FILE"
}

log_info()    { common_log "INFO"    "$COLOR_BLUE"   "$1"; }
log_success() { common_log "SUCCESS" "$COLOR_GREEN"  "$1"; }
log_warn()    { common_log "WARN"    "$COLOR_YELLOW" "$1"; }
log_error()   { common_log "ERROR"   "$COLOR_RED"    "$1"; BACKUP_ERRORS=$((BACKUP_ERRORS + 1)); }
log_debug()   { [[ "$VERBOSE" == "true" ]] && common_log "DEBUG" "$COLOR_CYAN" "$1" || true; }

# ──────────────────────────────────────────────
# Config reading (wraps yq - supports both mikefarah and Python versions)
# ──────────────────────────────────────────────

# Detect yq variant once
_yq_variant=""
_detect_yq_variant() {
    if [[ -n "$_yq_variant" ]]; then return; fi
    local help
    help="$(yq --help 2>&1)" || true
    if echo "$help" | grep -qi "mikefarah\|eval"; then
        _yq_variant="mikefarah"
    else
        _yq_variant="python"
    fi
}

_yq_read() {
    local path="$1"
    local config_file="$2"
    _detect_yq_variant

    if [[ "$_yq_variant" == "mikefarah" ]]; then
        yq eval "$path" "$config_file" 2>/dev/null
    else
        # Python yq (jq wrapper for YAML)
        yq -r "$path // empty" "$config_file" 2>/dev/null
    fi
}

_yq_read_array() {
    local path="$1"
    local config_file="$2"
    _detect_yq_variant

    if [[ "$_yq_variant" == "mikefarah" ]]; then
        yq eval "${path}[]" "$config_file" 2>/dev/null
    else
        yq -r "${path}[]? // empty" "$config_file" 2>/dev/null
    fi
}

_yq_validate() {
    local config_file="$1"
    _detect_yq_variant

    if [[ "$_yq_variant" == "mikefarah" ]]; then
        yq eval '.' "$config_file" &>/dev/null
    else
        yq '.' "$config_file" &>/dev/null
    fi
}

get_config() {
    local path="$1"
    local default="${2:-}"
    local config_file="${3:-$CONFIG_FILE}"

    if [[ ! -f "$config_file" ]]; then
        [[ -n "$default" ]] && echo "$default" && return 0
        log_error "Config file not found: $config_file"
        return 1
    fi

    local value
    value="$(_yq_read "$path" "$config_file")" || true

    if [[ -z "$value" || "$value" == "null" ]]; then
        echo "$default"
    else
        echo "$value"
    fi
}

get_config_array() {
    local path="$1"
    local config_file="${2:-$CONFIG_FILE}"

    if [[ ! -f "$config_file" ]]; then
        return 0
    fi

    _yq_read_array "$path" "$config_file" || true
}

config_exists() {
    local path="$1"
    local config_file="${2:-$CONFIG_FILE}"
    local value
    value="$(_yq_read "$path" "$config_file")" || true
    [[ -n "$value" && "$value" != "null" ]]
}

# ──────────────────────────────────────────────
# Dependency checking
# ──────────────────────────────────────────────

check_dependency() {
    local cmd="$1"
    local install_hint="${2:-}"

    if ! command -v "$cmd" &>/dev/null; then
        if [[ -n "$install_hint" ]]; then
            log_error "'$cmd' not found. Install with: $install_hint"
        else
            log_error "'$cmd' not found. Run ./install.sh to install dependencies."
        fi
        return 1
    fi
    return 0
}

require_dependencies() {
    local missing=0
    for cmd in "$@"; do
        check_dependency "$cmd" || missing=$((missing + 1))
    done
    if [[ $missing -gt 0 ]]; then
        log_error "$missing required dependencies missing. Run ./install.sh"
        return 1
    fi
}

# ──────────────────────────────────────────────
# Temp directory management
# ──────────────────────────────────────────────

ensure_temp_dir() {
    local dir="${1:-$TEMP_DIR}"
    mkdir -p "$dir"
    echo "$dir"
}

cleanup_temp_dir() {
    local dir="${1:-$TEMP_DIR}"
    if [[ -d "$dir" ]]; then
        rm -rf "$dir"
        log_debug "Cleaned up temp dir: $dir"
    fi
}

# ──────────────────────────────────────────────
# Trap handler for cleanup on exit
# ──────────────────────────────────────────────

_cleanup_handlers=()

register_cleanup() {
    _cleanup_handlers+=("$1")
}

run_cleanup() {
    local handler
    for handler in "${_cleanup_handlers[@]:-}"; do
        [[ -n "$handler" ]] && eval "$handler" || true
    done
}

trap run_cleanup EXIT

# ──────────────────────────────────────────────
# Timeout execution
# ──────────────────────────────────────────────

run_with_timeout() {
    local timeout_sec="$1"
    shift
    if command -v timeout &>/dev/null; then
        timeout "$timeout_sec" "$@"
    else
        "$@"
    fi
}

# ──────────────────────────────────────────────
# Lock file management (prevents concurrent runs)
# ──────────────────────────────────────────────

acquire_lock() {
    local lock_file="$1"
    local lock_dir
    lock_dir="$(dirname "$lock_file")"
    [[ -d "$lock_dir" ]] || mkdir -p "$lock_dir"

    if [[ -f "$lock_file" ]]; then
        local pid
        pid="$(cat "$lock_file" 2>/dev/null)" || true
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log_error "Another backup is running (PID: $pid). Lock file: $lock_file"
            return 1
        fi
        log_warn "Stale lock file found, removing: $lock_file"
        rm -f "$lock_file"
    fi

    echo $$ > "$lock_file"
    register_cleanup "rm -f '$lock_file'"
    return 0
}

release_lock() {
    local lock_file="$1"
    rm -f "$lock_file"
}

# ──────────────────────────────────────────────
# Status file management
# ──────────────────────────────────────────────

write_status() {
    local status_file="$1"
    local status="$2"
    local pid="${3:-$$}"
    local timestamp
    timestamp="$(date '+%Y-%m-%d %H:%M:%S')"

    cat > "$status_file" <<EOF
status=${status}
pid=${pid}
timestamp=${timestamp}
errors=${BACKUP_ERRORS}
successes=${BACKUP_SUCCESSES}
EOF
}

read_status() {
    local status_file="$1"
    if [[ -f "$status_file" ]]; then
        cat "$status_file"
    else
        echo "status=never_run"
    fi
}

# ──────────────────────────────────────────────
# Formatting utilities
# ──────────────────────────────────────────────

format_bytes() {
    local bytes="$1"
    if [[ $bytes -ge 1073741824 ]]; then
        echo "$(awk "BEGIN {printf \"%.2f GB\", $bytes/1073741824}")"
    elif [[ $bytes -ge 1048576 ]]; then
        echo "$(awk "BEGIN {printf \"%.2f MB\", $bytes/1048576}")"
    elif [[ $bytes -ge 1024 ]]; then
        echo "$(awk "BEGIN {printf \"%.2f KB\", $bytes/1024}")"
    else
        echo "${bytes} B"
    fi
}

format_duration() {
    local seconds="$1"
    if [[ $seconds -ge 3600 ]]; then
        printf '%dh %dm %ds' $((seconds/3600)) $((seconds%3600/60)) $((seconds%60))
    elif [[ $seconds -ge 60 ]]; then
        printf '%dm %ds' $((seconds/60)) $((seconds%60))
    else
        printf '%ds' "$seconds"
    fi
}

# ──────────────────────────────────────────────
# Docker exec wrapper (shared by multiple handlers)
# ──────────────────────────────────────────────

docker_exec() {
    local container="$1"
    shift
    if [[ -z "$container" ]]; then
        "$@"
    else
        docker exec "$container" "$@"
    fi
}

docker_exec_pipe() {
    local container="$1"
    shift
    if [[ -z "$container" ]]; then
        "$@"
    else
        docker exec -i "$container" "$@"
    fi
}

# ──────────────────────────────────────────────
# Validation helpers
# ──────────────────────────────────────────────

validate_project_name() {
    local name="$1"
    if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid project name: '$name'. Only alphanumeric, hyphens, underscores allowed."
        return 1
    fi
    if [[ ${#name} -gt 64 ]]; then
        log_error "Project name too long (max 64 chars): '$name'"
        return 1
    fi
    return 0
}

validate_config() {
    local config_file="${1:-$CONFIG_FILE}"
    if [[ ! -f "$config_file" ]]; then
        log_error "Config file not found: $config_file"
        return 1
    fi
    if ! _yq_validate "$config_file"; then
        log_error "Invalid YAML in config file: $config_file"
        return 1
    fi
    return 0
}

# ──────────────────────────────────────────────
# Backup timing
# ──────────────────────────────────────────────

start_timer() {
    BACKUP_START_TIME="$(date +%s)"
}

elapsed_seconds() {
    local now
    now="$(date +%s)"
    echo $((now - BACKUP_START_TIME))
}
