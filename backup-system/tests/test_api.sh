#!/usr/bin/env bash
# test_api.sh - API endpoint tests (curl-based)
# Tests the Python API server endpoints

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
PASSED=0
FAILED=0
TOTAL=0

# ── Test helpers ──

red() { echo -e "\033[0;31m$1\033[0m"; }
green() { echo -e "\033[0;32m$1\033[0m"; }

assert_status() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    TOTAL=$((TOTAL + 1))

    if [[ "$actual" == "$expected" ]]; then
        green "PASS: $test_name (HTTP $actual)"
        PASSED=$((PASSED + 1))
    else
        red "FAIL: $test_name (expected $expected, got $actual)"
        FAILED=$((FAILED + 1))
    fi
}

assert_json_field() {
    local test_name="$1"
    local json="$2"
    local field="$3"
    local expected="$4"
    TOTAL=$((TOTAL + 1))

    local actual
    actual="$(echo "$json" | jq -r "$field" 2>/dev/null)"

    if [[ "$actual" == "$expected" ]]; then
        green "PASS: $test_name ($field = $actual)"
        PASSED=$((PASSED + 1))
    else
        red "FAIL: $test_name ($field expected '$expected', got '$actual')"
        FAILED=$((FAILED + 1))
    fi
}

http_status() {
    curl -s -o /dev/null -w '%{http_code}' "$@"
}

http_get() {
    curl -s "$@"
}

http_post() {
    curl -s -X POST -H "Content-Type: application/json" "$@"
}

http_delete() {
    curl -s -X DELETE "$@"
}

# ── Tests ──

echo "API Tests - ${BASE_URL}"
echo "════════════════════════════════════"

# Test 1: Server is up
assert_status "GET /api/projects" "200" "$(http_status "${BASE_URL}/api/projects")"

# Test 2: Create project
RESPONSE="$(http_post -d '{"name":"test-project","config":"backup:\n  project_name: test"}' "${BASE_URL}/api/projects")"
STATUS="$(http_post -o /dev/null -w '%{http_code}' -d '{"name":"test-project-2","config":"backup:\n  project_name: test2"}' "${BASE_URL}/api/projects")"
assert_status "POST /api/projects (create)" "201" "$STATUS"

# Test 3: Duplicate project name
STATUS="$(http_post -o /dev/null -w '%{http_code}' -d '{"name":"test-project-2","config":"test"}' "${BASE_URL}/api/projects")"
assert_status "POST /api/projects (duplicate)" "409" "$STATUS"

# Test 4: Invalid project name - path traversal
STATUS="$(http_post -o /dev/null -w '%{http_code}' -d '{"name":"../hack","config":"test"}' "${BASE_URL}/api/projects")"
assert_status "POST /api/projects (path traversal)" "400" "$STATUS"

# Test 5: Invalid project name - special chars
STATUS="$(http_post -o /dev/null -w '%{http_code}' -d '{"name":"test project!","config":"test"}' "${BASE_URL}/api/projects")"
assert_status "POST /api/projects (special chars)" "400" "$STATUS"

# Test 6: Get project
RESPONSE="$(http_get "${BASE_URL}/api/projects/test-project-2")"
assert_json_field "GET /api/projects/<name>" "$RESPONSE" ".name" "test-project-2"

# Test 7: Get project status
RESPONSE="$(http_get "${BASE_URL}/api/projects/test-project-2/status")"
assert_json_field "GET /api/projects/<name>/status" "$RESPONSE" ".status" "never_run"

# Test 8: Get logs
STATUS="$(http_status "${BASE_URL}/api/projects/test-project-2/logs")"
assert_status "GET /api/projects/<name>/logs" "200" "$STATUS"

# Test 9: Get example config
STATUS="$(http_status "${BASE_URL}/api/config/example")"
assert_status "GET /api/config/example" "200" "$STATUS"

# Test 10: Delete project
STATUS="$(http_delete -o /dev/null -w '%{http_code}' "${BASE_URL}/api/projects/test-project-2")"
assert_status "DELETE /api/projects/<name>" "200" "$STATUS"

# Test 11: Delete non-existent project
STATUS="$(http_delete -o /dev/null -w '%{http_code}' "${BASE_URL}/api/projects/nonexistent")"
assert_status "DELETE /api/projects (not found)" "404" "$STATUS"

# Test 12: Get non-existent project
STATUS="$(http_status "${BASE_URL}/api/projects/nonexistent")"
assert_status "GET /api/projects (not found)" "404" "$STATUS"

# Cleanup
http_delete "${BASE_URL}/api/projects/test-project" &>/dev/null || true

# ── Summary ──

echo ""
echo "════════════════════════════════════"
echo "Results: $PASSED passed, $FAILED failed, $TOTAL total"
[[ $FAILED -eq 0 ]] && green "All tests passed!" || red "$FAILED tests failed"
exit $FAILED
