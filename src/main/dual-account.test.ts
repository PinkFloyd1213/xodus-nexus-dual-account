import { describe, expect, it, vi } from 'vitest';
import { BackendManager, DUAL_ACCOUNT_BACKEND } from './backend';
import { backendLock } from './backend-package';
import { GameAchievementsReader } from './game-achievements';
import { GameActivities } from './game-activity';

describe('dual-account launcher', () => {
  it('pins the dual-account patch last without changing the launch contract', () => {
    expect(DUAL_ACCOUNT_BACKEND).toBe(true);
    expect(backendLock.patches.at(-1)?.file).toBe('xodus-dual-account.patch');
    expect(backendLock.compatibility).toBe('linux-run-v22');
  });

  it('never installs or offers a prebuilt backend that lacks dual-account support', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const manager = new BackendManager('/unused', '', () => {}, () => false, fetcher);
    expect(manager.current.dualAccountBuild).toBe(true);
    const status = await manager.checkUpdate();
    expect(status.releaseAvailable).toBe(false);
    // No dual-account backend yet: a source build is the pending update.
    expect(status.updateAvailable).toBe(true);
    expect(status.blockReason).toContain('Use dual-account backend');
    await expect(manager.update(() => {})).rejects.toThrow('dual-account');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reads Xbox data for the in-game account only when selected', async () => {
    const payload = (titleId: string) => JSON.stringify({ schema: 1, account: 'play@test', titleId, partial: false, items: [], minutesPlayed: 3, lastPlayed: null });
    const achievements = vi.fn(async (_binary: string, titleId: string) => payload(titleId));
    const reader = new GameAchievementsReader(achievements);
    reader.select('play@test', '/backend', true);
    await reader.get('42');
    expect(achievements.mock.calls[0][3]).toBe(true);
    reader.select('play@test', '/backend', false);
    await reader.get('42');
    expect(achievements.mock.calls[1][3]).toBe(false);

    const activity = vi.fn(async (_binary: string, titleId: string) => payload(titleId));
    const activities = new GameActivities(activity);
    activities.select('play@test', '/backend', true);
    expect((await activities.get('42')).status).toBe('available');
    expect(activity.mock.calls[0][3]).toBe(true);
  });
});

describe('service account role log', () => {
  it('keeps only allowlisted request, role and fallback values', async () => {
    const { serviceAccountRole } = await import('./xodus-service');
    const ansi = '\u001b[2m2026-10-22T10:00:00.000000Z\u001b[0m \u001b[32m INFO\u001b[0m \u001b[2mxodus_service::connection::xml\u001b[0m\u001b[2m:\u001b[0m Issuing credentials \u001b[3mrequest\u001b[0m\u001b[2m=\u001b[0mMsaTokenRequest \u001b[3mrole\u001b[0m\u001b[2m=\u001b[0m"play" \u001b[3mfallback\u001b[0m\u001b[2m=\u001b[0mfalse';
    expect(serviceAccountRole(ansi)).toBe('Xodus account for MsaTokenRequest: play');
    expect(serviceAccountRole('INFO x: Issuing credentials request=StoreLicenseTokenRequest role="store" fallback=false')).toBe('Xodus account for StoreLicenseTokenRequest: store');
    expect(serviceAccountRole('INFO x: Issuing credentials request=MsaTokenRequest role="store" fallback=true')).toContain('using the license account');
    for (const line of ['ERROR x: Failed parsing message: secret', 'Issuing credentials request=Other role="play" fallback=false', 'Issuing credentials request=MsaTokenRequest role="admin" fallback=false']) {
      expect(serviceAccountRole(line)).toBeUndefined();
    }
  });
});

describe('previous backend restore', () => {
  it('drops an invalid previous pointer instead of offering a broken restore', async () => {
    const { promises: fs } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dual-restore-test-'));
    try {
      const backends = path.join(root, 'xodus-backends');
      await fs.mkdir(backends, { recursive: true });
      const cli = path.join(root, 'xodus-cli');
      await fs.writeFile(cli, '#!/bin/sh\nprintf "Commands:\\n  login      Sign in\\n  streaming      Download\\n"\n', { mode: 0o755 });
      await fs.writeFile(path.join(backends, 'current.json'), JSON.stringify({ commit: 'c', binaryPath: cli, builtAt: 'now' }));
      await fs.writeFile(path.join(backends, 'previous.json'), JSON.stringify({ commit: 'p', binaryPath: path.join(root, 'missing'), builtAt: 'now' }));
      const manager = new BackendManager(root, '', () => {}, () => false, vi.fn() as unknown as typeof fetch);
      // Independent of downloads running on the host.
      vi.spyOn(manager, 'externalDownloadRunning').mockResolvedValue(false);
      expect((await manager.refresh()).previousAvailable).toBe(true);
      await expect(manager.restorePrevious(() => {})).rejects.toThrow('no longer valid');
      expect(manager.current.previousAvailable).toBe(false);
      expect(manager.current.updating).toBe(false);
      expect(manager.current.binaryPath).toBe(cli);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});

describe('license account profile', () => {
  it('keeps the license and in-game profiles in separate caches', async () => {
    const { promises: fs } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { AccountProfile } = await import('./account-profile');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dual-profile-test-'));
    try {
      const reader = (gamertag: string, account: string) => vi.fn(async () => JSON.stringify({ schema: 1, account, gamertag }));
      const playReader = reader('Player', 'play@test');
      const licenseReader = reader('Store', 'store@test');
      const play = new AccountProfile(root, () => {}, value => value, playReader);
      const license = new AccountProfile(root, () => {}, value => value, licenseReader, 'xbox-profile-license.json');
      await play.select('play@test', '/backend', true, true); await play.settled();
      await license.select('store@test', '/backend', true); await license.settled();
      expect(play.value?.gamertag).toBe('Player');
      expect(license.value?.gamertag).toBe('Store');
      expect(playReader.mock.calls[0][2]).toBe(true);
      expect(licenseReader.mock.calls[0][2]).toBe(false);
      expect((await fs.readdir(root)).sort()).toEqual(['xbox-profile-license.json', 'xbox-profile.json']);
      await license.select(undefined); await license.settled();
      expect(await fs.readdir(root)).toEqual(['xbox-profile.json']);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});

describe('fork releases and backend updates', () => {
  it('offers dual-account launcher releases newer than the running build', async () => {
    const { launcherCandidate, LAUNCHER_REPOSITORY } = await import('./launcher-update');
    const release = (version: string) => {
      const name = `Xodus-Nexus-${version}-x86_64.AppImage`;
      const url = (file: string) => `https://github.com/${LAUNCHER_REPOSITORY}/releases/download/v${version}/${file}`;
      return { tag_name: `v${version}`, draft: false, prerelease: false, assets: [
        { name, size: 100, browser_download_url: url(name) },
        { name: `${name}.sha512sum`, size: 200, browser_download_url: url(`${name}.sha512sum`) },
      ] };
    };
    expect(launcherCandidate([release('0.3.10-dual.5')], '0.3.10')?.version).toBe('0.3.10-dual.5');
    expect(launcherCandidate([release('0.3.10-dual.5')], '0.3.10-dual.6')).toBeUndefined();
    expect(launcherCandidate([release('0.3.10-dual.5'), release('0.3.11-dual.7')], '0.3.10-dual.5')?.version).toBe('0.3.11-dual.7');
  });

  it('flags a source build from an older recipe as outdated', async () => {
    const { promises: fs } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { backendRecipeSha256 } = await import('./backend-package');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dual-outdated-test-'));
    try {
      const backends = path.join(root, 'xodus-backends');
      await fs.mkdir(backends, { recursive: true });
      const cli = path.join(root, 'xodus-cli');
      await fs.writeFile(cli, '#!/bin/sh\nprintf "Commands:\\n  login      Sign in\\n  streaming      Download\\n      --account <ACCOUNT>\\n"\n', { mode: 0o755 });
      const pointer = (recipeSha256: string) => fs.writeFile(path.join(backends, 'current.json'), JSON.stringify({ commit: 'c', binaryPath: cli, builtAt: 'now', recipeSha256 }));
      const manager = new BackendManager(root, '', () => {}, () => false, vi.fn() as unknown as typeof fetch);
      await pointer('older-recipe');
      await manager.refresh();
      expect(manager.current.capabilities.dualAccount).toBe(true);
      expect((await manager.checkUpdate()).updateAvailable).toBe(true);
      await pointer(backendRecipeSha256);
      await manager.refresh();
      expect((await manager.checkUpdate()).updateAvailable).toBe(false);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});

describe('launcher restart after an update', () => {
  it('starts the new AppImage from a detached shell after this process exits', async () => {
    const { relaunchAfterExit } = await import('./launcher-update');
    const unref = vi.fn();
    const start = vi.fn(() => ({ unref })) as unknown as typeof import('node:child_process').spawn;
    relaunchAfterExit('/apps/Xodus Nexus.AppImage', 4242, start);
    const [command, args, options] = (start as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(command).toBe('/bin/sh');
    expect(args).toEqual(['-c', 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec "$0"', '/apps/Xodus Nexus.AppImage', '4242']);
    expect(options).toMatchObject({ detached: true, stdio: 'ignore' });
    expect(unref).toHaveBeenCalled();
  });
});

describe('GitHub rate limit message', () => {
  it('explains an exhausted anonymous quota instead of a bare 403', async () => {
    const { githubFailure } = await import('./launcher-update');
    const limited = { status: 403, headers: new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' }) };
    expect(githubFailure(limited)).toMatch(/hourly limit .* Try again after /);
    expect(githubFailure({ status: 403, headers: new Headers() })).toBe('GitHub update check returned HTTP 403.');
    expect(githubFailure({ status: 500, headers: new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' }) })).toBe('GitHub update check returned HTTP 500.');
  });
});
