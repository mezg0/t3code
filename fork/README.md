# T3 Code (Brandon)

A small, frontend-only fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code). Read this
before changing the fork, its tooling, or anything about how Zeus and Hermes run T3 Code.

## Machines

- **Zeus** (`zeus.tail91d1cf.ts.net`) is Brandon's always-on MacBook Pro. It runs the **official**
  T3 Code Nightly (`/Applications/T3 Code (Nightly).app`), whose server hosts every project and agent
  thread. It also holds this checkout (`~/code/t3code`), builds the fork and runs the upkeep thread.
- **Hermes** (`hermes.tail91d1cf.ts.net`) is Brandon's MacBook Air. It runs this fork as
  "T3 Code (Brandon)" and connects to Zeus's server. Brandon works from Hermes and never touches
  Zeus's screen, so anything you want him to see goes through T3 Code (threads, previews) or Hermes.
- Hermes reaches Zeus through T3 Connect (the relay), with a direct tailnet connection as backup.
  Zeus also allows SSH from Hermes, which the updater uses.

The fork only changes the client. Zeus's server is stock, so the fork's client must match the
server's version: every build is based on the exact Nightly tag Zeus runs.

## Repository layout

- Remotes: `origin` is Brandon's GitHub fork; upstream tags (`v*-nightly.*`) come from
  `pingdotgg/t3code`.
- **`brandon`** is the fork: a short stack of `fork:` / `fork(<area>):` commits on top of an
  upstream Nightly tag. **`origin/brandon` is the source of truth.** There are no other long-lived
  branches.
- `fork/` holds everything fork-specific:
  - `sync.sh`: rebase, verify, build and publish (see below).
  - `UPKEEP.md`: instructions for the upkeep thread.
  - `hermes/t3-update`, `hermes/install.sh`, `hermes/update-t3.applescript`: the Hermes updater.
- Root `AGENTS.md` has a short pointer to this file. Keep fork notes here, not in upstream docs.

## Making a change

1. **Never edit `~/code/t3code` directly.** `sync.sh` resets it to `origin/brandon`, and other
   threads share it. Work in a worktree:
   `git worktree add -b fork/<topic> ~/code/t3code-worktrees/<topic> brandon`
2. Keep changes small so rebases stay clean: new features in new files, and only a few lines in
   upstream files. Mark fork edits inside upstream files with a `Fork:` comment.
3. Install and verify (pnpm needs `CI=true` when there's no TTY, or it aborts on a modules purge):
   ```sh
   export CI=true PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PWD/node_modules/.bin:$PATH"
   pnpm install --frozen-lockfile
   pnpm --filter @t3tools/web typecheck   # or `pnpm typecheck` for everything
   pnpm --filter @t3tools/web test
   ```
4. Commit with a `fork:` or `fork(<area>):` subject, then land it on `brandon` either way:
   - **Pull request** (features, anything Brandon should review): push `fork/<topic>` and open a PR
     into `brandon` on `origin`.
   - **Fast-forward** (small fixes Brandon has already approved):
     `cd ~/code/t3code && git merge --ff-only fork/<topic> && git push origin brandon`.
     Fetch first and rebase your branch if `brandon` has moved; other threads land on it too.
     Never force-push `brandon` yourself; only `sync.sh`'s rebase does that.
5. Ship it (next section), then remove the worktree and branch.

To undo a shipped change, `git revert` it on `brandon` rather than rewriting history.

## Previewing a change with real data

A worktree's dev server starts with an empty data folder, so connect it to Zeus's real server:

1. `tailscale` isn't on the PATH, so make a shim and put `/tmp/ts-shim` first on the PATH:
   ```sh
   mkdir -p /tmp/ts-shim
   printf '#!/bin/sh\nTAILSCALE_BE_CLI=1 exec /Applications/Tailscale.app/Contents/MacOS/Tailscale "$@"\n' > /tmp/ts-shim/tailscale
   chmod +x /tmp/ts-shim/tailscale
   ```
2. In the worktree, run `node scripts/dev-runner.ts dev --share` in the background. It prints an
   HTTPS tailnet URL and a pairing URL; open the pairing URL in the T3 preview browser.
3. Publish Zeus's real server over tailnet HTTPS and make a pairing token:
   `tailscale serve --bg --https=8519 http://127.0.0.1:3773`, then
   `t3 pair --ttl 30m --label "Fork dev preview"` (see "Running the T3 CLI on Zeus").
4. In the dev app: Settings → Connections → Add environment, then paste
   `https://zeus.tail91d1cf.ts.net:8519/pair#token=<token>`.
5. When done: stop the dev server, run `tailscale serve --https=8519 off` (and turn off the dev
   share port), and delete the worktree.

The preview shows Brandon's **live** threads: snooze, settle and send act on real data. The
preview tool's click and type actions are unreliable on this app; driving the page with
`preview_evaluate` (native input value setters plus `click()`) works. Pairing tokens are one-time,
and navigating away mid-pair burns them; make another for the dev server with
`t3 pair --base-dir <worktree>/.t3`.

For quick design comparisons, static HTML mock-ups in `~/t3-fork-builds/docs/` served with
`python3 -m http.server 8530 --bind 0.0.0.0` work well. Render a PNG with the Playwright headless
shell in `~/Library/Caches/ms-playwright/chromium_headless_shell-*/` (there's no Chrome on Zeus).

## Building and shipping

`fork/sync.sh` runs the whole pipeline and publishes nothing unless every step passes:

1. Reads Zeus's Nightly version and rebases `origin/brandon` onto tag `v<version>` (a no-op when
   it's already there).
2. Runs `pnpm install`, typecheck and the web unit tests.
3. Builds an ad-hoc signed arm64 "T3 Code (Brandon)" zip into `~/t3-fork-builds/builds/` and
   writes `~/t3-fork-builds/latest.json` (build ID `<version>+<commit>`).
4. Force-pushes the rebased `brandon`.

On failure it keeps the last good build and records why in `~/t3-fork-builds/status.json` (logs in
`~/t3-fork-builds/logs/`). Run it yourself to ship straight away: `~/code/t3code/fork/sync.sh`.

**Daily upkeep.** A persistent "T3 fork upkeep" thread (id in `~/t3-fork-builds/upkeep-thread`,
in the t3code project) owns a T3 scheduled task that sends it `sync` every day at 06:00 Zeus time.
It runs `sync.sh` and fixes rebase conflicts or failing checks, following `fork/UPKEEP.md`. There
is no launchd job any more; the scheduled task is the only trigger.

**Hermes updates** (`fork/hermes/t3-update`, installed at `~/.local/bin/t3-update`):

- `check` runs every 5 minutes (launchd `com.brandon.t3fork.update`). It fetches `latest.json` from
  Zeus over SSH, downloads and verifies a new build into staging, and installs it straight away if
  the app is closed. It doesn't notify; a running app picks the build up later.
- `watch` runs all the time (launchd `com.brandon.t3fork.watch`). It installs a staged build as
  soon as the app quits, and restarts into a newer build if one is ready within 30 seconds of launch.
- The sidebar's **Update to latest build** button installs on demand. `t3-update status` shows the
  installed, staged and latest builds; `t3-update rollback` goes back one build.
- Installs are serialised by a lock, so the watcher, the check and the button can't race.
- The only notifications are "build failed" and "Updating T3 Code (Brandon)" (an auto-restart
  just after launch).
- To get a fresh build onto Hermes without waiting: `ssh hermes '~/.local/bin/t3-update check'`.
  Zeus never needs SSH access to Hermes for normal updates; Hermes pulls.
- After editing `t3-update`, copy it to `~/.local/bin/t3-update` on Hermes and restart the watcher
  there: `launchctl kickstart -k gui/$(id -u)/com.brandon.t3fork.watch`.

## Updating the Nightly on Zeus

**The V2 Nightly never downloads updates by itself.** Upstream disables auto-download and
install-on-quit, so it only updates when someone clicks Update in Zeus's own window, which Brandon
never sees. Zeus falls behind until it's updated deliberately; an automatic daily installer has
been discussed but not built. To update by hand:

1. Download the official signed `T3-Code-<version>-arm64.zip` from the `v<version>` GitHub release.
2. Check it: `codesign --verify --deep --strict` on the app, and its `CFBundleShortVersionString`.
3. Quit "T3 Code (Nightly)", move the old app aside as a backup, put the new one in
   `/Applications`, reopen it, and wait for `http://127.0.0.1:3773/.well-known/t3/environment`.
4. Run `fork/sync.sh` (or send `sync` to the upkeep thread) so the fork rebuilds on the new version.

Restarting the Nightly **interrupts every running agent thread** and briefly disconnects Brandon,
including the thread doing it. Check with Brandon first, and run the restart from something that
survives it (a launchd job, as `~/t3-fork-builds/v2-watcher.sh` did), not from a thread's shell.

## Running the T3 CLI on Zeus

There's no `t3` on the PATH. Use the installed app's server bundle:

```sh
A="/Applications/T3 Code (Nightly).app/Contents"
t3() { ELECTRON_RUN_AS_NODE=1 "$A/MacOS/T3 Code (Nightly)" "$A/Resources/app.asar/apps/server/dist/bin.mjs" "$@"; }
t3 connect status      # T3 Connect / relay state
t3 pair --ttl 30m      # one-time pairing token (add --base-dir <dir> for another server)
```

**If Hermes can't reach Zeus** and `cloudflared` reports "Tunnel not found": back up
`~/.t3/userdata/secrets`, run `t3 connect unlink` then `t3 connect link --headless`, restart the
Nightly (from launchd, see above), then run `t3 connect publish` to turn push notifications back on.

## Orchestrator V2 notes

- Server state is `~/.t3/userdata/statev2.sqlite`. The pre-V2 `state.sqlite` is frozen; never read
  it for current data.
- The desktop app's browser profile is `~/Library/Application Support/t3code-v2`. It only holds UI
  preferences; threads live on the server.
- Agent threads coordinate with the T3 MCP tools (launch, send, read, wait, delegate, schedule).
  Their limits:
  - They only see threads **in their own project**.
  - `schedule_task` only binds to the calling thread. To schedule work in another thread, ask that
    thread to schedule itself.
  - Changing project settings (for example icons) needs a full-access thread; otherwise Brandon
    does it in Project settings.
- Settings → Scheduled tasks can only create "new thread per run" tasks. Tasks bound to an existing
  thread are created by that thread's agent.
- The old `threads` CLI, `t3-shepherd`, `t3-clean` and launchd nudges are retired. Don't recreate
  them; use the MCP tools and scheduled tasks.

## Design decisions (sidebar)

Recorded so nobody re-litigates them:

- **One-line thread rows (36px).** A two-line layout (title, then branch, PR and time) was shipped
  and reverted: it showed fewer threads without adding useful information. Rows show no times.
- **Row order:** project icon, title, PR and terminal badges, then the status icon at the right
  edge. Status icons line up on the right; badges shift left only on rows that have a status.
  Putting the status in the project icon's slot was tried and rejected because it hid the project.
- Hover swaps the badges and status for Snooze and Settle; a Woke alarm stays visible, and clicking
  it dismisses it. The diff count and machine icon live in the hover tooltip, not the row.
- Agent fan-outs (a coordinator launching a worker thread per issue) use **thread tags**. A
  coordinator thread owns a tag (right panel → Tagged threads, e.g. `SENTRY`), and threads whose
  titles start with `{{SENTRY}}` belong to it: they're listed in its Tagged panel (using the
  sidebar's own rows), their header has a "↰ coordinator" crumb back, and the sidebar files them
  under a collapsible Tagged shelf (pins, snoozes and settles keep their own shelves; the header
  counts threads that need Brandon). One owner per tag. Tags live on the device; an archived or
  deleted owner releases its threads. Membership is the title prefix, so agents must keep it.
  Earlier attempts: nesting launched threads under their launcher (removed: the server records no
  parent, so the client guessed from first messages), then a repo clone per kind of work (dropped).
- **Project groups** are named sets of projects at the top of the project filter ("New group…"
  creates one; the pencil edits or deletes it). They're stored per device, like the filter itself.
  Ctrl+1–9 on macOS (Alt+1–9 elsewhere; Ctrl/Cmd+digit jumps to threads) picks group 1–9 and
  Ctrl+0 shows all projects. Cmd+Ctrl+digit was tried and rejected as awkward.
- An Overview page (group cards with thread counts, plus open pull requests) was built and removed,
  and a triage-inbox version was mocked up and dropped. Don't rebuild one without asking Brandon.
- The "No project" icon is a project setting (Project settings → Project icon), not code. Brandon
  chose `message-circle` in gray.

## Rules for fork changes

- Frontend only. Fork state that needs storing, such as Spaces, lives on the client.
- Small, isolated commits; new features in new files; few-line hooks into upstream code.
- Work in worktrees, ship through `sync.sh`, and never leave `~/code/t3code` dirty.
- If a change would alter what an existing fork feature does, ask Brandon first.
