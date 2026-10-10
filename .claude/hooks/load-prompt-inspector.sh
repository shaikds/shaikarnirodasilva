#!/bin/bash
# Turns the prompt inspector on in cloud sessions. Claude Code loads a plugin
# under the project's .claude/skills only once the workspace is trusted, and a
# cloud session never asks; a copy under ~/.claude/skills loads without asking.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
src="$CLAUDE_PROJECT_DIR/.claude/skills/prompt-inspector"
dst="$HOME/.claude/skills/prompt-inspector"
[ -d "$src" ] || exit 0
mkdir -p "$HOME/.claude/skills"
rm -rf "$dst"
cp -r "$src" "$dst"
