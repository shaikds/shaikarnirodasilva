#!/bin/bash
# Blocks editing of sensitive files

FILE_PATH="${CLAUDE_FILE_PATH:-}"

# List of protected file patterns
PROTECTED_PATTERNS=(
    "\.env"
    "\.pem$"
    "\.key$"
    "package-lock\.json$"
    "yarn\.lock$"
    "\.git/"
    "credentials"
    "secret"
)

for pattern in "${PROTECTED_PATTERNS[@]}"; do
    if echo "$FILE_PATH" | grep -qE "$pattern"; then
        echo "BLOCKED: Cannot edit protected file: $FILE_PATH" >&2
        echo "If you need to modify this file, ask the user for explicit permission." >&2
        exit 2
    fi
done

exit 0
