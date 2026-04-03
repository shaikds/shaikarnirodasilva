#!/usr/bin/env bash
# handlers/docker.sh - Docker volumes & compose backup handler
# Strategy Pattern: implements backup_docker() + detect_docker()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_docker() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting Docker backup..."

    local backup_volumes backup_compose
    backup_volumes="$(get_config '.backup.services.docker.backup_volumes' 'true' "$config_file")"
    backup_compose="$(get_config '.backup.services.docker.backup_compose' 'true' "$config_file")"

    [[ "$backup_compose" == "true" ]] && _backup_docker_compose "$config_file"
    [[ "$backup_volumes" == "true" ]] && _backup_docker_volumes "$config_file"

    return 0
}

_backup_docker_compose() {
    local config_file="$1"
    log_info "Backing up Docker Compose files..."

    # Find compose files
    local compose_files=()
    while IFS= read -r file; do
        [[ -n "$file" ]] && compose_files+=("$file")
    done < <(find . -maxdepth 3 \( -name "docker-compose*.yml" -o -name "docker-compose*.yaml" -o -name "compose.yml" -o -name "compose.yaml" \) 2>/dev/null)

    if [[ ${#compose_files[@]} -eq 0 ]]; then
        log_debug "No Docker Compose files found"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would backup compose files: ${compose_files[*]}"
        return 0
    fi

    backup_to_all_destinations "docker,compose" "${compose_files[@]}" || {
        log_error "Failed to backup Docker Compose files"
        return 1
    }

    log_success "Docker Compose files backed up: ${#compose_files[@]} files"
}

_backup_docker_volumes() {
    local config_file="$1"
    log_info "Backing up Docker volumes..."

    # Get volume list
    local volumes=()
    while IFS= read -r vol; do
        [[ -n "$vol" ]] && volumes+=("$vol")
    done < <(get_config_array '.backup.services.docker.volumes' "$config_file")

    # Auto-detect volumes if none specified
    if [[ ${#volumes[@]} -eq 0 ]]; then
        while IFS= read -r vol; do
            [[ -n "$vol" ]] && volumes+=("$vol")
        done < <(docker volume ls --format '{{.Name}}' 2>/dev/null)
    fi

    if [[ ${#volumes[@]} -eq 0 ]]; then
        log_debug "No Docker volumes found"
        return 0
    fi

    # Load exclude list
    local exclude_volumes=()
    while IFS= read -r pattern; do
        [[ -n "$pattern" ]] && exclude_volumes+=("$pattern")
    done < <(get_config_array '.backup.services.docker.exclude_volumes' "$config_file")

    local temp_dir
    temp_dir="$(ensure_temp_dir)/docker-volumes"
    mkdir -p "$temp_dir"

    for volume in "${volumes[@]}"; do
        # Check exclusions
        local skip=false
        for pattern in "${exclude_volumes[@]}"; do
            if [[ "$volume" == *"$pattern"* ]]; then
                log_debug "Skipping excluded volume: $volume"
                skip=true
                break
            fi
        done
        [[ "$skip" == "true" ]] && continue

        log_info "Backing up volume: $volume"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would backup Docker volume: $volume"
            continue
        fi

        local tar_file="${temp_dir}/${volume}.tar.gz"

        # Use temporary alpine container to tar the volume contents
        docker run --rm \
            -v "${volume}:/volume-data:ro" \
            -v "${temp_dir}:/backup" \
            alpine \
            tar czf "/backup/${volume}.tar.gz" -C /volume-data . 2>/dev/null || {
            log_error "Failed to backup Docker volume: $volume"
            continue
        }

        if [[ -f "$tar_file" ]]; then
            backup_to_all_destinations "docker,volume,${volume}" "$tar_file" || {
                log_error "Failed to upload Docker volume: $volume"
                continue
            }
            log_success "Docker volume backed up: $volume"
            rm -f "$tar_file"
        fi
    done

    rmdir "$temp_dir" 2>/dev/null || true
    return 0
}

restore_docker() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring Docker backup from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored Docker data to: $target_dir"
    log_info "To restore a volume: docker run --rm -v <volume>:/volume -v <target>:/backup alpine tar xzf /backup/<volume>.tar.gz -C /volume"
}
