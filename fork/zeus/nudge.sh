#!/bin/bash
# Sends `sync` to the persistent upkeep thread (id in ~/t3-fork-builds/upkeep-thread).
# If the thread is busy, retries every 10 minutes for up to two hours.

set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$HOME/code/scripts/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ID_FILE="$HOME/t3-fork-builds/upkeep-thread"
[[ -s "$ID_FILE" ]] || { echo "No upkeep thread id in $ID_FILE"; exit 1; }
ID="$(cat "$ID_FILE")"

for _ in $(seq 1 12); do
  state="$(threads status "$ID" --json 2>/dev/null | jq -r '.[0].state // empty' || true)"
  case "$state" in
    idle | interrupted | error)
      threads send "$ID" "sync"
      echo "$(date) sent sync to $ID"
      exit 0
      ;;
  esac
  echo "$(date) thread $ID is '${state:-unreachable}'; retrying in 10 minutes"
  sleep 600
done
echo "$(date) gave up: thread $ID stayed busy"
exit 1
