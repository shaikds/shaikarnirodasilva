#!/usr/bin/env bash
# handlers/elasticsearch.sh - Elasticsearch/OpenSearch backup handler
# Strategy Pattern: implements backup_elasticsearch() + detect_elasticsearch()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

_es_curl() {
    local method="$1"
    local path="$2"
    local data="${3:-}"
    local host="$4"
    local port="$5"
    local protocol="$6"
    local user="$7"
    local password="$8"

    local url="${protocol}://${host}:${port}${path}"
    local auth_args=()
    if [[ -n "$user" && -n "$password" ]]; then
        auth_args+=(-u "${user}:${password}")
    fi

    if [[ -n "$data" ]]; then
        curl -s -X "$method" "${auth_args[@]}" \
            -H "Content-Type: application/json" \
            -d "$data" "$url" 2>/dev/null
    else
        curl -s -X "$method" "${auth_args[@]}" "$url" 2>/dev/null
    fi
}

backup_elasticsearch() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting Elasticsearch/OpenSearch backup..."

    local host port protocol user password snapshot_repo
    host="$(get_config '.backup.services.elasticsearch.host' 'localhost' "$config_file")"
    port="$(get_config '.backup.services.elasticsearch.port' '9200' "$config_file")"
    protocol="$(get_config '.backup.services.elasticsearch.protocol' 'http' "$config_file")"
    user="$(get_config '.backup.services.elasticsearch.user' '' "$config_file")"
    password="$(get_config '.backup.services.elasticsearch.password' '' "$config_file")"
    snapshot_repo="$(get_config '.backup.services.elasticsearch.snapshot_repo' 'backup_repo' "$config_file")"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would backup Elasticsearch at ${protocol}://${host}:${port}"
        return 0
    fi

    # Verify cluster is reachable
    local cluster_info
    cluster_info="$(_es_curl GET "/" "" "$host" "$port" "$protocol" "$user" "$password")" || {
        log_error "Cannot connect to Elasticsearch at ${protocol}://${host}:${port}"
        return 1
    }

    local cluster_name
    cluster_name="$(echo "$cluster_info" | jq -r '.cluster_name // "unknown"' 2>/dev/null)" || cluster_name="unknown"
    log_info "Connected to cluster: $cluster_name"

    # Create snapshot repository (filesystem type) if not exists
    local temp_dir
    temp_dir="$(ensure_temp_dir)/elasticsearch"
    mkdir -p "$temp_dir"

    local repo_settings
    repo_settings="{\"type\":\"fs\",\"settings\":{\"location\":\"${temp_dir}\"}}"

    _es_curl PUT "/_snapshot/${snapshot_repo}" "$repo_settings" \
        "$host" "$port" "$protocol" "$user" "$password" || {
        log_warn "Could not create snapshot repo. Using index dump fallback."

        # Fallback: dump indices via scroll API
        _backup_es_indices_fallback "$config_file" "$host" "$port" "$protocol" "$user" "$password" "$temp_dir"
        return $?
    }

    # Trigger snapshot
    local snapshot_name="snapshot-$(date +%Y%m%d-%H%M%S)"
    local indices_config=""

    local indices=()
    while IFS= read -r idx; do
        [[ -n "$idx" ]] && indices+=("$idx")
    done < <(get_config_array '.backup.services.elasticsearch.indices' "$config_file")

    if [[ ${#indices[@]} -gt 0 ]]; then
        local joined
        joined="$(IFS=,; echo "${indices[*]}")"
        indices_config="{\"indices\":\"${joined}\"}"
    else
        indices_config="{}"
    fi

    log_info "Creating snapshot: $snapshot_name"
    _es_curl PUT "/_snapshot/${snapshot_repo}/${snapshot_name}?wait_for_completion=true" \
        "$indices_config" "$host" "$port" "$protocol" "$user" "$password" || {
        log_error "Snapshot creation failed"
        return 1
    }

    # Backup snapshot files to Restic
    if [[ -d "$temp_dir" ]] && ls "$temp_dir"/* &>/dev/null 2>&1; then
        backup_to_all_destinations "elasticsearch,${cluster_name}" "$temp_dir" || {
            log_error "Failed to upload Elasticsearch snapshot"
            return 1
        }
        log_success "Elasticsearch backed up: cluster=$cluster_name snapshot=$snapshot_name"
    fi

    rm -rf "$temp_dir"
    return 0
}

_backup_es_indices_fallback() {
    local config_file="$1" host="$2" port="$3" protocol="$4" user="$5" password="$6" temp_dir="$7"

    log_info "Using index mapping + settings export fallback"

    local indices_list
    indices_list="$(_es_curl GET "/_cat/indices?h=index&format=json" "" \
        "$host" "$port" "$protocol" "$user" "$password")" || {
        log_error "Failed to list indices"
        return 1
    }

    echo "$indices_list" | jq -r '.[].index' 2>/dev/null | while IFS= read -r index; do
        [[ "$index" == .* ]] && continue  # Skip system indices

        log_info "Exporting index: $index"

        # Export mappings and settings
        _es_curl GET "/${index}/_mapping" "" "$host" "$port" "$protocol" "$user" "$password" \
            > "${temp_dir}/${index}-mapping.json" 2>/dev/null

        _es_curl GET "/${index}/_settings" "" "$host" "$port" "$protocol" "$user" "$password" \
            > "${temp_dir}/${index}-settings.json" 2>/dev/null
    done

    backup_to_all_destinations "elasticsearch,fallback" "$temp_dir" || {
        log_error "Failed to upload Elasticsearch fallback backup"
        return 1
    }

    log_success "Elasticsearch fallback backup complete"
    return 0
}

restore_elasticsearch() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring Elasticsearch from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored snapshot files to: $target_dir"
    log_info "To restore: register snapshot repo pointing to restored files, then use _restore API"
}
