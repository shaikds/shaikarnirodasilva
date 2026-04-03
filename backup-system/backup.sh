#!/usr/bin/env bash
# backup.sh - Main orchestrator
# Single Responsibility: coordinate detection, handler execution, and reporting
# Factory Pattern: auto-discovers handlers from handlers/ directory

set -euo pipefail

BACKUP_SYSTEM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BACKUP_SYSTEM_DIR

# ──────────────────────────────────────────────
# Source libraries
# ──────────────────────────────────────────────

source "${BACKUP_SYSTEM_DIR}/lib/common.sh"
source "${BACKUP_SYSTEM_DIR}/lib/detect.sh"
source "${BACKUP_SYSTEM_DIR}/lib/destinations.sh"

# ──────────────────────────────────────────────
# CLI argument parsing
# ──────────────────────────────────────────────

SINGLE_SERVICE=""
DETECT_ONLY=false
STATUS_ONLY=false

show_help() {
    cat <<'EOF'
Universal Backup System

Usage: ./backup.sh [options]

Options:
  --config <path>    Path to config file (default: ./config/backup.yaml)
  --dry-run          Show what would be backed up without doing it
  --verbose          Enable verbose output
  --service <name>   Only backup specific service (postgres, mysql, etc.)
  --detect           Only run detection, show what was found
  --status           Show backup status and latest snapshots
  --help             Show this help message

Services: postgresql, mysql, mongodb, sqlite, redis, elasticsearch, n8n, docker, kubernetes, files, git

Examples:
  ./backup.sh                           # Run full backup (auto-detect)
  ./backup.sh --dry-run --verbose       # Preview what would happen
  ./backup.sh --service postgresql      # Backup only PostgreSQL
  ./backup.sh --detect                  # Show detected services
  ./backup.sh --config ./my-config.yaml # Use custom config
EOF
    exit 0
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --service)
                SINGLE_SERVICE="$2"
                shift 2
                ;;
            --detect)
                DETECT_ONLY=true
                shift
                ;;
            --status)
                STATUS_ONLY=true
                shift
                ;;
            --help|-h)
                show_help
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                ;;
        esac
    done
}

# ──────────────────────────────────────────────
# Handler discovery (Factory Pattern)
# ──────────────────────────────────────────────

discover_handlers() {
    local handlers_dir="${BACKUP_SYSTEM_DIR}/handlers"
    local handler_files=()

    for handler_file in "${handlers_dir}"/*.sh; do
        [[ -f "$handler_file" ]] && handler_files+=("$handler_file")
    done

    printf '%s\n' "${handler_files[@]}"
}

# Map service name to handler function name
service_to_backup_func() {
    local service="$1"
    case "$service" in
        postgresql|postgres)  echo "backup_postgresql" ;;
        mysql|mariadb)        echo "backup_mysql" ;;
        mongodb|mongo)        echo "backup_mongodb" ;;
        sqlite)               echo "backup_sqlite" ;;
        redis)                echo "backup_redis" ;;
        elasticsearch)        echo "backup_elasticsearch" ;;
        n8n)                  echo "backup_n8n" ;;
        docker)               echo "backup_docker" ;;
        kubernetes|k8s)       echo "backup_kubernetes" ;;
        files)                echo "backup_files" ;;
        git|git-repos)        echo "backup_git" ;;
        *)                    echo "" ;;
    esac
}

# ──────────────────────────────────────────────
# Main execution flow
# ──────────────────────────────────────────────

run_backup() {
    start_timer

    # Validate config
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_error "Config file not found: $CONFIG_FILE"
        log_info "Copy backup.yaml.example to backup.yaml and customize it:"
        log_info "  cp ${BACKUP_SYSTEM_DIR}/config/backup.yaml.example ${BACKUP_SYSTEM_DIR}/config/backup.yaml"
        return 1
    fi

    validate_config "$CONFIG_FILE" || return 1

    local project_name
    project_name="$(get_config '.backup.project_name' 'default')"
    log_info "Starting backup for project: ${COLOR_BOLD}${project_name}${COLOR_RESET}"

    [[ "$DRY_RUN" == "true" ]] && log_warn "DRY-RUN mode enabled - no changes will be made"

    # Source all handlers
    local handler_file
    while IFS= read -r handler_file; do
        [[ -z "$handler_file" ]] && continue
        source "$handler_file"
        log_debug "Loaded handler: $(basename "$handler_file")"
    done < <(discover_handlers)

    # Run detection
    local detected_services=()
    if [[ -n "$SINGLE_SERVICE" ]]; then
        detected_services=("$SINGLE_SERVICE")
    else
        while IFS= read -r service; do
            [[ -n "$service" ]] && detected_services+=("$service")
        done < <(run_detection)
    fi

    if [[ ${#detected_services[@]} -eq 0 ]]; then
        log_warn "No services detected or enabled for backup"
        return 0
    fi

    # Initialize destinations
    if [[ "$DRY_RUN" != "true" ]]; then
        setup_restic_password "$CONFIG_FILE" || return 1
        init_all_destinations "$CONFIG_FILE" || return 1
    fi

    # Execute backup for each detected service
    local total=${#detected_services[@]}
    local current=0

    for service in "${detected_services[@]}"; do
        current=$((current + 1))
        local func
        func="$(service_to_backup_func "$service")"

        if [[ -z "$func" ]]; then
            log_warn "No handler found for service: $service"
            continue
        fi

        if ! type -t "$func" &>/dev/null; then
            log_warn "Handler function not loaded: $func"
            continue
        fi

        log_info "[$current/$total] Backing up: ${COLOR_BOLD}${service}${COLOR_RESET}"
        if "$func" "$CONFIG_FILE"; then
            log_success "[$current/$total] $service backup complete"
        else
            log_error "[$current/$total] $service backup failed"
        fi
    done

    # Apply retention policy
    if [[ "$DRY_RUN" != "true" ]]; then
        log_info "Applying retention policy..."
        apply_retention "$CONFIG_FILE" || log_warn "Retention policy failed"
    fi

    # Send notifications
    if [[ -f "${BACKUP_SYSTEM_DIR}/lib/notify.sh" ]]; then
        source "${BACKUP_SYSTEM_DIR}/lib/notify.sh"
        local duration
        duration="$(format_duration "$(elapsed_seconds)")"
        local status="success"
        [[ $BACKUP_ERRORS -gt 0 ]] && status="partial_failure"
        notify_all "$CONFIG_FILE" "$status" "$project_name" "$duration" "$BACKUP_SUCCESSES" "$BACKUP_ERRORS"
    fi

    # Summary
    local duration
    duration="$(format_duration "$(elapsed_seconds)")"
    echo ""
    log_info "═══════════════════════════════════════"
    log_info "Backup Summary"
    log_info "═══════════════════════════════════════"
    log_info "Project:    $project_name"
    log_info "Duration:   $duration"
    log_info "Services:   ${#detected_services[@]}"
    log_success "Successes:  $BACKUP_SUCCESSES"
    [[ $BACKUP_ERRORS -gt 0 ]] && log_error "Errors:     $BACKUP_ERRORS"
    log_info "═══════════════════════════════════════"

    [[ $BACKUP_ERRORS -gt 0 ]] && return 1
    return 0
}

run_detect_only() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_warn "No config file found, using defaults for detection"
    fi

    # Source handlers for their detect functions
    local handler_file
    while IFS= read -r handler_file; do
        [[ -z "$handler_file" ]] && continue
        source "$handler_file"
    done < <(discover_handlers)

    run_detection
}

run_status() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_error "Config file not found"
        return 1
    fi

    setup_restic_password "$CONFIG_FILE" || return 1

    log_info "Latest snapshots:"
    list_snapshots "$CONFIG_FILE" | jq '.' 2>/dev/null || log_warn "No snapshots found"
}

# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

main() {
    parse_args "$@"

    if [[ "$DETECT_ONLY" == "true" ]]; then
        run_detect_only
    elif [[ "$STATUS_ONLY" == "true" ]]; then
        run_status
    else
        run_backup
    fi
}

main "$@"
