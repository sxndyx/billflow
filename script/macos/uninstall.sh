#!/bin/bash
# Removes the Mac app and the scheduled agent. Leaves the project and the
# database alone.
set -uo pipefail
AGENT_LABEL="com.billflow.scheduled-launch"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"

launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.billflow.server" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.billflow.server.plist"
rm -f "$AGENT_PLIST"
rm -rf "$HOME/Applications/BillFlow.app"
echo "Removed BillFlow.app and the scheduled agent."
echo "The project folder and your database are untouched."
