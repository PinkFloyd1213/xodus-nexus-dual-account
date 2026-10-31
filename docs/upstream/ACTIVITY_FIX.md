# "Last played" fix — optional upstream contribution

> **Status: not published.** The fix ships in the dual-account edition (inside
> `assets/xodus-dual-account.patch`, `patchId` `linux-run-v38-dual-account-2`
> or later). This folder is only for proposing it to
> [domsvoboda/xodus-nexus](https://github.com/domsvoboda/xodus-nexus) some day.
> Nothing has been sent.

## The bug (present in upstream Nexus)

On a game's details page, **Last played** is always unavailable and Nexus shows
*"Some Xbox activity could not be retrieved"*. For a game with no recorded play
time, no activity is shown at all.

Both causes are in `assets/xodus-game-activity.patch`
(`crates/xodus-cli/src/commands/game_activity.rs`):

1. **The titlehub request cannot return the date.**
   - Without an `Accept-Language` header, titlehub answers **HTTP 400**.
   - Even with that header, the `detail` decoration returns
     `titleHistory: null`. Only the `titlehistory` decoration contains
     `lastTimePlayed`.
2. **A stat without a value is treated as an error.** When a game has no
   recorded play time yet, userstats returns `MinutesPlayed` without `value`.
   The parser fails on it instead of treating it as no data.

Verified on 22.10.2026 against a real account with Star Trucker, Minecraft
Dungeons and BALL x PIT. Once fixed, time played and last played are shown and
the activity is no longer marked partial.

## Ready-made files

- [`xodus-activity-history.patch`](xodus-activity-history.patch)
  (sha256 `919eb1d002f594a5c3d727968de48a85ada0081278a91c3337f0e9c6ba717d04`):
  the fix alone, with its unit test, **without** the dual-account changes or
  the diagnostic line. It applies after every patch of the upstream lock
  (checked against commit `53ea781` plus the 38 patches of `linux-run-v38`),
  and the 76 `xodus-cli` tests pass.

## How to propose it

### GitHub allows one fork per account

GitHub allows only **one fork of a repository per account**. For a PR kept
separate from the dual-account edition, either:

- **Swap roles.** Rename the `xodus-nexus-dual-account` fork to `xodus-nexus`
  for contributions, then recreate `xodus-nexus-dual-account` as an
  **independent** repository (not a fork; it can be private). The launcher code
  does not change because the name is kept.
- **Use a free GitHub organization.** Create it on github.com, then fork into
  it: `gh repo fork domsvoboda/xodus-nexus --org <org>`.

The simplest option is **an issue only**, with the text below. No fork needed.

### Preparing the PR (locally)

Nexus' `CONTRIBUTING.md` asks for a `fix/…` branch targeting `develop`.

```bash
git fetch upstream
git switch -c fix/activity-last-played upstream/develop
cp docs/upstream/xodus-activity-history.patch assets/   # from the dual-account branch
```

In `assets/backend-source.lock.json`:

1. Add `{ "file": "xodus-activity-history.patch", "sha256": "<file sha256>" }`
   **last** in `patches`.
2. Bump `patchId` (for example `linux-run-v39`). Leave `compatibility` alone.

Check that the `develop` lock still pins commit `53ea781` with the same
patches. If not, regenerate the patch: from `xodus-backend`, run
`scripts/nexus-base.sh` on the new lock, reapply the change by hand, then
`git diff -- crates`.

Then run the checks Nexus asks for:

```bash
npm ci && npm run build && npm run test:ci-tools
node scripts/build-backend.mjs --work /tmp/nexus-backend-build --output /tmp/nexus-backend-release
```

`build-backend.mjs` requires `rustc 1.99.0`: run it from a directory with
`rustup override set 1.99.0`, or with `RUSTUP_TOOLCHAIN=1.99.0`.

## Issue / PR text

**Title:** Game activity: "Last played" is always unavailable and "Some Xbox activity could not be retrieved" is shown

### Summary

On a game's details page, **Last played** is always unavailable, and the page
shows *"Some Xbox activity could not be retrieved"*. This happens even for
titles the account played recently on Xbox or Windows. Time played does show
up for those titles. For titles with no recorded play time yet, both reads
fail and no activity is shown.

### Environment

- Xodus Nexus 0.3.10, managed backend 0.2.10 (`linux-run-v38`, commit `53ea781`)
- Fedora/Nobara, signed-in Microsoft account
- Reproduced with Star Trucker, Minecraft Dungeons and BALL x PIT

### Steps to reproduce

1. Sign in, then open the details page of an installed game the account has
   played before. Alternatively, run
   `xodus-cli game-activity <decimal TitleId> --json`.
2. **Expected:** `lastPlayed` is set and `partial` is `false`.
3. **Actual:** `lastPlayed` is `null` and `partial` is `true`. For a title with
   no recorded play time, the command fails with `activity-unavailable`.

### Root cause

Both bugs are in `assets/xodus-game-activity.patch`, file
`crates/xodus-cli/src/commands/game_activity.rs`.

1. **The titlehub request never returns history.** It requests
   `…/titles/titleid({title_id})/decoration/detail` without `Accept-Language`.
   Titlehub answers HTTP 400 without the header. Even with it, the `detail`
   decoration returns `titleHistory: null`. Only the `titlehistory` decoration
   fills `{ lastTimePlayed, visible, canHide }`, and it is also a much smaller
   response.
2. **A stat without a value is treated as an error.** userstats returns the
   `MinutesPlayed` stat without a `value` when the title has no recorded play
   time. `stat["value"].as_str().ok_or("stats-value")?` turns that into an
   error, and when both reads fail the lookup returns `activity-unavailable`.

### Fix

The fix is a new `assets/xodus-activity-history.patch`, applied after the
existing patches:

- the history read uses the `titlehistory` decoration and sends
  `Accept-Language: en-US`;
- a missing or `null` stat value is "no data" instead of an error;
- a unit test covers both the missing and the `null` value.

`last_played()` is unchanged: it already reads
`titles[0].titleHistory.lastTimePlayed` and `visible`.

### Test results

| Title | Time played | Last played | `partial` |
|---|---|---|---|
| Star Trucker | ✓ | ✓ | `false` |
| Minecraft Dungeons | ✓ | ✓ | `false` |
| BALL x PIT (no recorded time yet) | — | — | `false`, no error |

The `-p xodus-cli` suite passes (76 tests).
