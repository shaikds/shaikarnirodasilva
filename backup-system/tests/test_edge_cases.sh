#!/usr/bin/env bash
# test_edge_cases.sh - Edge case tests
# Tests error handling, validation, and boundary conditions

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

    if eval "$condition"; then
        green "PASS: $test_name"
        PASSED=$((PASSED + 1))
    else
        red "FAIL: $test_name"
        FAILED=$((FAILED + 1))
    fi
}

echo "Edge Case Tests"
echo "════════════════════════════════════"

# Source common for testing
export BACKUP_SYSTEM_DIR="$SCRIPT_DIR"
export CONFIG_FILE="${SCRIPT_DIR}/config/backup.yaml.example"
source "${SCRIPT_DIR}/lib/common.sh"

# ── Project name validation ──

assert "Valid name: my-project" "validate_project_name 'my-project'"
assert "Valid name: test_123" "validate_project_name 'test_123'"
assert "Valid name: ProjectOne" "validate_project_name 'ProjectOne'"

assert "Invalid name: spaces" "! validate_project_name 'my project' 2>/dev/null"
assert "Invalid name: dots" "! validate_project_name 'my.project' 2>/dev/null"
assert "Invalid name: path traversal" "! validate_project_name '../hack' 2>/dev/null"
assert "Invalid name: slash" "! validate_project_name 'a/b' 2>/dev/null"
assert "Invalid name: empty" "! validate_project_name '' 2>/dev/null"

# Name length
long_name="$(printf 'a%.0s' {1..65})"
assert "Invalid name: too long (65 chars)" "! validate_project_name '$long_name' 2>/dev/null"

ok_name="$(printf 'a%.0s' {1..64})"
assert "Valid name: max length (64 chars)" "validate_project_name '$ok_name'"

# ── Config validation ──

assert "Valid config: example file" "validate_config '${SCRIPT_DIR}/config/backup.yaml.example'"
assert "Invalid config: nonexistent file" "! validate_config '/nonexistent/file.yaml' 2>/dev/null"

# Create invalid YAML for testing
TEMP_YAML="/tmp/test-invalid.yaml"
echo "invalid: [yaml: {broken" > "$TEMP_YAML"
assert "Invalid config: broken YAML" "! validate_config '$TEMP_YAML' 2>/dev/null"
rm -f "$TEMP_YAML"

# ── Format helpers ──

assert "format_bytes: 0" "[[ \$(format_bytes 0) == '0 B' ]]"
assert "format_bytes: 1024" "[[ \$(format_bytes 1024) == '1.00 KB' ]]"
assert "format_bytes: 1048576" "[[ \$(format_bytes 1048576) == '1.00 MB' ]]"
assert "format_bytes: 1073741824" "[[ \$(format_bytes 1073741824) == '1.00 GB' ]]"

assert "format_duration: 0s" "[[ \$(format_duration 0) == '0s' ]]"
assert "format_duration: 59s" "[[ \$(format_duration 59) == '59s' ]]"
assert "format_duration: 60s" "[[ \$(format_duration 60) == '1m 0s' ]]"
assert "format_duration: 3661s" "[[ \$(format_duration 3661) == '1h 1m 1s' ]]"

# ── Lock file ──

LOCK_FILE="/tmp/test-backup.lock"
rm -f "$LOCK_FILE"

assert "acquire_lock: success" "acquire_lock '$LOCK_FILE'"
assert "Lock file exists" "[[ -f '$LOCK_FILE' ]]"
assert "Lock file has PID" "[[ \$(cat '$LOCK_FILE') == '$$' ]]"

release_lock "$LOCK_FILE"
assert "release_lock: file removed" "[[ ! -f '$LOCK_FILE' ]]"

# ── Status file ──

STATUS_FILE="/tmp/test-backup.status"
write_status "$STATUS_FILE" "success" "12345"
assert "write_status: file created" "[[ -f '$STATUS_FILE' ]]"
assert "read_status: contains success" "[[ \$(read_status '$STATUS_FILE') == *'success'* ]]"
rm -f "$STATUS_FILE"

assert "read_status: missing file" "[[ \$(read_status '/nonexistent') == *'never_run'* ]]"

# ── get_config edge cases ──

assert "get_config: default value" "[[ \$(get_config '.nonexistent.path' 'default_val') == 'default_val' ]]"
assert "get_config: missing file with default" "[[ \$(get_config '.path' 'fallback' '/nonexistent.yaml') == 'fallback' ]]"

# ── Summary ──

echo ""
echo "════════════════════════════════════"
echo "Results: $PASSED passed, $FAILED failed, $TOTAL total"
[[ $FAILED -eq 0 ]] && green "All tests passed!" || red "$FAILED tests failed"
exit $FAILED
