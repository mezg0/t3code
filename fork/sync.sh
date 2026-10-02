#!/bin/bash
# Keeps the `brandon` branch rebased onto the T3 Code nightly that Zeus runs,
# verifies it, and builds "T3 Code (Brandon)" for Hermes to pull.
#
# origin/brandon is the source of truth for the fork's commits. Each run:
#   1. Reads the version of /Applications/T3 Code (Nightly).app on Zeus.
#   2. Rebases origin/brandon onto upstream tag v<version>.
#   3. Runs typecheck + web unit tests, builds an unsigned arm64 zip, and
#      publishes it to $T3FORK_BUILDS/latest.json for Hermes.
#   4. Force-pushes the rebased branch to origin.
# Nothing is published unless every step succeeds. On a conflict or failed
# check it keeps the last good build and records the failure in status.json,
# which Hermes turns into a notification.
#
# Usage: fork/sync.sh [--force]

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BUILDS="${T3FORK_BUILDS:-$HOME/t3-fork-builds}"
NIGHTLY_APP="${T3FORK_NIGHTLY_APP:-/Applications/T3 Code (Nightly).app}"
NODE_BIN="${T3FORK_NODE_BIN:-$HOME/.nvm/versions/node/v24.15.0/bin}"
PRODUCT_NAME="T3 Code (Brandon)"
APP_ID="com.t3tools.t3code.brandon"
BRANCH="brandon"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

export PATH="$NODE_BIN:$REPO/node_modules/.bin:$HOME/.cargo/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
unset GITHUB_REPOSITORY T3CODE_DESKTOP_UPDATE_REPOSITORY CSC_LINK CSC_KEY_PASSWORD

mkdir -p "$BUILDS/logs" "$BUILDS/builds"
if ! mkdir "$BUILDS/.sync.lock" 2>/dev/null; then
  echo "Another sync is running ($BUILDS/.sync.lock)."
  exit 0
fi
trap 'rmdir "$BUILDS/.sync.lock"' EXIT

LOG="$BUILDS/logs/sync-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

log() { echo "[t3fork $(date +%H:%M:%S)] $*"; }

write_status() { # state message
  jq -n --arg state "$1" --arg message "$2" --arg version "${TARGET_VERSION:-}" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg log "$LOG" \
    '{state: $state, message: $message, version: $version, at: $at, log: $log}' \
    >"$BUILDS/status.json.tmp"
  mv "$BUILDS/status.json.tmp" "$BUILDS/status.json"
}

fail() {
  log "FAILED: $1"
  write_status failed "$1"
  exit 1
}

# T3 Code polls git status in this project and briefly holds .git/index.lock.
wait_for_index_lock() {
  for _ in $(seq 1 30); do
    [[ -e "$REPO/.git/index.lock" ]] || return 0
    sleep 1
  done
}

git_retry() {
  for _ in 1 2 3 4 5; do
    wait_for_index_lock
    git "$@" && return 0
    sleep 2
  done
  return 1
}

verify() {
  log "Typecheck"
  (cd "$REPO" && pnpm typecheck) || return 1
  log "Web unit tests"
  (cd "$REPO" && pnpm --filter @t3tools/web test) || return 1
}

cd "$REPO"

TARGET_VERSION="$(defaults read "$NIGHTLY_APP/Contents/Info" CFBundleShortVersionString)"
TARGET_TAG="v$TARGET_VERSION"
log "Zeus runs $TARGET_VERSION"

git fetch -q upstream --tags
git fetch -q origin
git rev-parse -q --verify "refs/tags/$TARGET_TAG" >/dev/null || fail "Upstream tag $TARGET_TAG not found"

[[ -z "$(git status --porcelain)" ]] || fail "Uncommitted changes in $REPO; commit or stash them"
git_retry switch -q "$BRANCH"
[[ -z "$(git rev-list "origin/$BRANCH..$BRANCH")" ]] ||
  fail "Local $BRANCH has commits not on origin/$BRANCH; push them first"
git_retry reset -q --hard "origin/$BRANCH"

BASE_TAG="$(git describe --tags --abbrev=0 --match 'v*-nightly.*' HEAD)"
log "Fork stack: $(git rev-list --count "$BASE_TAG..HEAD") commit(s) on $BASE_TAG"

if [[ "$BASE_TAG" != "$TARGET_TAG" ]]; then
  log "Rebasing onto $TARGET_TAG"
  wait_for_index_lock
  if ! git rebase -q --onto "$TARGET_TAG" "$BASE_TAG" "$BRANCH"; then
    git rebase --abort || true
    git reset -q --hard "origin/$BRANCH"
    fail "Rebase onto $TARGET_TAG has conflicts"
  fi
fi

[[ "$(git describe --tags --abbrev=0 --match 'v*-nightly.*' HEAD)" == "$TARGET_TAG" ]] ||
  fail "Branch is not based on $TARGET_TAG after rebase"

BUILD_ID="$TARGET_VERSION+$(git rev-parse --short=10 HEAD)"
if [[ $FORCE -eq 0 && -f "$BUILDS/latest.json" ]] &&
  [[ "$(jq -r .buildId "$BUILDS/latest.json")" == "$BUILD_ID" ]]; then
  log "Already built $BUILD_ID"
  write_status ok "Up to date"
  exit 0
fi

log "Installing dependencies"
pnpm install --frozen-lockfile >/dev/null || fail "pnpm install failed"
verify || fail "Typecheck/tests fail on $TARGET_TAG"

OUT="$BUILDS/builds/${BUILD_ID/+/-}"
rm -rf "$OUT"
log "Building $PRODUCT_NAME $BUILD_ID"
# Public T3 Connect / sign-in config, copied from the official release build.
# Upstream CI injects these; without them the build has Connect switched off.
# Scoped to the build so the unit tests don't see them.
T3CODE_CLERK_PUBLISHABLE_KEY="pk_live_Y2xlcmsudDMuY29kZXMk" \
  T3CODE_CLERK_JWT_TEMPLATE="t3-relay" \
  T3CODE_CLERK_CLI_OAUTH_CLIENT_ID="hzxSgY2cH10sDU2r" \
  T3CODE_RELAY_URL="https://relay.t3.codes" \
  T3CODE_DESKTOP_PRODUCT_NAME="$PRODUCT_NAME" T3CODE_DESKTOP_APP_ID="$APP_ID" \
  node scripts/build-desktop-artifact.ts --platform mac --target zip --arch arm64 \
  --build-version "$TARGET_VERSION" --output-dir "$OUT" || fail "Desktop build failed"

ZIP="$(find "$OUT" -maxdepth 1 -name '*.zip' | head -1)"
[[ -n "$ZIP" ]] || fail "Build produced no zip"

# Unsigned builds only carry the linker's signature on the main binary, which
# leaves the bundle invalid. Ad-hoc sign the whole app so it launches cleanly.
log "Ad-hoc signing"
rm -rf "$OUT/app" && ditto -x -k "$ZIP" "$OUT/app"
codesign --force --deep --sign - "$OUT/app/$PRODUCT_NAME.app" || fail "Ad-hoc signing failed"
codesign --verify --deep --strict "$OUT/app/$PRODUCT_NAME.app" || fail "Signature check failed"
rm -f "$ZIP" "$ZIP.blockmap"
ditto -c -k --keepParent "$OUT/app/$PRODUCT_NAME.app" "$ZIP"
rm -rf "$OUT/app"

jq -n --arg buildId "$BUILD_ID" --arg version "$TARGET_VERSION" \
  --arg commit "$(git rev-parse --short=10 HEAD)" --arg zip "$ZIP" \
  --arg sha256 "$(shasum -a 256 "$ZIP" | cut -d' ' -f1)" \
  --arg builtAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg changes "$(git log --format='- %s' "$TARGET_TAG..HEAD")" \
  '{buildId: $buildId, version: $version, commit: $commit, zip: $zip, sha256: $sha256, builtAt: $builtAt, changes: $changes}' \
  >"$BUILDS/latest.json.tmp"
mv "$BUILDS/latest.json.tmp" "$BUILDS/latest.json"

git push -q --force-with-lease origin "$BRANCH" || log "Warning: push to origin failed"

# Keep the three newest builds and two weeks of logs.
ls -1dt "$BUILDS"/builds/*/ 2>/dev/null | tail -n +4 | xargs rm -rf
find "$BUILDS/logs" -name 'sync-*.log' -mtime +14 -delete

write_status ok "Built $BUILD_ID"
log "Published $BUILD_ID"
