#!/bin/bash
# Auto-format files after Claude edits them

FILE_PATH="${CLAUDE_FILE_PATH:-}"

# Only format if prettier is available
if command -v npx &> /dev/null && [ -f "node_modules/.bin/prettier" ]; then
    npx prettier --write "$FILE_PATH" 2>/dev/null || true
fi

exit 0
