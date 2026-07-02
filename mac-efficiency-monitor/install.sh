#!/usr/bin/env bash
# Installs mac-efficiency-monitor as a background LaunchAgent (runs at login).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$DIR/launchd/com.shaikds.macefficiencymonitor.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.shaikds.macefficiencymonitor.plist"

echo "Installing mac-efficiency-monitor from $DIR"

mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__INSTALL_DIR__|$DIR|" "$PLIST_SRC" > "$PLIST_DEST"

launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "Installed and started."
echo "Logs:   /tmp/mac-efficiency-monitor.log"
echo "Report: python3 -m efficiency_monitor today   (run from $DIR)"
echo "Revisit list: python3 -m efficiency_monitor revisit"
echo ""
echo "First run will ask for Accessibility permission (System Settings > Privacy & Security"
echo "> Accessibility) so it can read the frontmost window title via System Events."
