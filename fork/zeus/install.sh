#!/bin/bash
# Run on Zeus: schedules fork/zeus/nudge.sh daily at 06:00 with launchd. It
# sends `sync` to the persistent upkeep thread, which runs fork/sync.sh.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="com.brandon.t3fork.sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$REPO/fork/zeus/nudge.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/t3fork-nudge.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/t3fork-nudge.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Scheduled $LABEL daily at 06:00"
