import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppInfo,
  AppSettings,
  Bridge,
  DetectedBrowser,
  InstalledKernel,
  KernelBuild,
  LeakReport,
  Profile,
  ProfileSummary,
  ProxyCheckResult,
  ProxyConfig,
  SessionInfo,
} from '../shared/types';
import {
  allProfiles,
  clearStore,
  countProfiles,
  createProfile,
  deleteProfile,
  duplicateProfile,
  findProfile,
  getSettings,
  rerollFingerprint,
  saveSettings,
  summarise,
  updateProfile,
} from './core/store';
import { detectInstalledBrowsers, downloadKernel, listKernels, removeKernel } from './core/catalog';
import { testDirect, testProxy } from './core/proxy';
import { Paths } from './core/paths';
import { SessionManager } from './core/launcher';
import { buildLeakReport } from './core/leak';

/**
 * The IPC surface.
 *
 * Every handler is wrapped so that a thrown error reaches the renderer as a rejected promise
 * with a readable message. A desktop app that shows "Error: undefined" is worse than one that
 * shows nothing, because the user cannot tell whether to retry or to reinstall.
 */

export interface IpcContext {
  sessions: SessionManager;
  broadcast(channel: string, payload: unknown): void;
}

export function registerIpc(context: IpcContext): void {
  const { sessions, broadcast } = context;

  sessions.events.on('changed', (info: SessionInfo) => {
    broadcast('session:changed', info);
    broadcast('app:changed', { profiles: countProfiles(), running: sessions.list().length });
  });
  sessions.events.on('closed', (profileId: string) => {
    broadcast('session:removed', { profileId });
    broadcast('app:changed', { profiles: countProfiles(), running: sessions.list().length });
  });

  /**
   * Registers one channel. Arguments arrive untyped from the renderer, so the handler signature
   * declares what it expects and the call is narrowed once, here, rather than at every call site.
   */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  // `any` is correct here and only here: the argument list is decided by whichever channel is
  // being registered, and every handler below names its own parameters precisely.
  const handle = <T>(channel: string, fn: (...args: any[]) => Promise<T> | T) => {
    ipcMain.handle(channel, async (_event, ...args: any[]) => {
      try {
        return await fn(...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(message);
      }
    });
  };

  handle<AppInfo>('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    platform: `${process.platform} ${process.arch}`,
    dataDir: Paths.root,
    profileCount: countProfiles(),
    runningCount: sessions.list().length,
  }));

  handle<ProfileSummary[]>('profiles:list', () =>
    allProfiles().map((profile) => summarise(profile, sessions.isRunning(profile.id))),
  );

  handle<Profile | null>('profiles:get', (id: string) => findProfile(id));

  handle<Profile>('profiles:create', (input: Partial<Profile>) => {
    const created = createProfile(input ?? {});
    broadcast('app:changed', { profiles: countProfiles(), running: sessions.list().length });
    return created;
  });

  handle<Profile>('profiles:update', (id: string, patch: Partial<Profile>) => updateProfile(id, patch));

  handle<void>('profiles:delete', async (id: string) => {
    await sessions.stop(id).catch(() => undefined);
    deleteProfile(id);
    broadcast('app:changed', { profiles: countProfiles(), running: sessions.list().length });
  });

  handle<Profile>('profiles:duplicate', (id: string) => duplicateProfile(id));

  handle<Profile>('profiles:reroll', (id: string) => rerollFingerprint(id));

  handle<number>('profiles:clear', async (id: string, scope: 'cache' | 'cookies' | 'siteData' | 'everything') => {
    const profile = findProfile(id);
    if (!profile) throw new Error('That profile no longer exists.');

    const live = sessions.sessionFor(id);
    if (live) {
      if (scope === 'everything') {
        throw new Error('Close the profile before erasing all of its data.');
      }
      const accepted = await live.clearStorage(scope);
      if (!accepted) {
        throw new Error('The browser did not accept the clear request. Close the profile and try again.');
      }
      return 0;
    }

    const dir = path.resolve(Paths.profileData(id));
    const guard = path.resolve(Paths.profiles) + path.sep;
    if (!dir.startsWith(guard)) throw new Error('Refusing to delete a folder outside the profile store.');
    if (!fs.existsSync(dir)) return 0;

    const before = folderSize(dir);
    if (scope === 'everything') {
      fs.rmSync(dir, { recursive: true, force: true });
      return before;
    }

    const targets =
      scope === 'cache'
        ? ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'GrShaderCache', 'ShaderCache', 'Service Worker\\CacheStorage']
        : scope === 'cookies'
          ? ['Network\\Cookies', 'Network\\Cookies-wal', 'Cookies', 'Cookies-wal']
          : [
              'Local Storage',
              'Session Storage',
              'IndexedDB',
              'Service Worker',
              'CacheStorage',
              'Network\\Cookies',
              'Network\\Cookies-wal',
            ];

    let freed = 0;
    for (const root of [path.join(dir, 'Default'), dir]) {
      for (const target of targets) {
        const full = path.join(root, target);
        if (!fs.existsSync(full)) continue;
        freed += folderSize(full);
        fs.rmSync(full, { recursive: true, force: true });
      }
    }
    return freed;
  });

  handle<SessionInfo>('sessions:launch', async (id: string) => {
    const profile = findProfile(id);
    if (!profile) throw new Error('That profile no longer exists.');
    updateProfile(id, { lastOpenedAt: new Date().toISOString(), status: 'active' });
    return sessions.launch(profile);
  });

  handle<void>('sessions:stop', (id: string) => sessions.stop(id));

  handle<SessionInfo[]>('sessions:list', () => sessions.list());

  handle<KernelBuild[]>('kernels:list', () => listKernels());

  handle<InstalledKernel>('kernels:download', async (id: string) => {
    const builds = await listKernels();
    const build = builds.find((b) => b.id === id);
    if (!build) throw new Error('That build is not in the catalog any more.');
    return downloadKernel(build, (received, total) => broadcast('kernel:progress', { id, received, total }));
  });

  handle<void>('kernels:remove', async (id: string) => {
    for (const info of sessions.list()) {
      if (findProfile(info.profileId)?.kernelId === id) {
        throw new Error('A running profile is pinned to that build. Close it first.');
      }
    }
    await removeKernel(id);
  });

  handle<DetectedBrowser[]>('browsers:detect', () => detectInstalledBrowsers());

  handle<ProxyCheckResult>('proxy:check', (config: ProxyConfig, password?: string) =>
    testProxy(config, password),
  );

  handle<ProxyCheckResult>('proxy:checkDirect', () => testDirect());

  handle<string>('profiles:export', async () => {
    const window = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Export profiles',
      defaultPath: 'joe-browser-profiles.json',
      filters: [{ name: 'Joe Browser profiles', extensions: ['json'] }],
    };
    // The two-argument overload treats its first argument as the parent window; passing
    // undefined to it is not the same as asking for a parent-less dialog.
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return '';

    // Passwords are exported as ciphertext: the file is a backup of this machine's store, not a
    // portable credential, and moving it to another PC must not hand over proxy accounts.
    const payload = {
      format: 'joe-browser-profiles',
      version: 2,
      exportedAt: new Date().toISOString(),
      profiles: allProfiles(),
    };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return result.filePath;
  });

  handle<number>('profiles:import', async () => {
    const window = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Import profiles',
      properties: ['openFile' as const],
      filters: [{ name: 'Joe Browser profiles', extensions: ['json'] }],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return 0;

    const file = result.filePaths[0]!;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { profiles?: unknown[] };
    const incoming = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    let imported = 0;

    for (const entry of incoming) {
      const profile = entry as Partial<Profile>;
      if (!profile || typeof profile.name !== 'string') continue;
      createProfile({
        ...profile,
        // A fresh id on import: two exported copies of the same profile must both be usable.
        id: undefined as unknown as string,
        // ...but the identity travels with it. Re-rolling on import would hand the user a
        // different machine from the one their accounts were created on.
        preserveFingerprint: true,
      });
      imported++;
    }

    broadcast('app:changed', { profiles: countProfiles(), running: sessions.list().length });
    return imported;
  });

  handle<LeakReport>('leak:run', (id: string) => {
    const profile = findProfile(id);
    if (!profile) throw new Error('That profile no longer exists.');
    return buildLeakReport(profile);
  });

  handle<AppSettings>('settings:get', () => getSettings());

  handle<AppSettings>('settings:save', (patch: Partial<AppSettings>) => saveSettings(patch));

  handle<void>('app:reset', async () => {
    await sessions.stopAll();
    clearStore();
  });

  handle<void>('shell:openDataDir', async () => {
    const { shell } = await import('electron');
    await shell.openPath(Paths.root);
  });
}

function folderSize(target: string): number {
  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return stat.size;
    let total = 0;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      total += folderSize(path.join(target, entry.name));
    }
    return total;
  } catch {
    return 0;
  }
}

/** The shape `preload` exposes. Kept here so the renderer's mock has the same keys. */
export type BridgeMethods = Bridge;
