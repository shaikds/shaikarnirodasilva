#!/usr/bin/env bash
# handlers/mysql.sh - MySQL/MariaDB backup handler
# Strategy Pattern: implements backup_mysql() + detect_mysql()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_stdin_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_mysql() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting MySQL backup..."

    local host port user password container
    host="$(get_config '.backup.services.mysql.host' 'localhost' "$config_file")"
    port="$(get_config '.backup.services.mysql.port' '3306' "$config_file")"
    user="$(get_config '.backup.services.mysql.user' 'root' "$config_file")"
    password="$(get_config '.backup.services.mysql.password' '' "$config_file")"
    container="$(get_config '.backup.services.mysql.docker_container' '' "$config_file")"

    local pass_arg=""
    [[ -n "$password" ]] && pass_arg="-p${password}"

    # Get database list
    local databases=()
    while IFS= read -r db; do
        [[ -n "$db" ]] && databases+=("$db")
    done < <(get_config_array '.backup.services.mysql.databases' "$config_file")

    # If no databases specified, get all
    if [[ ${#databases[@]} -eq 0 ]]; then
        local db_list
        db_list="$(docker_exec "$container" mysql -h "$host" -P "$port" -u "$user" $pass_arg \
            -N -e "SHOW DATABASES;" 2>/dev/null | grep -Ev '^(information_schema|performance_schema|sys|mysql)$')" || {
            log_error "Failed to list MySQL databases"
            return 1
        }
        while IFS= read -r db; do
            [[ -n "$db" ]] && databases+=("$db")
        done <<< "$db_list"
    fi

    if [[ ${#databases[@]} -eq 0 ]]; then
        log_warn "No MySQL databases found to backup"
        return 0
    fi

    log_info "Databases to backup: ${databases[*]}"

    for db in "${databases[@]}"; do
        log_info "Backing up database: $db"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would backup MySQL database: $db"
            continue
        fi

        docker_exec "$container" mysqldump \
            -h "$host" -P "$port" -u "$user" $pass_arg \
            --single-transaction --routines --triggers \
            "$db" 2>/dev/null | \
            backup_stdin_to_all_destinations "mysql,${db}" "mysql-${db}.sql" || {
            log_error "Failed to backup database: $db"
            continue
        }

        log_success "Database backed up: $db"
    done

    return 0
}

restore_mysql() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring MySQL from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored dump files to: $target_dir"
    log_info "To restore a database, run: mysql -u <user> -p <dbname> < <dump-file>"
}
