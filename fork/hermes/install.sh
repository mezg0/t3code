#!/bin/bash
# Run on Hermes:
#   ssh brandongomes@zeus.tail91d1cf.ts.net 'cat ~/code/t3code/fork/hermes/install.sh' | bash
#
# Installs t3-update into ~/.local/bin, schedules `t3-update check` every 30
# minutes with launchd, and installs the latest build.

set -euo pipefail

ZEUS="${T3FORK_ZEUS:-brandongomes@zeus.tail91d1cf.ts.net}"
LABEL="com.brandon.t3fork.update"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BIN="$HOME/.local/bin/t3-update"

mkdir -p "$HOME/.local/bin" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
ssh -o BatchMode=yes "$ZEUS" 'cat ~/code/t3code/fork/hermes/t3-update' >"$BIN.tmp"
chmod +x "$BIN.tmp"
mv "$BIN.tmp" "$BIN"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$BIN</string><string>check</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>T3FORK_ZEUS</key><string>$ZEUS</string></dict>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/t3-update.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/t3-update.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Installed t3-update. Make sure ~/.local/bin is on your PATH."
T3FORK_ZEUS="$ZEUS" "$BIN" install
