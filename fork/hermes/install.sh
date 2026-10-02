#!/bin/bash
# Run on Hermes:
#   ssh brandongomes@zeus.tail91d1cf.ts.net 'cat ~/code/t3code/fork/hermes/install.sh' | bash
#
# Installs t3-update into ~/.local/bin and an "Update T3 Code" app into
# ~/Applications, schedules `t3-update check` every 5 minutes with launchd,
# starts `t3-update watch` (updates on app quit/start), and installs the latest
# build.

set -euo pipefail

ZEUS="${T3FORK_ZEUS:-brandongomes@zeus.tail91d1cf.ts.net}"
LABEL="com.brandon.t3fork.update"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BIN="$HOME/.local/bin/t3-update"

mkdir -p "$HOME/.local/bin" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
ssh -n -o BatchMode=yes "$ZEUS" 'cat ~/code/t3code/fork/hermes/t3-update' >"$BIN.tmp"
chmod +x "$BIN.tmp"
mv "$BIN.tmp" "$BIN"

# "Update T3 Code" app for Spotlight/Dock: runs `t3-update install`, then opens the app.
mkdir -p "$HOME/Applications"
ssh -n -o BatchMode=yes "$ZEUS" 'cat ~/code/t3code/fork/hermes/update-t3.applescript' >"$HOME/.update-t3.applescript"
rm -rf "$HOME/Applications/Update T3 Code.app"
UPDATE_APP="$HOME/Applications/Update T3 Code.app"
osacompile -o "$UPDATE_APP" "$HOME/.update-t3.applescript"
rm -f "$HOME/.update-t3.applescript"
# Handle t3fork-update:// so the sidebar's update button can launch it.
plutil -replace CFBundleIdentifier -string com.brandon.t3fork.update-app "$UPDATE_APP/Contents/Info.plist"
plutil -replace CFBundleURLTypes -json \
  '[{"CFBundleURLName":"T3 fork update","CFBundleURLSchemes":["t3fork-update"]}]' \
  "$UPDATE_APP/Contents/Info.plist"
codesign --force --sign - "$UPDATE_APP" 2>/dev/null
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$UPDATE_APP"

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
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/t3-update.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/t3-update.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# Watcher: applies updates when the app quits or starts.
WATCH_LABEL="com.brandon.t3fork.watch"
WATCH_PLIST="$HOME/Library/LaunchAgents/$WATCH_LABEL.plist"
cat >"$WATCH_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$WATCH_LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$BIN</string><string>watch</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>T3FORK_ZEUS</key><string>$ZEUS</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/t3-update.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/t3-update.log</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$WATCH_LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$WATCH_PLIST"

echo "Installed t3-update. Make sure ~/.local/bin is on your PATH."
T3FORK_ZEUS="$ZEUS" "$BIN" install
