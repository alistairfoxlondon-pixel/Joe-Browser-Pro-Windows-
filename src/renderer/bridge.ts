import type { Bridge, Profile, ProfileSummary } from '../shared/types';

/**
 * The renderer's only door to the machine.
 *
 * In Electron this is the preload bridge. In a plain browser (the UI preview used for design
 * work) there is no `window.joe`, so a mock takes over with sample data. The mock implements
 * the same interface, which is how the interface stays honest: anything the real app cannot do
 * is visible as a stub here rather than discovered after packaging.
 */

declare global {
  interface Window {
    joe?: Bridge;
    joeEvents?: {
      on(channel: string, listener: (payload: unknown) => void): () => void;
    };
  }
}

export const isDesktop = Boolean(window.joe);

export function bridge(): Bridge {
  return window.joe ?? mockBridge;
}

export function onEvent(channel: string, listener: (payload: unknown) => void): () => void {
  if (window.joeEvents) return window.joeEvents.on(channel, listener);
  mockEvents[channel] = mockEvents[channel] ?? new Set();
  mockEvents[channel]!.add(listener);
  return () => mockEvents[channel]?.delete(listener);
}

const mockEvents: Record<string, Set<(payload: unknown) => void>> = {};

function emit(channel: string, payload: unknown): void {
  for (const listener of mockEvents[channel] ?? []) listener(payload);
}

/* ------------------------------------------------------------------ mock data */

const SAMPLE_FINGERPRINTS = [
  { os: 'Windows 11' as const, screen: '1920x1080', tz: 'Europe/London', gpu: 'RTX 3060', cores: 8 },
  { os: 'Windows 10' as const, screen: '1366x768', tz: 'America/New_York', gpu: 'UHD 620', cores: 4 },
  { os: 'macOS 15' as const, screen: '2560x1440', tz: 'America/Los_Angeles', gpu: 'Apple M2', cores: 8 },
  { os: 'Windows 11' as const, screen: '2560x1440', tz: 'Asia/Dhaka', gpu: 'GTX 1650', cores: 6 },
];

const sampleNames = ['Shop UK', 'Shop US', 'Ads Manager', 'Client - Berlin', 'Outreach', 'QA build'];

const mockProfiles: Profile[] = sampleNames.map((name, index) => {
  const fp = SAMPLE_FINGERPRINTS[index % SAMPLE_FINGERPRINTS.length]!;
  return {
    id: `mock-${index}`,
    name,
    group: index < 3 ? 'E-commerce' : 'Marketing',
    tags: index % 2 === 0 ? ['fb', 'ads'] : ['google'],
    notes: '',
    status: 'idle',
    startUrl: 'about:blank',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastOpenedAt: index === 0 ? new Date().toISOString() : '',
    engine: index === 2 ? 'firefox' : 'chrome',
    kernelId: '',
    browserVersion: '157.0.8103.41',
    proxy: {
      type: index % 3 === 0 ? 'socks5' : index % 3 === 1 ? 'http' : 'none',
      host: `185.21.${index}.14`,
      port: 8000 + index,
      user: 'user',
      passwordEnc: '',
      lastIp: `185.21.${index}.14`,
      lastCountry: fp.tz.includes('London') ? 'United Kingdom' : 'United States',
      lastCountryCode: fp.tz.includes('London') ? 'GB' : 'US',
      lastTimezone: fp.tz,
      lastCity: 'London',
      fallbackDirect: true,
    },
    tools: {
      humanPaste: true,
      humanPasteSpeed: 'natural',
      proxyWatch: true,
      proxyWatchInterval: 60,
      enableRightClick: true,
      unlockSelection: true,
      customExtensions: '',
    },
    fingerprint: {
      seed: 1000 + index,
      os: fp.os,
      deviceType: 'desktop',
      timezone: fp.tz,
      language: 'en-GB',
      acceptLanguage: 'en-GB,en;q=0.9',
      screenW: Number(fp.screen.split('x')[0]),
      screenH: Number(fp.screen.split('x')[1]),
      availW: Number(fp.screen.split('x')[0]),
      availH: Number(fp.screen.split('x')[1]) - 40,
      colorDepth: 24,
      pixelRatio: 1,
      webGlVendor: 'Google Inc. (NVIDIA)',
      webGlRenderer: `ANGLE (NVIDIA, NVIDIA GeForce ${fp.gpu} Direct3D11 vs_5_0 ps_5_0, D3D11)`,
      cores: fp.cores,
      memory: 8,
      touchPoints: 0,
      canvasNoise: true,
      audioNoise: true,
      fontsNoise: true,
      doNotTrack: false,
      spoofBattery: true,
      spoofMac: false,
      webRtcProtect: true,
      webRtcMode: 'proxy',
      geoMode: 'proxy',
      geoLat: '',
      geoLng: '',
      autoMatchProxy: true,
      autoUserAgent: true,
      androidVersion: 'auto',
      iosVersion: 'auto',
      fontSet: 'windows',
      hardwareNoise: true,
      userAgent: '',
      platform: 'Win32',
      brand: 'Google Chrome',
      userAgentOverride: '',
      browserVersion: '157.0.8103.41',
    },
    flags: {},
  };
});

const running = new Set<string>();

function summarise(profile: Profile): ProfileSummary {
  const accents = ['#4f8cff', '#7c5cff', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];
  const accent = accents[profile.name.length % accents.length]!;
  return {
    id: profile.id,
    name: profile.name,
    group: profile.group,
    tags: profile.tags,
    status: profile.status,
    engine: profile.engine,
    browserVersion: profile.browserVersion,
    proxyLabel: profile.proxy.type === 'none' ? 'Direct' : `Proxy ${profile.proxy.lastCountryCode}`,
    proxyDetail:
      profile.proxy.type === 'none'
        ? 'No proxy'
        : `${profile.proxy.type.toUpperCase()} ${profile.proxy.host}:${profile.proxy.port}`,
    lastOpenedAt: profile.lastOpenedAt,
    running: running.has(profile.id),
    os: profile.fingerprint.os,
    colors: { accent, tint: `${accent}22` },
  };
}

const settings = {
  theme: 'dark' as 'dark' | 'light',
  language: 'en',
  defaultEngine: 'chrome',
  defaultKernelId: '',
  startPage: 'about:blank',
  extensionsEnabled: true,
  cacheDir: '',
  clearCacheOnExit: false,
};

export const mockBridge: Bridge = {
  async getAppInfo() {
    return {
      version: '2.0.0',
      electron: '33.3.1',
      chrome: '130.0.6723.152',
      platform: 'win32 x64',
      dataDir: '%APPDATA%\\JoeBrowser',
      profileCount: mockProfiles.length,
      runningCount: running.size,
    };
  },

  async listProfiles() {
    return mockProfiles.map(summarise);
  },
  async getProfile(id) {
    return mockProfiles.find((p) => p.id === id) ?? null;
  },
  async createProfile(input) {
    const created: Profile = {
      ...mockProfiles[0]!,
      ...(input as Profile),
      id: `mock-${mockProfiles.length}`,
      name: input.name ?? 'New profile',
      createdAt: new Date().toISOString(),
    };
    mockProfiles.push(created);
    return created;
  },
  async updateProfile(id, patch) {
    const index = mockProfiles.findIndex((p) => p.id === id);
    if (index < 0) throw new Error('That profile no longer exists.');
    mockProfiles[index] = { ...mockProfiles[index]!, ...patch };
    return mockProfiles[index]!;
  },
  async deleteProfile(id) {
    const index = mockProfiles.findIndex((p) => p.id === id);
    if (index >= 0) mockProfiles.splice(index, 1);
  },
  async duplicateProfile(id) {
    const source = mockProfiles.find((p) => p.id === id)!;
    const copy = { ...source, id: `mock-${mockProfiles.length}`, name: `${source.name} copy` };
    mockProfiles.push(copy);
    return copy;
  },
  async rerollFingerprint(id) {
    const index = mockProfiles.findIndex((p) => p.id === id);
    const profile = mockProfiles[index]!;
    mockProfiles[index] = {
      ...profile,
      fingerprint: { ...profile.fingerprint, seed: Date.now() % 100000 },
    };
    return mockProfiles[index]!;
  },
  async clearProfileData() {
    return 148_000_000;
  },

  async launchProfile(id) {
    running.add(id);
    const profile = mockProfiles.find((p) => p.id === id)!;
    const info = {
      profileId: id,
      profileName: profile.name,
      state: 'running' as const,
      debugPort: 9222,
      pid: 4242,
      engine: profile.engine,
      browserVersion: profile.browserVersion,
      startedAt: new Date().toISOString(),
      exitIp: profile.proxy.lastIp,
      lastError: '',
    };
    emit('session:changed', info);
    return info;
  },
  async stopProfile(id) {
    running.delete(id);
    emit('session:removed', { profileId: id });
  },
  async listSessions() {
    return [];
  },

  async listKernels() {
    const engines = [
      { engine: 'chrome', label: 'Google Chrome' },
      { engine: 'chromium', label: 'Chromium' },
      { engine: 'firefox', label: 'Firefox' },
    ];
    const builds = [];
    let counter = 0;
    for (const { engine } of engines) {
      for (let major = 157; major >= 150; major--) {
        counter++;
        builds.push({
          id: `${engine}-${major}.0.8103.41-stable`,
          engine,
          channel: major === 157 ? 'stable' : 'stable',
          version: `${major}.0.8103.41`,
          os: 'win64',
          downloadUrl: 'https://example.invalid/browser.zip',
          installed: counter <= 2,
          path: counter <= 2 ? `C:\\Users\\you\\AppData\\Roaming\\JoeBrowser\\kernels\\${engine}-${major}` : '',
          sizeBytes: counter <= 2 ? 421_000_000 : 0,
        });
      }
    }
    return builds;
  },
  async downloadKernel(id) {
    for (let step = 0; step <= 100; step += 10) {
      emit('kernel:progress', { id, received: step, total: 100 });
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    return {
      id,
      engine: 'chrome',
      version: id.split('-')[1] ?? '',
      path: 'C:\\mock',
      exePath: 'C:\\mock\\chrome.exe',
      installedAt: new Date().toISOString(),
    };
  },
  async removeKernel() {},
  async detectInstalledBrowsers() {
    return [
      { engine: 'chrome', name: 'Google Chrome', version: '157.0.8103.41', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
      { engine: 'edge', name: 'Microsoft Edge', version: '157.0.3400.12', path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
    ];
  },

  async checkProxy() {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return {
      ok: true,
      ip: '185.21.4.14',
      country: 'United Kingdom',
      countryCode: 'GB',
      city: 'London',
      timezone: 'Europe/London',
      latencyMs: 92,
      error: '',
    };
  },
  async exportProfiles() {
    return 'C:\\Users\\you\\joe-browser-profiles.json';
  },
  async importProfiles() {
    return 0;
  },

  async runLeakCheck(id) {
    const profile = mockProfiles.find((p) => p.id === id)!;
    const fp = profile.fingerprint;
    const surfaces = [
      ['User agent', profile.engine, profile.engine],
      ['Platform', fp.platform, fp.platform],
      ['Screen', `${fp.screenW}x${fp.screenH}`, `${fp.screenW}x${fp.screenH}`],
      ['Time zone', fp.timezone, fp.timezone],
      ['Language', fp.acceptLanguage, fp.language],
      ['Canvas', 'noise applied', 'noise applied'],
      ['WebGL renderer', fp.webGlRenderer, fp.webGlRenderer],
      ['WebRTC', fp.webRtcMode, fp.webRtcMode],
    ].map(([name, claim, observed]) => ({
      name: name!,
      claim: claim!,
      observed: observed!,
      ok: true,
      note: '',
    }));
    return { profileId: id, score: 100, surfaces, checkedAt: new Date().toISOString() };
  },

  async openInProfile() {
    throw new Error('Preview only: opening a checker site needs the real browser.');
  },

  async listExtensions() {
    return {
      masterEnabled: true,
      firstParty: [
        {
          id: 'joe-paste-as-human',
          name: 'Joe Paste as Human',
          description: 'Types clipboard text character by character with human timing.',
          enabled: true,
        },
        {
          id: 'joe-right-click',
          name: 'Joe Right Click and Copy',
          description: 'Restores the context menu, selection and copy on pages that block them.',
          enabled: true,
        },
        {
          id: 'joe-tracker-plus',
          name: 'Joe Request Tracker',
          description: 'Counts requests and third-party trackers and shows a badge on the page.',
          enabled: true,
        },
      ],
      custom: [],
    };
  },

  async listHistory() {
    const now = Date.now();
    return [
      { profileId: 'mock-0', at: new Date(now - 60000).toISOString(), url: 'https://example.com/', title: 'Example Domain', how: 'link' },
      { profileId: 'mock-0', at: new Date(now - 120000).toISOString(), url: 'https://example.com/account', title: 'Account', how: 'link' },
      { profileId: 'mock-0', at: new Date(now - 300000).toISOString(), url: 'https://example.com/login', title: 'Sign in', how: 'typed' },
    ];
  },

  async clearHistory() {
    return 2048;
  },

  async applyProxyToSession() {
    return true;
  },

  async getStoreStats() {
    return {
      dataDir: '%APPDATA%\\JoeBrowser',
      storeBytes: 1_920_000_000,
      profilesBytes: 1_480_000_000,
      kernelsBytes: 420_000_000,
      historyBytes: 20_000,
    };
  },

  async getSettings() {
    return { ...settings };
  },
  async saveSettings(patch) {
    Object.assign(settings, patch);
    if (patch.theme) document.documentElement.dataset['theme'] = patch.theme;
    return { ...settings };
  },
  async resetEverything() {
    mockProfiles.length = 0;
  },
};
