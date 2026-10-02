# T3 Code (Brandon)

A frontend fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code). Zeus runs the official
T3 Code Nightly; Hermes runs this fork as "T3 Code (Brandon)" and connects to Zeus.

## How it stays current

- `brandon` is the fork's branch: a small stack of commits on top of an upstream nightly tag.
  `origin/brandon` is the source of truth. Land changes by merging PRs into it.
- `fork/sync.sh` runs daily at 06:00 on Zeus (`fork/zeus/install.sh` sets that up). It rebases
  `brandon` onto the nightly Zeus runs, keeping the same version so the client and server match. It
  then runs typecheck and the web tests, builds an ad-hoc signed arm64 app into `~/t3-fork-builds`,
  and force-pushes `brandon`. If anything fails, it keeps the last good build and records the
  failure in `~/t3-fork-builds/status.json`.
- On Hermes, `t3-update check` runs every 30 minutes. It downloads new builds over SSH and installs
  them if the app is closed, or notifies you if it's open. It also notifies you about failed syncs.
  Run `t3-update` to restart into a new build, or `t3-update rollback` to go back.

## Rules for fork changes

- Put new features in new files and keep edits to upstream files to a few lines, so rebases stay
  clean.
- Don't develop directly in Zeus's `~/code/t3code` checkout, because the sync resets it to
  `origin/brandon`. Use worktrees or PRs.
- The fork is frontend only. Zeus runs a stock server, so fork state, such as Spaces, lives on the
  client.
