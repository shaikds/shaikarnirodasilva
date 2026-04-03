#!/usr/bin/env bash
# handlers/postgres.sh - PostgreSQL backup handler
# Strategy Pattern: implements backup_postgresql() + detect_postgres()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_stdin_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_postgresql() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting PostgreSQL backup..."

    local host port user dump_format container
    host="$(get_config '.backup.services.postgresql.host' 'localhost' "$config_file")"
    port="$(get_config '.backup.services.postgresql.port' '5432' "$config_file")"
    user="$(get_config '.backup.services.postgresql.user' 'postgres' "$config_file")"
    dump_format="$(get_config '.backup.services.postgresql.dump_format' 'custom' "$config_file")"
    container="$(get_config '.backup.services.postgresql.docker_container' '' "$config_file")"

    # Get database list
    local databases=()
    while IFS= read -r db; do
        [[ -n "$db" ]] && databases+=("$db")
    done < <(get_config_array '.backup.services.postgresql.databases' "$config_file")

    # If no databases specified, get all
    if [[ ${#databases[@]} -eq 0 ]]; then
        local db_list
        db_list="$(docker_exec "$container" psql -h "$host" -p "$port" -U "$user" -At -c \
            "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres';" 2>/dev/null)" || {
            log_error "Failed to list PostgreSQL databases"
            return 1
        }
        while IFS= read -r db; do
            [[ -n "$db" ]] && databases+=("$db")
        done <<< "$db_list"
    fi

    if [[ ${#databases[@]} -eq 0 ]]; then
        log_warn "No PostgreSQL databases found to backup"
        return 0
    fi

    log_info "Databases to backup: ${databases[*]}"

    local format_flag="-Fc"
    local ext="dump"
    if [[ "$dump_format" == "sql" ]]; then
        format_flag=""
        ext="sql"
    fi

    for db in "${databases[@]}"; do
        log_info "Backing up database: $db"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would backup PostgreSQL database: $db"
            continue
        fi

        # Pipe pg_dump directly to restic (no intermediate files)
        docker_exec "$container" pg_dump \
            -h "$host" -p "$port" -U "$user" \
            $format_flag "$db" 2>/dev/null | \
            backup_stdin_to_all_destinations "postgresql,${db}" "postgresql-${db}.${ext}" || {
            log_error "Failed to backup database: $db"
            continue
        }

        log_success "Database backed up: $db"
    done

    return 0
}

restore_postgresql() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring PostgreSQL from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored dump files to: $target_dir"
    log_info "To restore a database, run: pg_restore -d <dbname> <dump-file>"
}
