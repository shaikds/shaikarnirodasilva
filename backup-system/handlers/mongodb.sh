#!/usr/bin/env bash
# handlers/mongodb.sh - MongoDB backup handler
# Strategy Pattern: implements backup_mongodb() + detect_mongodb()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_stdin_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_mongodb() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting MongoDB backup..."

    local host port uri container
    host="$(get_config '.backup.services.mongodb.host' 'localhost' "$config_file")"
    port="$(get_config '.backup.services.mongodb.port' '27017' "$config_file")"
    uri="$(get_config '.backup.services.mongodb.uri' '' "$config_file")"
    container="$(get_config '.backup.services.mongodb.docker_container' '' "$config_file")"

    local conn_args=()
    if [[ -n "$uri" ]]; then
        conn_args+=(--uri "$uri")
    else
        conn_args+=(--host "$host" --port "$port")
    fi

    # Get database list
    local databases=()
    while IFS= read -r db; do
        [[ -n "$db" ]] && databases+=("$db")
    done < <(get_config_array '.backup.services.mongodb.databases' "$config_file")

    if [[ ${#databases[@]} -eq 0 ]]; then
        # Backup all databases as a single archive
        log_info "Backing up all MongoDB databases (archive mode)"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would backup all MongoDB databases"
            return 0
        fi

        docker_exec "$container" mongodump \
            "${conn_args[@]}" \
            --archive 2>/dev/null | \
            backup_stdin_to_all_destinations "mongodb,all" "mongodb-all.archive" || {
            log_error "Failed to backup MongoDB (all databases)"
            return 1
        }

        log_success "All MongoDB databases backed up"
    else
        # Backup specific databases
        for db in "${databases[@]}"; do
            log_info "Backing up MongoDB database: $db"

            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY-RUN] Would backup MongoDB database: $db"
                continue
            fi

            docker_exec "$container" mongodump \
                "${conn_args[@]}" \
                --db "$db" --archive 2>/dev/null | \
                backup_stdin_to_all_destinations "mongodb,${db}" "mongodb-${db}.archive" || {
                log_error "Failed to backup MongoDB database: $db"
                continue
            }

            log_success "MongoDB database backed up: $db"
        done
    fi

    return 0
}

restore_mongodb() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring MongoDB from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored archive to: $target_dir"
    log_info "To restore, run: mongorestore --archive=<archive-file>"
}
