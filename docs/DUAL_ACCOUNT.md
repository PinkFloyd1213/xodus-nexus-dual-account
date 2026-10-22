# Xodus Nexus — dual-account edition

A fork of [domsvoboda/xodus-nexus](https://github.com/domsvoboda/xodus-nexus)
that reproduces how Windows works with two Microsoft accounts:

| On Windows | Here | Used for |
|---|---|---|
| Microsoft Store account (the one with Game Pass) | **License account (Store)** | catalog, library, Game Pass, downloads, decryption, licenses, updates |
| Xbox app account (personal account) | **Xbox account (in-game)** | everything the game sees: XUser identity, gamertag, friends, achievements, cloud saves, presence, PlayFab; in Nexus: gamertag, avatar, achievements, time played |

Xbox PC licenses are bound to the device, so the device (device token and
device license) is **shared** by both accounts, as on a Windows PC.

With no Xbox account signed in, everything falls back to the license account,
and the behavior is exactly that of upstream Nexus.

The matching backend is the fork
[xodus-dual-account](https://github.com/PinkFloyd1213/xodus-dual-account)
(branch `dual-account`). Its detailed documentation (call-site map, design,
tests) is in that repository's `docs/dual-account.md`.

## Usage

1. Download the latest AppImage from
   [Releases](https://github.com/PinkFloyd1213/xodus-nexus-dual-account/releases)
   (`Xodus-Nexus-<version>-dual.<n>-x86_64.AppImage`). It uses the same
   profile as upstream Nexus (`~/.config/xodus-nexus`), so games, settings and
   runtime are kept. Only one of the two can run at a time.
2. **Settings → Xodus backend → "Use dual-account backend"**. Nexus clones the
   pinned Xodus commit from the backend fork, applies the 39 patches and builds
   locally. This requires `git`, `cargo`, `rustc` and `protoc`. If rustup has
   the lock's Rust version (`1.99.0`), it is used automatically. Expect about a
   minute on a recent machine.
   - The previously active backend is remembered: **"Restore previous backend"**
     switches back, and clicking it again returns to the dual-account backend.
   - Prebuilt backends cannot be installed in this edition, because they lack
     dual-account support.
   - When a launcher update changes the backend recipe, Settings shows
     **"Update dual-account backend"**.
3. **License account (Store)**: the usual sign-in ("Sign in with Xodus") with
   the account that has Game Pass. Nothing to redo if already signed in.
4. **Xbox account (in-game)**: "Sign in Xbox account" with the personal
   account. The sidebar then shows its gamertag and avatar, with the Game Pass
   badge of the license account.
5. Launch a game. If a game was already running, restart it after changing the
   Xbox account.

"Sign out Xbox account" removes only the Xbox account; the license account and
the device stay intact. "Sign out" (license account) behaves as in upstream
Nexus and keeps the Xbox account.

Launcher updates arrive through Settings → "Check for updates" (see
[AUTOMATION.md](AUTOMATION.md)).

## Checking which account is used

The game log contains one line per request type, written again whenever it
changes:

```
Xodus account for MsaTokenRequest: play
Xodus account for StoreLicenseTokenRequest: store
Xodus account for StorePackageUpdatesRequest: store
```

`… (play account not set, using the license account)` means no Xbox account is
signed in. These lines contain no identifiers and no tokens.

## Known limitations

- **Games that match the Store receipt against the player.** XStore receipts
  are issued for the license account, as on Windows. A publisher that compares
  that receipt with the player on its servers may refuse DLC or virtual
  currency. To diagnose: "Sign out Xbox account", restart the game, compare.
- **Local saves.** Saves created before switching to the Xbox account are
  stored under the previous XUID and are no longer visible. The Xbox account's
  cloud saves take over.
- **Launcher updates.** The in-app updater only looks at this fork's releases,
  so an upstream AppImage never replaces this edition.
- **Terminal sign-in.** The backend is built without a native webview, like
  the Nexus backend, so the Xbox account signs in through Nexus.

## Differences from upstream Nexus (for a possible merge)

Everything is additive and only active when the lock contains
`xodus-dual-account.patch` (`DUAL_ACCOUNT_BACKEND`) or when the backend
exposes `login --account` (`capabilities.dualAccount`).

| File | Change |
|---|---|
| `assets/backend-source.lock.json`, `assets/xodus-dual-account.patch` | backend patch last, dedicated `patchId`, `repository` = backend fork, `compatibility` unchanged |
| `src/main/backend.ts` | `sourceOnly` (no prebuilt release), lock toolchain, `previous.json` + `restorePrevious()`, `dualAccount` detection, outdated recipe detection |
| `src/main/index.ts` | `auth.play` state, `xboxIdentity()`, license account profile, IPC `login-play`/`logout-play`/`backend-restore-previous` |
| `account-refresh.ts`, `auth-transport.ts`, `account-profile.ts`, `game-achievements.ts`, `game-activity.ts` | optional `--account play` arguments |
| `xodus-service.ts` | service role lines in the game log |
| `src/renderer/App.tsx` | "Xbox account (in-game)" card, dual-account backend buttons |
| `launcher-update.ts` | updates from this fork (`LAUNCHER_REPOSITORY`, `-dual.N` tags) |

An upstream merge would drop the `launcher-update.ts` repository change and
make `sourceOnly` unnecessary by publishing a prebuilt backend that includes
the patch.

## Fixes not specific to dual accounts

This edition also fixes two upstream Nexus bugs:

- **"Last played" was always unavailable**, with "Some Xbox activity could not
  be retrieved". See [`docs/upstream/ACTIVITY_FIX.md`](upstream/ACTIVITY_FIX.md)
  for a standalone patch, the procedure and a ready-to-post report. Nothing
  has been sent upstream.
- **The launcher did not come back after an in-app update** ("Cannot mount
  AppImage"). Electron's `app.relaunch()` starts its relauncher with
  `no_new_privs`, so the setuid `fusermount` cannot mount the new image.
  `relaunchAfterExit()` starts it from a detached shell instead.

## Maintenance (following upstream)

The GitHub workflows automate this (see [AUTOMATION.md](AUTOMATION.md)). To do
it by hand, in `xodus-backend` (Xodus fork):

```bash
git -C ../xodus-nexus fetch upstream && git -C ../xodus-nexus merge upstream/main
scripts/nexus-base.sh ../xodus-nexus nexus-base-next
git rebase --onto nexus-base-next nexus-base dual-account
git branch -f nexus-base nexus-base-next && git branch -D nexus-base-next
scripts/dual-account-patch.sh
```

Then, in `xodus-nexus`:

1. Copy `xodus-dual-account.patch` into `assets/`.
2. Keep it **last** in `patches` with its new sha256, keep `repository`
   pointing at the backend fork, and bump the `-dual-account-N` suffix of
   `patchId`.
3. Run `npx vitest run`, then push `dual-account`; CI publishes the release.

An upstream merge may conflict on the lock: take upstream's version, then
reapply step 2.
