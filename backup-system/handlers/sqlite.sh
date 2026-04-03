#!/usr/bin/env bash
# handlers/sqlite.sh - SQLite backup handler
# Strategy Pattern: implements backup_sqlite() + detect_sqlite()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_sqlite() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting SQLite backup..."

    # Find all SQLite files
    local db_files=()
    while IFS= read -r pattern; do
        [[ -z "$pattern" ]] && continue
        while IFS= read -r file; do
            [[ -n "$file" && -f "$file" ]] && db_files+=("$file")
        done < <(find . -maxdepth 5 -name "$(basename "$pattern")" 2>/dev/null)
    done < <(get_config_array '.backup.services.sqlite.paths' "$config_file")

    # Fallback: search for common SQLite file extensions
    if [[ ${#db_files[@]} -eq 0 ]]; then
        while IFS= read -r file; do
            [[ -n "$file" ]] && db_files+=("$file")
        done < <(find . -maxdepth 3 \( -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" \) 2>/dev/null)
    fi

    if [[ ${#db_files[@]} -eq 0 ]]; then
        log_warn "No SQLite files found to backup"
        return 0
    fi

    log_info "SQLite files to backup: ${db_files[*]}"

    local temp_dir
    temp_dir="$(ensure_temp_dir)/sqlite"
    mkdir -p "$temp_dir"

    for db_file in "${db_files[@]}"; do
        local basename
        basename="$(basename "$db_file")"
        log_info "Backing up SQLite database: $db_file"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would backup SQLite: $db_file"
            continue
        fi

        # Use .backup for a consistent binary copy (safer than .dump)
        local backup_path="${temp_dir}/${basename}"
        if sqlite3 "$db_file" ".backup '${backup_path}'" 2>/dev/null; then
            backup_to_all_destinations "sqlite,${basename}" "$backup_path" || {
                log_error "Failed to upload SQLite backup: $basename"
                continue
            }
            log_success "SQLite backed up: $db_file"
            rm -f "$backup_path"
        else
            log_error "Failed to backup SQLite: $db_file"
        fi
    done

    rmdir "$temp_dir" 2>/dev/null || true
    return 0
}

restore_sqlite() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring SQLite from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored SQLite files to: $target_dir"
}
