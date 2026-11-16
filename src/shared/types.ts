/**
 * The contract between the main process and the renderer.
 *
 * Everything the UI can ask for is declared on `Bridge`, and everything it can be told is on
 * `MainEvents`. The renderer never imports Node; it only ever sees this file.
 */

export type ProxyType = 'none' | 'http' | 'https' | 'socks5';

export type DeviceType = 'desktop' | 'mobile' | 'tablet';

export type DesktopOs =
  | 'Windows 11'
  | 'Windows 10'
  | 'macOS 15'
  | 'macOS 14'
  | 'Linux';

export type GeoMode = 'proxy' | 'system' | 'custom' | 'block';

export interface ProxyConfig {
  type: ProxyType;
  host: string;
  port: number;
  user: string;
  /** Never persisted in the clear; the store keeps only `passwordEnc`. */
  password?: string;
  passwordEnc: string;
  lastIp: string;
  lastCountry: string;
  lastCountryCode: string;
  lastTimezone: string;
  lastCity: string;
  /** Keep the session alive on a direct connection when the proxy stops answering. */
  fallbackDirect: boolean;
}

export interface ToolConfig {
  humanPaste: boolean;
  /** relaxed | natural | fast | instant */
  humanPasteSpeed: string;
  proxyWatch: boolean;
  proxyWatchInterval: number;
  enableRightClick: boolean;
  unlockSelection: boolean;
  /** One absolute path per line. */
  customExtensions: string;
}

export interface FingerprintConfig {
  seed: number;
  os: DesktopOs;
  deviceType: DeviceType;
  /** IANA name, e.g. Europe/London. */
  timezone: string;
  language: string;
  acceptLanguage: string;
  screenW: number;
  screenH: number;
  availW: number;
  availH: number;
  colorDepth: number;
  pixelRatio: number;
  webGlVendor: string;
  webGlRenderer: string;
  cores: number;
  memory: number;
  touchPoints: number;
  canvasNoise: boolean;
  audioNoise: boolean;
  fontsNoise: boolean;
  doNotTrack: boolean;
  spoofBattery: boolean;
  spoofMac: boolean;
  webRtcProtect: boolean;
  /** off | proxy | public */
  webRtcMode: string;
  geoMode: GeoMode;
  geoLat: string;
  geoLng: string;
  autoMatchProxy: boolean;
  autoUserAgent: boolean;
  androidVersion: string;
  iosVersion: string;
  /** auto | windows | macos | linux | minimal */
  fontSet: string;
  hardwareNoise: boolean;
  /** Filled in at launch; not persisted. */
  userAgent: string;
  platform: string;
  brand: string;
  userAgentOverride: string;
  browserVersion: string;
}

export interface Profile {
  id: string;
  name: string;
  group: string;
  tags: string[];
  notes: string;
  /** idle | active | archived */
  status: string;
  startUrl: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  /** Engine key, e.g. chromium | chrome | brave | edge | firefox | custom */
  engine: string;
  /** Folder name inside the kernels directory, or '' to follow the app default. */
  kernelId: string;
  /** Full version the profile claims, e.g. 157.0.8103.41 */
  browserVersion: string;
  proxy: ProxyConfig;
  tools: ToolConfig;
  fingerprint: FingerprintConfig;
  /** Per-profile clipboard-paste marker so Firefox and Chromium do not double-type. */
  flags: Record<string, boolean>;
}

export interface ProfileSummary {
  id: string;
  name: string;
  group: string;
  tags: string[];
  status: string;
  engine: string;
  browserVersion: string;
  proxyLabel: string;
  proxyDetail: string;
  lastOpenedAt: string;
  running: boolean;
  os: DesktopOs;
  colors: { accent: string; tint: string };
}

export interface KernelBuild {
  /** Stable identity: engine + version + channel. */
  id: string;
  engine: string;
  channel: string;
  version: string;
  /** 'Microsoft Windows' etc, shown on the card. */
  os: string;
  downloadUrl: string;
  installed: boolean;
  /** Populated once installed. */
  path: string;
  sizeBytes: number;
}

export interface InstalledKernel {
  id: string;
  engine: string;
  version: string;
  path: string;
  exePath: string;
  installedAt: string;
}

export interface DetectedBrowser {
  engine: string;
  name: string;
  version: string;
  path: string;
}

export type LaunchState = 'starting' | 'running' | 'closing' | 'stopped' | 'failed';

export interface SessionInfo {
  profileId: string;
  profileName: string;
  state: LaunchState;
  debugPort: number;
  pid: number;
  engine: string;
  browserVersion: string;
  startedAt: string;
  exitIp: string;
  lastError: string;
}

export interface ProxyCheckResult {
  ok: boolean;
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  timezone: string;
  latencyMs: number;
  error: string;
}

export interface LeakSurface {
  name: string;
  claim: string;
  observed: string;
  ok: boolean;
  note: string;
}

export interface LeakReport {
  profileId: string;
  score: number;
  surfaces: LeakSurface[];
  checkedAt: string;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  language: string;
  defaultEngine: string;
  defaultKernelId: string;
  startPage: string;
  extensionsEnabled: boolean;
  cacheDir: string;
  clearCacheOnExit: boolean;
}

export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  platform: string;
  dataDir: string;
  profileCount: number;
  runningCount: number;
}

export interface ExtensionReport {
  masterEnabled: boolean;
  firstParty: { id: string; name: string; description: string; enabled: boolean }[];
  custom: { id: string; name: string; description: string; enabled: boolean }[];
}

export interface HistoryEntry {
  profileId: string;
  at: string;
  url: string;
  title: string;
  how: string;
}

export interface StoreStats {
  dataDir: string;
  storeBytes: number;
  profilesBytes: number;
  kernelsBytes: number;
  historyBytes: number;
}

export interface ToastPayload {
  kind: 'info' | 'success' | 'warn' | 'error';
  message: string;
  detail: string;
}

/** Everything the UI may call. Implemented twice: over IPC, and as a browser mock. */
export interface Bridge {
  getAppInfo(): Promise<AppInfo>;

  listProfiles(): Promise<ProfileSummary[]>;
  getProfile(id: string): Promise<Profile | null>;
  createProfile(input: Partial<Profile>): Promise<Profile>;
  updateProfile(id: string, patch: Partial<Profile>): Promise<Profile>;
  deleteProfile(id: string): Promise<void>;
  duplicateProfile(id: string): Promise<Profile>;
  rerollFingerprint(id: string): Promise<Profile>;
  clearProfileData(id: string, scope: 'cache' | 'cookies' | 'siteData' | 'everything'): Promise<number>;

  launchProfile(id: string): Promise<SessionInfo>;
  stopProfile(id: string): Promise<void>;
  listSessions(): Promise<SessionInfo[]>;

  listKernels(): Promise<KernelBuild[]>;
  downloadKernel(id: string): Promise<InstalledKernel>;
  removeKernel(id: string): Promise<void>;
  detectInstalledBrowsers(): Promise<DetectedBrowser[]>;

  checkProxy(config: ProxyConfig, password?: string): Promise<ProxyCheckResult>;
  exportProfiles(): Promise<string>;
  importProfiles(): Promise<number>;

  runLeakCheck(id: string): Promise<LeakReport>;
  /** Opens a checker site inside the profile, so it sees the fingerprint under test. */
  openInProfile(id: string, url: string): Promise<void>;

  listExtensions(id: string): Promise<ExtensionReport>;

  listHistory(id: string, limit?: number): Promise<HistoryEntry[]>;
  clearHistory(id: string): Promise<number>;

  /** Re-point a running profile at its stored proxy. False when the session opened directly. */
  applyProxyToSession(id: string): Promise<boolean>;

  getStoreStats(): Promise<StoreStats>;

  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;

  resetEverything(): Promise<void>;

  /** Opens the profile store in the OS file manager. Optional in the browser mock. */
  openDataDir?(): Promise<void>;
}

/** Everything the main process may push. */
export interface MainEvents {
  'session:changed': SessionInfo;
  'session:removed': { profileId: string };
  'kernel:progress': { id: string; received: number; total: number };
  toast: ToastPayload;
  'app:changed': { profiles: number; running: number };
}

/** The fingerprint checkers, opened inside the profile's own session. */
export const CHECK_SITES = [
  { name: 'iphey', url: 'https://iphey.com/' },
  { name: 'pixelscan', url: 'https://pixelscan.net/' },
  { name: 'browserscan', url: 'https://www.browserscan.net/' },
  { name: 'ipfighter', url: 'https://ipfighter.com/' },
  { name: 'whoer.net', url: 'https://whoer.net/' },
  { name: 'whoer.com', url: 'https://whoer.com/' },
] as const;

export const PROXY_TYPES: ProxyType[] = ['none', 'http', 'https', 'socks5'];
export const DESKTOP_OSES: DesktopOs[] = ['Windows 11', 'Windows 10', 'macOS 15', 'macOS 14', 'Linux'];
export const CHANNELS = ['stable', 'beta', 'dev', 'canary'] as const;
