#!/usr/bin/env bash
# handlers/files.sh - Generic files/configs/env backup handler
# Strategy Pattern: implements backup_files() + detect_files()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_files() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting files backup..."

    local enabled
    enabled="$(get_config '.backup.files.enabled' 'true' "$config_file")"
    if [[ "$enabled" != "true" ]]; then
        log_debug "Files backup disabled"
        return 0
    fi

    local include_paths=()
    local exclude_args=()

    # Build include paths
    while IFS= read -r path; do
        [[ -z "$path" ]] && continue
        if [[ -e "$path" ]] || compgen -G "$path" &>/dev/null; then
            include_paths+=("$path")
        else
            log_debug "Include path not found, skipping: $path"
        fi
    done < <(get_config_array '.backup.files.include' "$config_file")

    if [[ ${#include_paths[@]} -eq 0 ]]; then
        log_warn "No files found to backup"
        return 0
    fi

    # Build exclude args
    while IFS= read -r pattern; do
        [[ -z "$pattern" ]] && continue
        exclude_args+=(--exclude "$pattern")
    done < <(get_config_array '.backup.files.exclude' "$config_file")

    # Check for .env files (warn about sensitive data)
    for path in "${include_paths[@]}"; do
        if [[ "$path" == *".env"* ]]; then
            log_warn "Backing up .env file: $path (will be encrypted by Restic)"
        fi
    done

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would backup files: ${include_paths[*]}"
        return 0
    fi

    local dest
    while IFS= read -r dest; do
        [[ -z "$dest" ]] && continue
        local actual_url="${dest#*:}"
        [[ "$dest" == local:* ]] && actual_url="${dest#local:}"

        restic -r "$actual_url" backup \
            --tag "files" \
            "${exclude_args[@]}" \
            "${include_paths[@]}" 2>&1 || {
            log_error "Files backup failed to $actual_url"
            continue
        }
        log_success "Files backed up to $actual_url"
        BACKUP_SUCCESSES=$((BACKUP_SUCCESSES + 1))
    done < <(get_enabled_destinations "$config_file")

    return 0
}

restore_files() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
}
