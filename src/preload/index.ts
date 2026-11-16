import { contextBridge, ipcRenderer } from 'electron';

/**
 * The preload bridge.
 *
 * Exactly the handful of calls the UI is allowed to make, and nothing else. `ipcRenderer` is not
 * exposed: a renderer that can invoke arbitrary channels is a renderer that can delete the
 * profile store by typo.
 */

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const bridge = {
  getAppInfo: () => invoke('app:info'),

  listProfiles: () => invoke('profiles:list'),
  getProfile: (id: string) => invoke('profiles:get', id),
  createProfile: (input: unknown) => invoke('profiles:create', input),
  updateProfile: (id: string, patch: unknown) => invoke('profiles:update', id, patch),
  deleteProfile: (id: string) => invoke('profiles:delete', id),
  duplicateProfile: (id: string) => invoke('profiles:duplicate', id),
  rerollFingerprint: (id: string) => invoke('profiles:reroll', id),
  clearProfileData: (id: string, scope: string) => invoke('profiles:clear', id, scope),

  launchProfile: (id: string) => invoke('sessions:launch', id),
  stopProfile: (id: string) => invoke('sessions:stop', id),
  listSessions: () => invoke('sessions:list'),

  listKernels: () => invoke('kernels:list'),
  downloadKernel: (id: string) => invoke('kernels:download', id),
  removeKernel: (id: string) => invoke('kernels:remove', id),
  detectInstalledBrowsers: () => invoke('browsers:detect'),

  checkProxy: (config: unknown, password?: string) => invoke('proxy:check', config, password),
  exportProfiles: () => invoke('profiles:export'),
  importProfiles: () => invoke('profiles:import'),

  runLeakCheck: (id: string) => invoke('leak:run', id),

  getSettings: () => invoke('settings:get'),
  saveSettings: (patch: unknown) => invoke('settings:save', patch),

  resetEverything: () => invoke('app:reset'),
  openDataDir: () => invoke('shell:openDataDir'),
};

const events = {
  on(channel: string, listener: (payload: unknown) => void): () => void {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('joe', bridge);
contextBridge.exposeInMainWorld('joeEvents', events);
