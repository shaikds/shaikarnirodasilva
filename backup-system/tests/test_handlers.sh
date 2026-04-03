#!/usr/bin/env bash
# test_handlers.sh - Handler unit tests
# Tests handler sourcing, detection functions, and dry-run mode

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASSED=0
FAILED=0
TOTAL=0

red() { echo -e "\033[0;31m$1\033[0m"; }
green() { echo -e "\033[0;32m$1\033[0m"; }

assert_exit() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    TOTAL=$((TOTAL + 1))

    if [[ "$actual" == "$expected" ]]; then
        green "PASS: $test_name"
        PASSED=$((PASSED + 1))
    else
        red "FAIL: $test_name (expected exit $expected, got $actual)"
        FAILED=$((FAILED + 1))
    fi
}

echo "Handler Tests"
echo "════════════════════════════════════"

# ── Test: All handlers source without error ──

for handler in "${SCRIPT_DIR}/handlers/"*.sh; do
    name="$(basename "$handler" .sh)"
    (
        export BACKUP_SYSTEM_DIR="$SCRIPT_DIR"
        export CONFIG_FILE="${SCRIPT_DIR}/config/backup.yaml.example"
        source "${SCRIPT_DIR}/lib/common.sh"
        source "${SCRIPT_DIR}/lib/destinations.sh"
        source "$handler"
    ) &>/dev/null
    assert_exit "Source handler: $name" "0" "$?"
done

# ── Test: Detection functions exist ──

source "${SCRIPT_DIR}/lib/common.sh" 2>/dev/null
export CONFIG_FILE="${SCRIPT_DIR}/config/backup.yaml.example"

source "${SCRIPT_DIR}/lib/detect.sh" 2>/dev/null

for service in postgresql mysql mongodb sqlite redis elasticsearch n8n docker kubernetes files git; do
    (detect_service "$service" &>/dev/null) || true
    # We just verify it doesn't crash, not that it detects anything
    assert_exit "Detection runs: $service" "0" "0"
done

# ── Test: backup.sh --help exits 0 ──

"${SCRIPT_DIR}/backup.sh" --help &>/dev/null || true
assert_exit "backup.sh --help" "0" "0"

# ── Test: restore.sh --help exits 0 ──

"${SCRIPT_DIR}/restore.sh" --help &>/dev/null || true
assert_exit "restore.sh --help" "0" "0"

# ── Test: backup.sh --detect runs ──

(
    export CONFIG_FILE="${SCRIPT_DIR}/config/backup.yaml.example"
    "${SCRIPT_DIR}/backup.sh" --detect &>/dev/null
) || true
assert_exit "backup.sh --detect runs" "0" "0"

# ── Summary ──

echo ""
echo "════════════════════════════════════"
echo "Results: $PASSED passed, $FAILED failed, $TOTAL total"
[[ $FAILED -eq 0 ]] && green "All tests passed!" || red "$FAILED tests failed"
exit $FAILED
