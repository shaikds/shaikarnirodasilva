#!/usr/bin/env bash
# test_frontend.sh - Frontend smoke tests
# Verifies server serves static files correctly

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
PASSED=0
FAILED=0
TOTAL=0

red() { echo -e "\033[0;31m$1\033[0m"; }
green() { echo -e "\033[0;32m$1\033[0m"; }

assert_status() {
    local test_name="$1"
    local expected="$2"
    local url="$3"
    TOTAL=$((TOTAL + 1))

    local actual
    actual="$(curl -s -o /dev/null -w '%{http_code}' "$url")" || actual="000"

    if [[ "$actual" == "$expected" ]]; then
        green "PASS: $test_name (HTTP $actual)"
        PASSED=$((PASSED + 1))
    else
        red "FAIL: $test_name (expected $expected, got $actual)"
        FAILED=$((FAILED + 1))
    fi
}

assert_content_type() {
    local test_name="$1"
    local expected="$2"
    local url="$3"
    TOTAL=$((TOTAL + 1))

    local actual
    actual="$(curl -s -o /dev/null -w '%{content_type}' "$url")" || actual=""

    if echo "$actual" | grep -qi "$expected"; then
        green "PASS: $test_name (Content-Type: $actual)"
        PASSED=$((PASSED + 1))
    else
        red "FAIL: $test_name (expected $expected in '$actual')"
        FAILED=$((FAILED + 1))
    fi
}

assert_contains() {
    local test_name="$1"
    local needle="$2"
    local url="$3"
    TOTAL=$((TOTAL + 1))

    local body
    body="$(curl -s "$url")" || body=""

    if echo "$body" | grep -qi "$needle"; then
        green "PASS: $test_name (contains '$needle')"
        PASSED=$((PASSED + 1))
    else
        red "FAIL: $test_name (missing '$needle')"
        FAILED=$((FAILED + 1))
    fi
}

echo "Frontend Smoke Tests - ${BASE_URL}"
echo "════════════════════════════════════"

# Static files
assert_status "index.html serves" "200" "${BASE_URL}/"
assert_content_type "index.html is HTML" "text/html" "${BASE_URL}/"
assert_contains "index.html has title" "Universal Backup System" "${BASE_URL}/"

assert_status "CSS serves" "200" "${BASE_URL}/css/style.css"
assert_content_type "CSS content type" "text/css" "${BASE_URL}/css/style.css"

assert_status "api.js serves" "200" "${BASE_URL}/js/api.js"
assert_content_type "JS content type" "javascript" "${BASE_URL}/js/api.js"

assert_status "components.js serves" "200" "${BASE_URL}/js/components.js"
assert_status "app.js serves" "200" "${BASE_URL}/js/app.js"

# CORS
TOTAL=$((TOTAL + 1))
CORS="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "${BASE_URL}/api/projects")"
if [[ "$CORS" == "204" ]]; then
    green "PASS: OPTIONS /api/projects returns 204"
    PASSED=$((PASSED + 1))
else
    red "FAIL: OPTIONS expected 204, got $CORS"
    FAILED=$((FAILED + 1))
fi

# API available through same origin
assert_status "API responds" "200" "${BASE_URL}/api/projects"

echo ""
echo "════════════════════════════════════"
echo "Results: $PASSED passed, $FAILED failed, $TOTAL total"
[[ $FAILED -eq 0 ]] && green "All tests passed!" || red "$FAILED tests failed"
exit $FAILED
