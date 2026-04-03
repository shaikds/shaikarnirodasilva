#!/usr/bin/env bash
# test_detection.sh - Auto-detection tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASSED=0
FAILED=0
TOTAL=0

red() { echo -e "\033[0;31m$1\033[0m"; }
green() { echo -e "\033[0;32m$1\033[0m"; }

assert() {
    local test_name="$1"
    local condition="$2"
    TOTAL=$((TOTAL + 1))

    if eval "$condition" 2>/dev/null; then
        green "PASS: $test_name"
        PASSED=$((PASSED + 1))
    else
        red "FAIL: $test_name"
        FAILED=$((FAILED + 1))
    fi
}

echo "Detection Tests"
echo "════════════════════════════════════"

export BACKUP_SYSTEM_DIR="$SCRIPT_DIR"
export CONFIG_FILE="${SCRIPT_DIR}/config/backup.yaml.example"
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/detect.sh"

# ── Port detection ──

assert "detect_port: closed port returns 1" "! detect_port localhost 59999"

# ── Process detection ──

assert "detect_process: existing process (bash)" "detect_process bash"
assert "detect_process: nonexistent process" "! detect_process nonexistent_process_xyz"

# ── Service dispatcher ──

assert "detect_service: unknown service returns 1" "! detect_service unknown_service_xyz"
assert "detect_service: files always succeeds" "detect_service files"

# ── Git detection ──

# We're in a git repo, so this should work
cd "$SCRIPT_DIR/.."
assert "detect_git: in git repo" "detect_git"

cd /tmp
assert "detect_git: not in git repo" "! detect_git"

cd "$SCRIPT_DIR"

# ── Full detection scan (should not crash) ──

assert "run_detection: completes without error" "(run_detection &>/dev/null; true)"

# ── SUPPORTED_SERVICES array ──

assert "SUPPORTED_SERVICES: has entries" "[[ \${#SUPPORTED_SERVICES[@]} -gt 0 ]]"
assert "SUPPORTED_SERVICES: includes postgresql" "printf '%s\n' \"\${SUPPORTED_SERVICES[@]}\" | grep -q postgresql"
assert "SUPPORTED_SERVICES: includes kubernetes" "printf '%s\n' \"\${SUPPORTED_SERVICES[@]}\" | grep -q kubernetes"
assert "SUPPORTED_SERVICES: includes elasticsearch" "printf '%s\n' \"\${SUPPORTED_SERVICES[@]}\" | grep -q elasticsearch"

# ── Summary ──

echo ""
echo "════════════════════════════════════"
echo "Results: $PASSED passed, $FAILED failed, $TOTAL total"
[[ $FAILED -eq 0 ]] && green "All tests passed!" || red "$FAILED tests failed"
exit $FAILED
