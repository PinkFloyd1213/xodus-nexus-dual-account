# GitHub automation (dual-account edition)

Two repositories:

- [PinkFloyd1213/xodus-nexus-dual-account](https://github.com/PinkFloyd1213/xodus-nexus-dual-account)
  (launcher)
- [PinkFloyd1213/xodus-dual-account](https://github.com/PinkFloyd1213/xodus-dual-account)
  (backend)

In both, the working and default branch is `dual-account`; `main` stays an
exact copy of upstream.

## What runs on its own

| Workflow | Repository | When | Effect |
|---|---|---|---|
| `dual-account-release.yml` | launcher | push to `dual-account` (except docs) | tests, AppImage, release `v<version>-dual.<n>`; the in-app updater offers it |
| `dual-account-checks.yml` | launcher | PR into `dual-account` | launcher tests; full backend recipe (clone, 39 patches, build, tests) |
| `upstream-sync.yml` | launcher | daily at 05:17 UTC, or by hand | keeps `main` equal to domsvoboda, then opens an `upstream-sync` → `dual-account` PR when there is something new |
| `claude-pr.yml` | launcher | every PR into `dual-account` (including sync PRs) | Claude reviews, merges `dual-account` if needed, rebases the backend patch when the lock changed, fixes tests, pushes to the PR branch and summarizes. **Never merges.** |
| `claude-mention.yml` | launcher | an `@claude …` comment by the owner | Claude does what was asked on the PR or issue |
| `upstream-mirror.yml` | backend | daily at 05:07 UTC | keeps `main` equal to xodus-gaming/xodus so the commit pinned by the lock stays fetchable |
| `nexus-sync.yml` | backend | daily at 05:27 UTC, or by hand | when upstream Nexus changes its backend recipe, adds it as one commit on `nexus-base` and opens a `nexus-sync` → `dual-account` PR |
| `claude-pr.yml`, `claude-mention.yml` | backend | PRs into `dual-account`, `@claude` by the owner | same agent, Rust side: merges, routes new account uses to store/play, builds and tests |
| `patch-export.yml` | backend | push to `dual-account` touching `crates/` | regenerates `xodus-dual-account.patch` and pushes it to the open Nexus `upstream-sync` PR, or opens a Nexus PR |
| `dual-account.yml` | backend | push or PR on `dual-account` | build and tests of the dual-account backend |

Upstream workflows that only serve upstream releases or upstream's Tolgee
project (`backend.yml`, `runtime.yml`, `release.yml`, `wiki.yml`, `rust.yml`,
`translations.yml`, `translation-suggestions.yml`) are **disabled** in the
forks through the Actions settings, without editing the files. Disable any new
upstream workflow that needs upstream's secrets the same way.

The backend comes from **this owner's** repository:
`assets/backend-source.lock.json` → `repository` = `xodus-dual-account`. When
the lock changes (new AppImage), Nexus marks the local backend as outdated and
shows **"Update dual-account backend"**.

After an in-app launcher update, "Restart launcher" starts the new AppImage
from a detached shell (`relaunchAfterExit()`), not through Electron's
relauncher, which cannot mount AppImages.

## How an upstream release flows

1. domsvoboda publishes: the launcher repo opens "Sync upstream Nexus" (code)
   and, if the backend recipe changed, the backend repo opens "Sync Nexus
   backend recipe".
2. Claude reviews both. Merge the **backend** PR first (merge commit, not
   squash): `patch-export` then pushes the regenerated patch onto the launcher
   sync PR.
3. Merge the launcher PR once its checks are green: a release follows, then
   use "Update dual-account backend" in Settings.

Both repositories only allow merge commits, so upstream history and
`nexus-base` stay ancestors of `dual-account`.

## One-time owner setup

The Claude agent needs two things only the owner can do:

1. **Install the Claude GitHub App** on `xodus-nexus-dual-account` and `xodus-dual-account`:
   https://github.com/apps/claude (or `/install-github-app` in a `claude`
   terminal). Without the app, Claude cannot push fixes in a way that re-runs
   CI.
2. **Create the token** locally:

   ```bash
   claude setup-token
   ```

   then store it as a secret named `CLAUDE_CODE_OAUTH_TOKEN` in **both** repositories:

   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN -R PinkFloyd1213/xodus-nexus-dual-account
   gh secret set CLAUDE_CODE_OAUTH_TOKEN -R PinkFloyd1213/xodus-dual-account
   ```

   Paste the token when prompted. Never put it in a file in the repository.
   Usage counts against the owner's Claude subscription.

Optional: **`SYNC_TOKEN`**, a fine-grained GitHub token with Contents, Pull
requests and Workflows write access limited to the two repositories, stored as
a secret in **both**. Without it, the sync fails with a clear message on days
when upstream edits its own workflows; clicking "Sync fork" on GitHub or adding
the token fixes it. With it, sync PRs also start CI by themselves.

## Day to day

- **Code changes:** push to `dual-account`. A release appears about 10 minutes
  later, and the launcher offers it in Settings → Check for updates.
- **Upstream moves:** a "Sync upstream Nexus" PR appears, checks and Claude run
  on it, and Claude posts a summary. Merge when it is green and the summary
  looks right; the merge triggers a new release.
- **The backend changes** (patch or lock): after updating the AppImage, click
  "Update dual-account backend" in Settings.

## Safeguards

- Claude cannot merge, force-push or use `gh`; its commands are limited to a
  fixed allowlist in the workflow.
- PRs from other forks receive no secrets and Claude does not run on them.
  `@claude` only answers the owner (`OWNER`).
- Protect `dual-account` to require PRs if wanted: Settings → Branches →
  "Require a pull request".
