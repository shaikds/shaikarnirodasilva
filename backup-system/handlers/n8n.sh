#!/usr/bin/env bash
# handlers/n8n.sh - n8n workflow backup handler
# Strategy Pattern: implements backup_n8n() + detect_n8n()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_n8n() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting n8n backup..."

    local container
    container="$(get_config '.backup.services.n8n.docker_container' '' "$config_file")"

    local temp_dir
    temp_dir="$(ensure_temp_dir)/n8n"
    mkdir -p "${temp_dir}/workflows" "${temp_dir}/credentials"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would backup n8n workflows and credentials"
        return 0
    fi

    # Export workflows
    log_info "Exporting n8n workflows..."
    if [[ -n "$container" ]]; then
        docker exec "$container" n8n export:workflow --all --pretty \
            --output=/tmp/n8n-backup-workflows/ 2>/dev/null && \
        docker cp "${container}:/tmp/n8n-backup-workflows/" "${temp_dir}/workflows/" 2>/dev/null || {
            log_error "Failed to export n8n workflows from container"
            return 1
        }
        docker exec "$container" rm -rf /tmp/n8n-backup-workflows/ 2>/dev/null || true
    else
        n8n export:workflow --all --pretty \
            --output="${temp_dir}/workflows/" 2>/dev/null || {
            log_error "Failed to export n8n workflows"
            return 1
        }
    fi

    local workflow_count
    workflow_count="$(find "${temp_dir}/workflows" -name "*.json" 2>/dev/null | wc -l)"
    log_info "Exported $workflow_count workflows"

    # Export credentials (encrypted)
    log_info "Exporting n8n credentials..."
    if [[ -n "$container" ]]; then
        docker exec "$container" n8n export:credentials --all \
            --output=/tmp/n8n-backup-credentials/ 2>/dev/null && \
        docker cp "${container}:/tmp/n8n-backup-credentials/" "${temp_dir}/credentials/" 2>/dev/null || {
            log_warn "Failed to export n8n credentials (might need --decrypted flag)"
        }
        docker exec "$container" rm -rf /tmp/n8n-backup-credentials/ 2>/dev/null || true
    else
        n8n export:credentials --all \
            --output="${temp_dir}/credentials/" 2>/dev/null || {
            log_warn "Failed to export n8n credentials"
        }
    fi

    # Backup to destinations
    backup_to_all_destinations "n8n" "$temp_dir" || {
        log_error "Failed to upload n8n backup"
        rm -rf "$temp_dir"
        return 1
    }

    log_success "n8n backed up: $workflow_count workflows"
    rm -rf "$temp_dir"
    return 0
}

restore_n8n() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring n8n from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored n8n data to: $target_dir"
    log_info "To import workflows: n8n import:workflow --input=<workflow-file>"
    log_info "To import credentials: n8n import:credentials --input=<credentials-file>"
}
