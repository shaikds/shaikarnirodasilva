#!/usr/bin/env bash
# handlers/redis.sh - Redis backup handler
# Strategy Pattern: implements backup_redis() + detect_redis()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_redis() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting Redis backup..."

    local host port container
    host="$(get_config '.backup.services.redis.host' 'localhost' "$config_file")"
    port="$(get_config '.backup.services.redis.port' '6379' "$config_file")"
    container="$(get_config '.backup.services.redis.docker_container' '' "$config_file")"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would backup Redis at ${host}:${port}"
        return 0
    fi

    local temp_dir
    temp_dir="$(ensure_temp_dir)/redis"
    mkdir -p "$temp_dir"
    local rdb_path="${temp_dir}/dump.rdb"

    # Try direct RDB export first (cleaner approach)
    if docker_exec "$container" redis-cli -h "$host" -p "$port" \
        --rdb "$rdb_path" &>/dev/null 2>&1 && [[ -f "$rdb_path" ]]; then
        log_info "Redis RDB exported directly"
    else
        # Fallback: trigger BGSAVE and copy RDB file
        log_info "Triggering Redis BGSAVE..."
        docker_exec "$container" redis-cli -h "$host" -p "$port" BGSAVE &>/dev/null || {
            log_error "Failed to trigger Redis BGSAVE"
            return 1
        }

        # Wait for BGSAVE to complete
        local max_wait=60
        local waited=0
        while [[ $waited -lt $max_wait ]]; do
            local save_status
            save_status="$(docker_exec "$container" redis-cli -h "$host" -p "$port" \
                LASTSAVE 2>/dev/null)" || break
            sleep 1
            local new_status
            new_status="$(docker_exec "$container" redis-cli -h "$host" -p "$port" \
                LASTSAVE 2>/dev/null)" || break
            [[ "$new_status" != "$save_status" ]] && break
            waited=$((waited + 1))
        done

        # Get RDB file location from Redis config
        local redis_dir rdb_file
        redis_dir="$(docker_exec "$container" redis-cli -h "$host" -p "$port" \
            CONFIG GET dir 2>/dev/null | tail -1)" || redis_dir="/data"
        rdb_file="$(docker_exec "$container" redis-cli -h "$host" -p "$port" \
            CONFIG GET dbfilename 2>/dev/null | tail -1)" || rdb_file="dump.rdb"

        if [[ -n "$container" ]]; then
            docker cp "${container}:${redis_dir}/${rdb_file}" "$rdb_path" 2>/dev/null || {
                log_error "Failed to copy RDB from container"
                return 1
            }
        else
            cp "${redis_dir}/${rdb_file}" "$rdb_path" 2>/dev/null || {
                log_error "Failed to copy RDB file"
                return 1
            }
        fi
    fi

    if [[ ! -f "$rdb_path" ]]; then
        log_error "Redis RDB file not found after backup"
        return 1
    fi

    backup_to_all_destinations "redis" "$rdb_path" || {
        log_error "Failed to upload Redis backup"
        rm -rf "$temp_dir"
        return 1
    }

    log_success "Redis backed up successfully"
    rm -rf "$temp_dir"
    return 0
}

restore_redis() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring Redis from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored RDB file to: $target_dir"
    log_info "To restore: stop Redis, copy dump.rdb to Redis data dir, restart Redis"
}
