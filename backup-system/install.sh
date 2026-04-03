#!/usr/bin/env bash
# install.sh - One-command dependency installer
# Single Responsibility: install all required tools for the backup system

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RESET='\033[0m'
BOLD='\033[1m'

log() { echo -e "${BLUE}[INSTALL]${RESET} $1"; }
success() { echo -e "${GREEN}[OK]${RESET} $1"; }
warn() { echo -e "${YELLOW}[SKIP]${RESET} $1"; }
fail() { echo -e "${RED}[FAIL]${RESET} $1"; }

# ── OS Detection ──

detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "$ID"
    elif [[ "$(uname)" == "Darwin" ]]; then
        echo "macos"
    else
        echo "unknown"
    fi
}

detect_arch() {
    local arch
    arch="$(uname -m)"
    case "$arch" in
        x86_64|amd64) echo "amd64" ;;
        aarch64|arm64) echo "arm64" ;;
        armv7l)        echo "armv7" ;;
        *)             echo "$arch" ;;
    esac
}

# ── Package manager helpers ──

install_apt() {
    sudo apt-get update -qq
    sudo apt-get install -y -qq "$@"
}

install_yum() {
    sudo yum install -y "$@"
}

install_apk() {
    sudo apk add --no-cache "$@"
}

install_brew() {
    brew install "$@"
}

pkg_install() {
    local os="$1"
    shift
    case "$os" in
        ubuntu|debian|linuxmint|pop) install_apt "$@" ;;
        centos|rhel|fedora|rocky|alma) install_yum "$@" ;;
        alpine) install_apk "$@" ;;
        macos) install_brew "$@" ;;
        *) fail "Unsupported OS. Install manually: $*"; return 1 ;;
    esac
}

# ── Tool installers ──

install_restic() {
    if command -v restic &>/dev/null; then
        success "restic already installed: $(restic version 2>/dev/null | head -1)"
        return 0
    fi

    log "Installing restic..."
    local os="$1"

    case "$os" in
        ubuntu|debian|linuxmint|pop)
            install_apt restic && success "restic installed via apt" && return 0 ;;
        centos|rhel|fedora|rocky|alma)
            install_yum restic && success "restic installed via yum" && return 0 ;;
        alpine)
            install_apk restic && success "restic installed via apk" && return 0 ;;
        macos)
            install_brew restic && success "restic installed via brew" && return 0 ;;
    esac

    # Fallback: install from GitHub releases
    local arch
    arch="$(detect_arch)"
    local url="https://github.com/restic/restic/releases/latest/download/restic_$(uname -s | tr '[:upper:]' '[:lower:]')_${arch}.bz2"
    log "Downloading restic from GitHub..."
    curl -sSL "$url" | bunzip2 > /tmp/restic
    chmod +x /tmp/restic
    sudo mv /tmp/restic /usr/local/bin/restic
    success "restic installed from GitHub"
}

install_rclone() {
    if command -v rclone &>/dev/null; then
        success "rclone already installed: $(rclone version 2>/dev/null | head -1)"
        return 0
    fi

    log "Installing rclone..."
    # Official install script (works on all platforms)
    curl -sSL https://rclone.org/install.sh | sudo bash
    success "rclone installed"
}

install_yq() {
    # Check for mikefarah/yq (Go version)
    if command -v yq &>/dev/null; then
        local yq_version
        yq_version="$(yq --version 2>/dev/null)" || true
        if echo "$yq_version" | grep -qi "mikefarah\|version v4\|version 4"; then
            success "yq (mikefarah) already installed"
            return 0
        fi
        warn "Found yq but it's not mikefarah version. Installing correct version..."
    fi

    log "Installing yq (mikefarah)..."
    local arch os_name
    arch="$(detect_arch)"
    os_name="$(uname -s | tr '[:upper:]' '[:lower:]')"

    local binary="yq_${os_name}_${arch}"
    local url="https://github.com/mikefarah/yq/releases/latest/download/${binary}"

    curl -sSL "$url" -o /tmp/yq
    chmod +x /tmp/yq
    sudo mv /tmp/yq /usr/local/bin/yq
    success "yq (mikefarah) installed"
}

install_jq() {
    if command -v jq &>/dev/null; then
        success "jq already installed"
        return 0
    fi

    log "Installing jq..."
    local os="$1"
    pkg_install "$os" jq
    success "jq installed"
}

install_netcat() {
    if command -v nc &>/dev/null; then
        success "netcat already installed"
        return 0
    fi

    log "Installing netcat..."
    local os="$1"
    case "$os" in
        ubuntu|debian|linuxmint|pop) install_apt netcat-openbsd ;;
        centos|rhel|fedora|rocky|alma) install_yum nmap-ncat ;;
        alpine) install_apk netcat-openbsd ;;
        macos) success "netcat is built-in on macOS"; return 0 ;;
        *) warn "Install netcat manually" ;;
    esac
    success "netcat installed"
}

install_python() {
    if command -v python3 &>/dev/null; then
        success "python3 already installed: $(python3 --version 2>/dev/null)"
        return 0
    fi

    log "Installing python3..."
    local os="$1"
    pkg_install "$os" python3
    success "python3 installed"
}

# ── Setup systemd timer ──

setup_systemd() {
    if ! command -v systemctl &>/dev/null; then
        warn "systemd not available, skipping timer setup"
        return 0
    fi

    log "Setting up systemd timer..."
    local service_dir="/etc/systemd/system"

    sudo cp "${SCRIPT_DIR}/systemd/backup.service" "$service_dir/" 2>/dev/null || {
        warn "Could not copy systemd service file"
        return 0
    }
    sudo cp "${SCRIPT_DIR}/systemd/backup.timer" "$service_dir/" 2>/dev/null || {
        warn "Could not copy systemd timer file"
        return 0
    }

    # Update paths in service file
    sudo sed -i "s|/opt/backup-system|${SCRIPT_DIR}|g" "${service_dir}/backup.service"

    sudo systemctl daemon-reload
    success "systemd units installed (enable with: sudo systemctl enable backup.timer)"
}

# ── Make scripts executable ──

make_executable() {
    chmod +x "${SCRIPT_DIR}/backup.sh" 2>/dev/null || true
    chmod +x "${SCRIPT_DIR}/restore.sh" 2>/dev/null || true
    chmod +x "${SCRIPT_DIR}/server.py" 2>/dev/null || true
    chmod +x "${SCRIPT_DIR}/install.sh" 2>/dev/null || true
    success "Scripts made executable"
}

# ── Setup default config ──

setup_config() {
    local config_file="${SCRIPT_DIR}/config/backup.yaml"
    if [[ -f "$config_file" ]]; then
        success "Config file already exists"
        return 0
    fi

    if [[ -f "${SCRIPT_DIR}/config/backup.yaml.example" ]]; then
        cp "${SCRIPT_DIR}/config/backup.yaml.example" "$config_file"
        success "Config file created from example (edit: ${config_file})"
    fi
}

# ── Main ──

main() {
    echo -e "${BOLD}Universal Backup System - Installer${RESET}"
    echo "════════════════════════════════════════"
    echo ""

    local os
    os="$(detect_os)"
    log "Detected OS: $os ($(detect_arch))"
    echo ""

    # Core dependencies
    install_restic "$os"
    install_rclone
    install_yq
    install_jq "$os"
    install_netcat "$os"
    install_python "$os"

    echo ""
    log "Setting up backup system..."
    make_executable
    setup_config

    # Optional: systemd
    if [[ "${1:-}" == "--systemd" ]]; then
        setup_systemd
    fi

    echo ""
    echo -e "${BOLD}${GREEN}Installation complete!${RESET}"
    echo ""
    echo "Next steps:"
    echo "  1. Edit config:  nano ${SCRIPT_DIR}/config/backup.yaml"
    echo "  2. Run backup:   ${SCRIPT_DIR}/backup.sh"
    echo "  3. Start UI:     python3 ${SCRIPT_DIR}/server.py"
    echo "  4. Open browser:  http://localhost:8080"
    echo ""
}

main "$@"
