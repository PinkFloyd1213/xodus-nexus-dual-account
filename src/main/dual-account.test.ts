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
    expect(status.updateAvailable).toBe(false);
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
      expect((await manager.refresh()).previousAvailable).toBe(true);
      await expect(manager.restorePrevious(() => {})).rejects.toThrow('no longer valid');
      expect(manager.current.previousAvailable).toBe(false);
      expect(manager.current.updating).toBe(false);
      expect(manager.current.binaryPath).toBe(cli);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
