#!/usr/bin/env bash
set -euo pipefail

PLIST_DEST="$HOME/Library/LaunchAgents/com.shaikds.macefficiencymonitor.plist"

launchctl unload "$PLIST_DEST" 2>/dev/null || true
rm -f "$PLIST_DEST"

echo "Stopped and removed the background agent."
echo "Your activity history is kept at ~/.mac_efficiency_monitor/activity.db"
echo "(delete it manually if you want to clear it)."
