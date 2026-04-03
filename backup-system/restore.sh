#!/usr/bin/env bash
# restore.sh - Restore orchestrator
# Single Responsibility: list snapshots and restore from backup

set -euo pipefail

BACKUP_SYSTEM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BACKUP_SYSTEM_DIR

source "${BACKUP_SYSTEM_DIR}/lib/common.sh"
source "${BACKUP_SYSTEM_DIR}/lib/destinations.sh"

# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

LIST_MODE=false
SNAPSHOT_ID=""
SERVICE_FILTER=""
TARGET_DIR=""

show_help() {
    cat <<'EOF'
Universal Backup System - Restore

Usage: ./restore.sh [options]

Options:
  --config <path>    Path to config file (default: ./config/backup.yaml)
  --list             List available snapshots
  --snapshot <id>    Restore specific snapshot by ID
  --service <name>   Filter snapshots by service tag
  --target <path>    Restore target directory (default: ./restored/)
  --dry-run          Show what would be restored
  --help             Show this help message

Examples:
  ./restore.sh --list                           # List all snapshots
  ./restore.sh --list --service postgresql      # List PostgreSQL snapshots
  ./restore.sh --snapshot abc123 --target ./out # Restore snapshot to ./out
EOF
    exit 0
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --config)     CONFIG_FILE="$2"; shift 2 ;;
            --list)       LIST_MODE=true; shift ;;
            --snapshot)   SNAPSHOT_ID="$2"; shift 2 ;;
            --service)    SERVICE_FILTER="$2"; shift 2 ;;
            --target)     TARGET_DIR="$2"; shift 2 ;;
            --dry-run)    DRY_RUN=true; shift ;;
            --help|-h)    show_help ;;
            *)            log_error "Unknown option: $1"; show_help ;;
        esac
    done
}

# ──────────────────────────────────────────────
# List snapshots
# ──────────────────────────────────────────────

list_snapshots_formatted() {
    local raw_json
    raw_json="$(list_snapshots "$CONFIG_FILE" "$SERVICE_FILTER")"

    if [[ -z "$raw_json" || "$raw_json" == "null" || "$raw_json" == "[]" ]]; then
        log_warn "No snapshots found"
        return 0
    fi

    echo "$raw_json" | jq -r '
        sort_by(.time) | reverse |
        .[] |
        "  \(.short_id // .id[0:8])  \(.time[0:19])  \(.tags // [] | join(","))  \(.paths // [] | join(", "))"
    ' 2>/dev/null || {
        echo "$raw_json" | jq '.' 2>/dev/null || echo "$raw_json"
    }
}

# ──────────────────────────────────────────────
# Restore
# ──────────────────────────────────────────────

run_restore() {
    if [[ -z "$SNAPSHOT_ID" ]]; then
        log_error "No snapshot ID specified. Use --snapshot <id>"
        log_info "Run --list to see available snapshots"
        return 1
    fi

    local target="${TARGET_DIR:-./restored}"

    if [[ -d "$target" ]] && ls "$target"/* &>/dev/null 2>&1; then
        log_warn "Target directory is not empty: $target"
        log_warn "Files may be overwritten"
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would restore snapshot $SNAPSHOT_ID to $target"
        return 0
    fi

    restore_snapshot "$CONFIG_FILE" "$SNAPSHOT_ID" "$target"
}

# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

main() {
    parse_args "$@"

    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_error "Config file not found: $CONFIG_FILE"
        return 1
    fi

    setup_restic_password "$CONFIG_FILE" || return 1

    if [[ "$LIST_MODE" == "true" ]]; then
        log_info "Available snapshots:"
        echo ""
        printf "  %-10s %-20s %-30s %s\n" "ID" "DATE" "TAGS" "PATHS"
        printf "  %-10s %-20s %-30s %s\n" "──────" "────────────────" "──────────────────────" "──────"
        list_snapshots_formatted
    elif [[ -n "$SNAPSHOT_ID" ]]; then
        run_restore
    else
        log_error "Specify --list or --snapshot <id>"
        show_help
    fi
}

main "$@"
