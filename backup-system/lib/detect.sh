#!/usr/bin/env bash
# lib/detect.sh - Auto-detection of services
# Single Responsibility: detect which services are running and available for backup

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${SCRIPT_DIR}/common.sh"

# ──────────────────────────────────────────────
# Port detection
# ──────────────────────────────────────────────

detect_port() {
    local host="${1:-localhost}"
    local port="$2"
    local timeout_sec="${3:-2}"

    if command -v nc &>/dev/null; then
        nc -z -w "$timeout_sec" "$host" "$port" 2>/dev/null
    elif command -v bash &>/dev/null; then
        (echo >/dev/tcp/"$host"/"$port") 2>/dev/null
    else
        return 1
    fi
}

# ──────────────────────────────────────────────
# Process detection
# ──────────────────────────────────────────────

detect_process() {
    local process_name="$1"
    pgrep -x "$process_name" &>/dev/null || pgrep -f "$process_name" &>/dev/null
}

# ──────────────────────────────────────────────
# Docker detection
# ──────────────────────────────────────────────

detect_docker_socket() {
    [[ -S /var/run/docker.sock ]] && docker info &>/dev/null 2>&1
}

detect_docker_container() {
    local image_pattern="$1"
    docker ps --format '{{.Image}}' 2>/dev/null | grep -qi "$image_pattern"
}

detect_docker_container_name() {
    local name_pattern="$1"
    docker ps --format '{{.Names}}' 2>/dev/null | grep -qi "$name_pattern"
}

# ──────────────────────────────────────────────
# Service-specific detection functions
# ──────────────────────────────────────────────

detect_postgres() {
    local host port container
    host="$(get_config '.backup.services.postgresql.host' 'localhost')"
    port="$(get_config '.backup.services.postgresql.port' '5432')"
    container="$(get_config '.backup.services.postgresql.docker_container' '')"

    if [[ -n "$container" ]]; then
        docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$" && return 0
    fi

    detect_port "$host" "$port" && return 0
    detect_docker_container "postgres" && return 0
    detect_process "postgres" && return 0
    command -v psql &>/dev/null && psql -l &>/dev/null 2>&1 && return 0

    return 1
}

detect_mysql() {
    local host port container
    host="$(get_config '.backup.services.mysql.host' 'localhost')"
    port="$(get_config '.backup.services.mysql.port' '3306')"
    container="$(get_config '.backup.services.mysql.docker_container' '')"

    if [[ -n "$container" ]]; then
        docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$" && return 0
    fi

    detect_port "$host" "$port" && return 0
    detect_docker_container "mysql\|mariadb" && return 0
    detect_process "mysqld" && return 0

    return 1
}

detect_mongodb() {
    local host port container
    host="$(get_config '.backup.services.mongodb.host' 'localhost')"
    port="$(get_config '.backup.services.mongodb.port' '27017')"
    container="$(get_config '.backup.services.mongodb.docker_container' '')"

    if [[ -n "$container" ]]; then
        docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$" && return 0
    fi

    detect_port "$host" "$port" && return 0
    detect_docker_container "mongo" && return 0
    detect_process "mongod" && return 0

    return 1
}

detect_sqlite() {
    local paths
    paths="$(get_config_array '.backup.services.sqlite.paths')"

    if [[ -n "$paths" ]]; then
        while IFS= read -r pattern; do
            # shellcheck disable=SC2086
            compgen -G $pattern &>/dev/null && return 0
        done <<< "$paths"
    fi

    # Fallback: search common locations
    find . -maxdepth 3 -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" 2>/dev/null | head -1 | grep -q . && return 0

    return 1
}

detect_redis() {
    local host port container
    host="$(get_config '.backup.services.redis.host' 'localhost')"
    port="$(get_config '.backup.services.redis.port' '6379')"
    container="$(get_config '.backup.services.redis.docker_container' '')"

    if [[ -n "$container" ]]; then
        docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$" && return 0
    fi

    detect_port "$host" "$port" && return 0
    detect_docker_container "redis" && return 0
    detect_process "redis-server" && return 0

    return 1
}

detect_elasticsearch() {
    local host port protocol
    host="$(get_config '.backup.services.elasticsearch.host' 'localhost')"
    port="$(get_config '.backup.services.elasticsearch.port' '9200')"
    protocol="$(get_config '.backup.services.elasticsearch.protocol' 'http')"

    if detect_port "$host" "$port"; then
        # Verify it's actually Elasticsearch/OpenSearch
        local response
        response="$(curl -s --max-time 3 "${protocol}://${host}:${port}/" 2>/dev/null)" || true
        echo "$response" | grep -qi "tagline\|opensearch\|elasticsearch" && return 0
    fi

    detect_docker_container "elasticsearch\|opensearch" && return 0

    return 1
}

detect_n8n() {
    local container
    container="$(get_config '.backup.services.n8n.docker_container' '')"

    if [[ -n "$container" ]]; then
        docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$" && return 0
    fi

    command -v n8n &>/dev/null && return 0
    detect_docker_container "n8n" && return 0
    detect_port "localhost" "5678" && return 0

    return 1
}

detect_docker() {
    detect_docker_socket
}

detect_kubernetes() {
    command -v kubectl &>/dev/null || return 1
    kubectl cluster-info &>/dev/null 2>&1
}

detect_files() {
    # Files handler always runs if configured
    return 0
}

detect_git() {
    [[ -d ".git" ]] || git rev-parse --git-dir &>/dev/null 2>&1
}

# ──────────────────────────────────────────────
# Main detection dispatcher
# ──────────────────────────────────────────────

detect_service() {
    local service="$1"
    case "$service" in
        postgres|postgresql)  detect_postgres ;;
        mysql|mariadb)        detect_mysql ;;
        mongodb|mongo)        detect_mongodb ;;
        sqlite)               detect_sqlite ;;
        redis)                detect_redis ;;
        elasticsearch)        detect_elasticsearch ;;
        n8n)                  detect_n8n ;;
        docker)               detect_docker ;;
        kubernetes|k8s)       detect_kubernetes ;;
        files)                detect_files ;;
        git|git-repos)        detect_git ;;
        *)
            log_warn "Unknown service: $service"
            return 1
            ;;
    esac
}

# ──────────────────────────────────────────────
# Run full detection scan
# ──────────────────────────────────────────────

SUPPORTED_SERVICES=(
    "postgresql"
    "mysql"
    "mongodb"
    "sqlite"
    "redis"
    "elasticsearch"
    "n8n"
    "docker"
    "kubernetes"
    "files"
    "git"
)

run_detection() {
    local detected=()
    local service enabled

    log_info "Running service auto-detection..."

    for service in "${SUPPORTED_SERVICES[@]}"; do
        enabled="$(get_config ".backup.services.${service}.enabled" 'auto')"

        case "$enabled" in
            auto)
                if detect_service "$service" 2>/dev/null; then
                    detected+=("$service")
                    log_success "Detected: $service"
                else
                    log_debug "Not detected: $service"
                fi
                ;;
            true|yes|1)
                detected+=("$service")
                log_info "Enabled (manual): $service"
                ;;
            false|no|0)
                log_debug "Disabled: $service"
                ;;
        esac
    done

    log_info "Detection complete: ${#detected[@]} services found"
    printf '%s\n' "${detected[@]}"
}
