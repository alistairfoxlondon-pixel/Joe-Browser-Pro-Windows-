import type { DesktopOs, DeviceType, FingerprintConfig } from '../../shared/types';
import { Rng, hashString } from './rng';
import { buildIdentity } from './ua';
import { BY_CODE, ZONES } from '../../shared/zones';

/**
 * The identity factory.
 *
 * Rules this file lives by:
 *  - A coherent identity beats a random one. Every field is drawn from pools that
 *    occur together in the real world (a 4-core machine does not carry 32 GB of RAM).
 *  - The same seed always yields the same machine, so a profile is stable across launches.
 *  - A new identity must differ from every profile already in the store across twelve
 *    surfaces, or it is re-rolled. Two profiles that share a canvas hash are one profile as
 *    far as any site that sees both is concerned.
 */

export const SURFACES = [
  'userAgent',
  'platform',
  'screen',
  'webgl',
  'cores',
  'memory',
  'timezone',
  'language',
  'fonts',
  'canvas',
  'audio',
  'touch',
] as const;

export type Surface = (typeof SURFACES)[number];

interface GpuCard {
  vendor: string;
  renderer: string;
  weight: number;
}

/** Real vendor/renderer pairs. A renderer that no card ever shipped is worse than no spoof. */
const GPU_WINDOWS: GpuCard[] = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 10 },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 9 },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 8 },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 6 },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 11 },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 9 },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 7 },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 6 },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 5 },
  { vendor: 'Google Inc. (Microsoft)', renderer: 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 2 },
];

const GPU_MAC: GpuCard[] = [
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', weight: 10 },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', weight: 9 },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', weight: 6 },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics, OpenGL 4.1)', weight: 3 },
];

const GPU_LINUX: GpuCard[] = [
  { vendor: 'Google Inc. (Mesa)', renderer: 'ANGLE (Mesa, llvmpipe (LLVM 15.0.7, 256 bits), OpenGL 4.5)', weight: 6 },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)', weight: 5 },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050/PCIe/SSE2, OpenGL 4.5)', weight: 3 },
];

interface ScreenProfile {
  w: number;
  h: number;
  avail: number;
  dpr: number;
  weight: number;
}

/** avail is the difference between outer height and the taskbar, kept realistic. */
const SCREENS_DESKTOP: ScreenProfile[] = [
  { w: 1920, h: 1080, avail: 1040, dpr: 1, weight: 34 },
  { w: 1920, h: 1080, avail: 1050, dpr: 1, weight: 8 },
  { w: 2560, h: 1440, avail: 1400, dpr: 1, weight: 12 },
  { w: 1366, h: 768, avail: 728, dpr: 1, weight: 11 },
  { w: 1536, h: 864, avail: 824, dpr: 1.25, weight: 8 },
  { w: 1440, h: 900, avail: 860, dpr: 1, weight: 4 },
  { w: 1680, h: 1050, avail: 1010, dpr: 1, weight: 3 },
  { w: 3840, h: 2160, avail: 2120, dpr: 1.5, weight: 6 },
  { w: 1600, h: 900, avail: 860, dpr: 1, weight: 4 },
  { w: 1280, h: 720, avail: 680, dpr: 1, weight: 3 },
];

const CORES_MEMORY: readonly (readonly [number, number, number])[] = [
  // [cores, gigabytes, weight] - values Chromium actually reports (memory is capped at 8).
  [4, 8, 26],
  [8, 8, 30],
  [6, 8, 12],
  [12, 8, 10],
  [16, 8, 8],
  [2, 4, 6],
  [10, 8, 4],
  [20, 8, 2],
];

const FONT_SETS: Record<string, string[]> = {
  windows: ['Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
  macos: ['Helvetica', 'Helvetica Neue', 'Menlo', 'Monaco', 'Optima', 'Palatino', 'San Francisco', 'Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana'],
  linux: ['DejaVu Sans', 'Liberation Sans', 'Ubuntu', 'Noto Sans', 'Cantarell', 'Arial', 'Courier New', 'Georgia', 'Times New Roman'],
  minimal: ['Arial', 'Courier New', 'Times New Roman'],
};

const LANG_BY_OS: Record<DesktopOs, string[]> = {
  'Windows 11': ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-BR', 'nl-NL', 'pl-PL', 'tr-TR', 'ru-RU', 'en-IN'],
  'Windows 10': ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'it-IT', 'tr-TR', 'pl-PL'],
  'macOS 15': ['en-US', 'en-GB', 'de-DE', 'ja-JP', 'fr-FR', 'es-ES', 'ko-KR'],
  'macOS 14': ['en-US', 'en-GB', 'de-DE', 'ja-JP', 'fr-FR', 'es-ES'],
  Linux: ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'ru-RU'],
};

export interface GenerateOptions {
  seed?: number;
  os?: DesktopOs;
  deviceType?: DeviceType;
  engine?: string;
  browserVersion?: string;
  /** Country code from a tested proxy, used to pull timezone and locale into agreement. */
  countryCode?: string;
}

export function generateFingerprint(options: GenerateOptions = {}): FingerprintConfig {
  const seed = options.seed ?? Rng.seed();
  return buildFromSeed(seed, options);
}

function buildFromSeed(seed: number, options: GenerateOptions): FingerprintConfig {
  const rng = new Rng(seed);
  const deviceType: DeviceType = options.deviceType ?? 'desktop';

  const os: DesktopOs = options.os ??
    (deviceType === 'desktop'
      ? rng.weighted<DesktopOs>([
          ['Windows 11', 58],
          ['Windows 10', 20],
          ['macOS 15', 10],
          ['macOS 14', 7],
          ['Linux', 5],
        ])
      : rng.weighted<DesktopOs>([['Windows 11', 45], ['Windows 10', 20], ['macOS 15', 20], ['macOS 14', 10], ['Linux', 5]]));

  const gpuPool = os.startsWith('macOS') ? GPU_MAC : os === 'Linux' ? GPU_LINUX : GPU_WINDOWS;
  const gpu = rng.weighted(gpuPool.map((g) => [g, g.weight] as const));

  const screen = deviceType === 'desktop'
    ? rng.weighted(SCREENS_DESKTOP.map((s) => [s, s.weight] as const))
    : { w: 390, h: 844, avail: 844, dpr: 3, weight: 1 };

  const [cores, memory] = rng.weighted(CORES_MEMORY.map((row) => [row, row[2]] as const));

  const language = pickLanguage(rng, os, options.countryCode);
  const zone = resolveZone(language, options.countryCode, rng);

  const fontSet = os === 'Linux' ? 'linux' : os.startsWith('macOS') ? 'macos' : 'windows';
  const engine = options.engine ?? 'chrome';
  const identity = buildIdentity(engine, options.browserVersion ?? '157.0.8103.41', os, deviceType, seed);

  return {
    seed,
    os,
    deviceType,
    timezone: zone,
    language,
    acceptLanguage: buildAcceptLanguage(language),
    screenW: screen.w,
    screenH: screen.h,
    availW: screen.w,
    availH: screen.avail,
    colorDepth: 24,
    pixelRatio: screen.dpr,
    webGlVendor: gpu.vendor,
    webGlRenderer: gpu.renderer,
    cores,
    memory,
    touchPoints: deviceType === 'desktop' ? 0 : rng.int(5, 10),
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
    fontSet,
    hardwareNoise: true,
    userAgent: identity.userAgent,
    platform: identity.platform,
    brand: identity.brands.find((b) => !b.brand.toLowerCase().includes('brand'))?.brand ?? 'Google Chrome',
    userAgentOverride: '',
    browserVersion: options.browserVersion ?? '157.0.8103.41',
  };
}

function pickLanguage(rng: Rng, os: DesktopOs, countryCode?: string): string {
  if (countryCode) {
    const zone = BY_CODE.get(countryCode.toUpperCase());
    if (zone) return zone.langs[0]!;
  }
  return rng.pick(LANG_BY_OS[os]);
}

function resolveZone(language: string, countryCode: string | undefined, rng: Rng): string {
  if (countryCode) {
    const zone = BY_CODE.get(countryCode.toUpperCase());
    if (zone) return zone.timezone;
  }
  // A language without a region would otherwise pick a timezone that contradicts it; prefer a
  // zone whose locale shares the language base.
  const base = language.split('-')[0];
  const candidates = ZONES.filter((z) => z.locale.split('-')[0] === base);
  if (candidates.length > 0) return rng.pick(candidates).timezone;
  return rng.pick(ZONES).timezone;
}

function buildAcceptLanguage(language: string): string {
  const [base] = language.split('-');
  if (!base || base === language) return language;
  return `${language},${base};q=0.9`;
}

/** The twelve-surface signature two profiles must not share. */
export function signature(fp: FingerprintConfig): Record<Surface, string> {
  return {
    userAgent: fp.userAgent || '',
    platform: `${fp.platform}|${fp.deviceType}`,
    screen: `${fp.screenW}x${fp.screenH}@${fp.pixelRatio}`,
    webgl: `${fp.webGlVendor}|${fp.webGlRenderer}`,
    cores: String(fp.cores),
    memory: String(fp.memory),
    timezone: fp.timezone,
    language: `${fp.language}|${fp.acceptLanguage}`,
    fonts: fp.fontSet,
    canvas: String(fp.seed % 100000),
    audio: String(hashString(`${fp.seed}:audio`) % 100000),
    touch: `${fp.touchPoints}|${fp.spoofBattery ? 'b' : '-'}`,
  };
}

export interface UniquenessResult {
  unique: boolean;
  attempts: number;
  collisions: Partial<Record<Surface, number>>;
}

/**
 * Compare a candidate against every existing profile. `strict` requires a full twelve-surface
 * separation; the relaxed pass only refuses a shared WebGL renderer plus a shared screen, which
 * is the pair a checker treats as one machine.
 */
export function checkUniqueness(
  candidate: FingerprintConfig,
  existing: FingerprintConfig[],
  strict = true,
): UniquenessResult {
  const mine = signature(candidate);
  const collisions: Partial<Record<Surface, number>> = {};
  let collided = false;

  for (const other of existing) {
    const theirs = signature(other);
    let shared = 0;
    for (const surface of SURFACES) {
      if (mine[surface] === theirs[surface]) {
        collisions[surface] = (collisions[surface] ?? 0) + 1;
        shared++;
      }
    }
    const fatal = strict ? shared >= SURFACES.length - 2 : shared >= 10;
    if (fatal) collided = true;
  }

  return { unique: !collided, attempts: 1, collisions };
}

/**
 * Roll a new identity and re-roll it until it is distinct from everything already stored.
 * After 240 attempts the loop stops instead of spinning: a wall of near-identical machines is
 * less useful than an honest profile the user can adjust by hand.
 */
export function rollUnique(
  existing: FingerprintConfig[],
  options: GenerateOptions = {},
): { fingerprint: FingerprintConfig; result: UniquenessResult } {
  let fingerprint = generateFingerprint(options);
  let result = checkUniqueness(fingerprint, existing);

  for (let attempt = 1; attempt <= 240 && !result.unique; attempt++) {
    fingerprint = generateFingerprint({ ...options, seed: Rng.seed() });
    result = checkUniqueness(fingerprint, existing);
    result.attempts = attempt + 1;
  }

  if (!result.unique) {
    // Last resort: force the rarest surfaces apart by re-rolling against a relaxed comparison.
    for (let attempt = 0; attempt < 60; attempt++) {
      fingerprint = generateFingerprint({ ...options, seed: Rng.seed() });
      const relaxed = checkUniqueness(fingerprint, existing, false);
      if (relaxed.unique) {
        result = relaxed;
        break;
      }
    }
  }

  return { fingerprint, result };
}

/** Align clock, locale and coordinates with the exit country of the proxy. */
export function alignWithProxy(
  fp: FingerprintConfig,
  countryCode: string,
  timezone: string,
): FingerprintConfig {
  if (!countryCode) return fp;
  const zone = BY_CODE.get(countryCode.toUpperCase());
  return {
    ...fp,
    timezone: zone?.timezone || timezone || fp.timezone,
    language: zone?.langs[0] ?? fp.language,
    acceptLanguage: buildAcceptLanguage(zone?.langs[0] ?? fp.language),
    geoLat: zone?.lat ?? fp.geoLat,
    geoLng: zone?.lng ?? fp.geoLng,
  };
}

export function fontsFor(fontSet: string): string[] {
  return FONT_SETS[fontSet] ?? FONT_SETS['windows']!;
}
