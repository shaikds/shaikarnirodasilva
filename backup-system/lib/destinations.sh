#!/usr/bin/env bash
# lib/destinations.sh - Restic + Rclone destination management
# Single Responsibility: manage backup repositories, upload/download, retention

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${SCRIPT_DIR}/common.sh"

# ──────────────────────────────────────────────
# Restic password setup
# ──────────────────────────────────────────────

setup_restic_password() {
    local config_file="${1:-$CONFIG_FILE}"

    if [[ -n "${RESTIC_PASSWORD:-}" ]]; then
        export RESTIC_PASSWORD
        return 0
    fi

    local password
    password="$(get_config '.backup.encryption.password' '' "$config_file")"
    if [[ -n "$password" ]]; then
        export RESTIC_PASSWORD="$password"
        return 0
    fi

    local password_file
    password_file="$(get_config '.backup.encryption.password_file' '' "$config_file")"
    if [[ -n "$password_file" && -f "$password_file" ]]; then
        export RESTIC_PASSWORD_FILE="$password_file"
        return 0
    fi

    log_error "No backup password configured. Set RESTIC_PASSWORD env var, or configure encryption.password in config."
    return 1
}

# ──────────────────────────────────────────────
# Repository URL builders
# ──────────────────────────────────────────────

get_repo_url_local() {
    local path
    path="$(get_config '.backup.destinations.local.path' '/backup/restic-repo' "$1")"
    echo "$path"
}

get_repo_url_s3() {
    local bucket region
    bucket="$(get_config '.backup.destinations.s3.bucket' '' "$1")"
    region="$(get_config '.backup.destinations.s3.region' '' "$1")"

    local access_key secret_key
    access_key="$(get_config '.backup.destinations.s3.access_key' '' "$1")"
    secret_key="$(get_config '.backup.destinations.s3.secret_key' '' "$1")"

    [[ -n "$access_key" ]] && export AWS_ACCESS_KEY_ID="$access_key"
    [[ -n "$secret_key" ]] && export AWS_SECRET_ACCESS_KEY="$secret_key"

    echo "s3:s3.${region}.amazonaws.com/${bucket}"
}

get_repo_url_sftp() {
    local host user path
    host="$(get_config '.backup.destinations.sftp.host' '' "$1")"
    user="$(get_config '.backup.destinations.sftp.user' '' "$1")"
    path="$(get_config '.backup.destinations.sftp.path' '/backups' "$1")"

    echo "sftp:${user}@${host}:${path}"
}

get_repo_url_gdrive() {
    local remote path
    remote="$(get_config '.backup.destinations.google_drive.rclone_remote' 'gdrive' "$1")"
    path="$(get_config '.backup.destinations.google_drive.path' '/backups' "$1")"

    echo "rclone:${remote}:${path}"
}

# ──────────────────────────────────────────────
# Get all enabled destination URLs
# ──────────────────────────────────────────────

get_enabled_destinations() {
    local config_file="${1:-$CONFIG_FILE}"
    local destinations=()

    local local_enabled
    local_enabled="$(get_config '.backup.destinations.local.enabled' 'false' "$config_file")"
    [[ "$local_enabled" == "true" ]] && destinations+=("local:$(get_repo_url_local "$config_file")")

    local s3_enabled
    s3_enabled="$(get_config '.backup.destinations.s3.enabled' 'false' "$config_file")"
    [[ "$s3_enabled" == "true" ]] && destinations+=("s3:$(get_repo_url_s3 "$config_file")")

    local sftp_enabled
    sftp_enabled="$(get_config '.backup.destinations.sftp.enabled' 'false' "$config_file")"
    [[ "$sftp_enabled" == "true" ]] && destinations+=("sftp:$(get_repo_url_sftp "$config_file")")

    local gdrive_enabled
    gdrive_enabled="$(get_config '.backup.destinations.google_drive.enabled' 'false' "$config_file")"
    [[ "$gdrive_enabled" == "true" ]] && destinations+=("gdrive:$(get_repo_url_gdrive "$config_file")")

    if [[ ${#destinations[@]} -eq 0 ]]; then
        log_error "No backup destinations enabled. Configure at least one in backup.yaml."
        return 1
    fi

    printf '%s\n' "${destinations[@]}"
}

# ──────────────────────────────────────────────
# Repository initialization
# ──────────────────────────────────────────────

init_restic_repo() {
    local repo_url="$1"

    # Strip the destination type prefix (local:, s3:, etc.)
    local actual_url="${repo_url#*:}"
    # Handle local paths (local:/path -> /path, not path)
    if [[ "$repo_url" == local:* ]]; then
        actual_url="${repo_url#local:}"
        mkdir -p "$actual_url"
    fi

    # Check if already initialized
    if restic -r "$actual_url" snapshots &>/dev/null 2>&1; then
        log_debug "Restic repo already initialized: $actual_url"
        return 0
    fi

    log_info "Initializing Restic repository: $actual_url"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would initialize: $actual_url"
        return 0
    fi

    if restic init -r "$actual_url" 2>&1; then
        log_success "Repository initialized: $actual_url"
    else
        log_error "Failed to initialize repository: $actual_url"
        return 1
    fi
}

init_all_destinations() {
    local config_file="${1:-$CONFIG_FILE}"
    local dest

    setup_restic_password "$config_file" || return 1

    while IFS= read -r dest; do
        [[ -z "$dest" ]] && continue
        init_restic_repo "$dest" || log_warn "Failed to init: $dest"
    done < <(get_enabled_destinations "$config_file")
}

# ──────────────────────────────────────────────
# Backup operations
# ──────────────────────────────────────────────

backup_to_destination() {
    local repo_url="$1"
    local tag="$2"
    shift 2
    local paths=("$@")

    local actual_url="${repo_url#*:}"
    [[ "$repo_url" == local:* ]] && actual_url="${repo_url#local:}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would backup to $actual_url with tag '$tag': ${paths[*]}"
        return 0
    fi

    log_info "Backing up to $actual_url (tag: $tag)..."
    if restic -r "$actual_url" backup --tag "$tag" "${paths[@]}" 2>&1; then
        log_success "Backup complete: $actual_url (tag: $tag)"
        BACKUP_SUCCESSES=$((BACKUP_SUCCESSES + 1))
    else
        log_error "Backup failed: $actual_url (tag: $tag)"
        return 1
    fi
}

backup_stdin_to_destination() {
    local repo_url="$1"
    local tag="$2"
    local filename="$3"

    local actual_url="${repo_url#*:}"
    [[ "$repo_url" == local:* ]] && actual_url="${repo_url#local:}"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would pipe stdin backup to $actual_url as '$filename' (tag: $tag)"
        cat > /dev/null  # Consume stdin in dry-run
        return 0
    fi

    log_info "Piping backup to $actual_url as '$filename' (tag: $tag)..."
    if restic -r "$actual_url" backup --stdin --stdin-filename "$filename" --tag "$tag" 2>&1; then
        log_success "Stdin backup complete: $filename -> $actual_url"
        BACKUP_SUCCESSES=$((BACKUP_SUCCESSES + 1))
    else
        log_error "Stdin backup failed: $filename -> $actual_url"
        return 1
    fi
}

# Backup to ALL enabled destinations
backup_to_all_destinations() {
    local tag="$1"
    shift
    local paths=("$@")
    local config_file="${CONFIG_FILE}"
    local dest

    while IFS= read -r dest; do
        [[ -z "$dest" ]] && continue
        backup_to_destination "$dest" "$tag" "${paths[@]}" || true
    done < <(get_enabled_destinations "$config_file")
}

# Backup stdin to ALL enabled destinations (uses temp file for multi-dest)
backup_stdin_to_all_destinations() {
    local tag="$1"
    local filename="$2"
    local config_file="${CONFIG_FILE}"

    local destinations
    destinations="$(get_enabled_destinations "$config_file")"
    local dest_count
    dest_count="$(echo "$destinations" | wc -l)"

    if [[ "$dest_count" -le 1 ]]; then
        # Single destination: pipe directly
        local dest
        dest="$(echo "$destinations" | head -1)"
        backup_stdin_to_destination "$dest" "$tag" "$filename"
    else
        # Multiple destinations: save to temp file first
        local temp_file
        temp_file="$(ensure_temp_dir)/${filename}"
        cat > "$temp_file"

        while IFS= read -r dest; do
            [[ -z "$dest" ]] && continue
            backup_stdin_to_destination "$dest" "$tag" "$filename" < "$temp_file" || true
        done <<< "$destinations"

        rm -f "$temp_file"
    fi
}

# ──────────────────────────────────────────────
# Retention policy
# ──────────────────────────────────────────────

apply_retention() {
    local config_file="${1:-$CONFIG_FILE}"

    local keep_hourly keep_daily keep_weekly keep_monthly keep_yearly
    keep_hourly="$(get_config '.backup.retention.keep_hourly' '24' "$config_file")"
    keep_daily="$(get_config '.backup.retention.keep_daily' '30' "$config_file")"
    keep_weekly="$(get_config '.backup.retention.keep_weekly' '12' "$config_file")"
    keep_monthly="$(get_config '.backup.retention.keep_monthly' '12' "$config_file")"
    keep_yearly="$(get_config '.backup.retention.keep_yearly' '5' "$config_file")"

    local dest
    while IFS= read -r dest; do
        [[ -z "$dest" ]] && continue
        local actual_url="${dest#*:}"
        [[ "$dest" == local:* ]] && actual_url="${dest#local:}"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would apply retention to $actual_url"
            continue
        fi

        log_info "Applying retention policy to $actual_url..."
        restic -r "$actual_url" forget \
            --keep-hourly "$keep_hourly" \
            --keep-daily "$keep_daily" \
            --keep-weekly "$keep_weekly" \
            --keep-monthly "$keep_monthly" \
            --keep-yearly "$keep_yearly" \
            --prune 2>&1 || log_warn "Retention failed for: $actual_url"
    done < <(get_enabled_destinations "$config_file")
}

# ──────────────────────────────────────────────
# Snapshot listing
# ──────────────────────────────────────────────

list_snapshots() {
    local config_file="${1:-$CONFIG_FILE}"
    local tag_filter="${2:-}"

    local dest
    dest="$(get_enabled_destinations "$config_file" | head -1)"
    local actual_url="${dest#*:}"
    [[ "$dest" == local:* ]] && actual_url="${dest#local:}"

    local cmd=(restic -r "$actual_url" snapshots --json)
    [[ -n "$tag_filter" ]] && cmd+=(--tag "$tag_filter")

    "${cmd[@]}" 2>/dev/null
}

# ──────────────────────────────────────────────
# Restore operations
# ──────────────────────────────────────────────

restore_snapshot() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    setup_restic_password "$config_file" || return 1

    local dest
    dest="$(get_enabled_destinations "$config_file" | head -1)"
    local actual_url="${dest#*:}"
    [[ "$dest" == local:* ]] && actual_url="${dest#local:}"

    mkdir -p "$target_dir"

    log_info "Restoring snapshot $snapshot_id to $target_dir..."
    if restic -r "$actual_url" restore "$snapshot_id" --target "$target_dir" 2>&1; then
        log_success "Restore complete: $snapshot_id -> $target_dir"
    else
        log_error "Restore failed: $snapshot_id"
        return 1
    fi
}
