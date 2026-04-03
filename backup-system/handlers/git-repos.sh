#!/usr/bin/env bash
# handlers/git-repos.sh - Git repository backup handler
# Strategy Pattern: implements backup_git() + detect_git()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_git() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting Git repository backup..."

    local bundle_enabled
    bundle_enabled="$(get_config '.backup.git.bundle' 'true' "$config_file")"

    if ! git rev-parse --git-dir &>/dev/null 2>&1; then
        log_warn "Not in a Git repository, skipping git backup"
        return 0
    fi

    local repo_name branch
    repo_name="$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")" || repo_name="unknown"
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || branch="unknown"

    log_info "Repository: $repo_name (branch: $branch)"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would backup Git repo: $repo_name"
        return 0
    fi

    if [[ "$bundle_enabled" == "true" ]]; then
        # Create git bundle (includes ALL branches and tags)
        local temp_dir
        temp_dir="$(ensure_temp_dir)/git"
        mkdir -p "$temp_dir"

        local bundle_file="${temp_dir}/${repo_name}.bundle"
        git bundle create "$bundle_file" --all 2>/dev/null || {
            log_error "Failed to create git bundle for: $repo_name"
            return 1
        }

        local bundle_size
        bundle_size="$(stat -c%s "$bundle_file" 2>/dev/null || stat -f%z "$bundle_file" 2>/dev/null)" || bundle_size=0
        log_info "Bundle created: $(format_bytes "$bundle_size")"

        backup_to_all_destinations "git,${repo_name}" "$bundle_file" || {
            log_error "Failed to upload git bundle: $repo_name"
            rm -rf "$temp_dir"
            return 1
        }

        rm -rf "$temp_dir"
    else
        # Backup .git directory directly
        backup_to_all_destinations "git,${repo_name}" ".git" || {
            log_error "Failed to backup .git directory: $repo_name"
            return 1
        }
    fi

    log_success "Git repository backed up: $repo_name"
    return 0
}

restore_git() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring Git from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored git bundle to: $target_dir"
    log_info "To restore: git clone <bundle-file> <directory>"
}
