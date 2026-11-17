import type {
  DeviceTarget,
  DeviceType,
  FingerprintConfig,
  ResolvedOs,
} from './types';

/**
 * Device targets.
 *
 * The original offered seven: System default, Windows 11, Windows 10, macOS, Linux, Android,
 * iPhone, iPad. The port had five desktop-only strings, which meant the single most useful thing
 * an anti-detect browser does — look like a phone — could not be expressed.
 *
 * This file is the one place that knows how a target becomes a platform, a UA token, an
 * accept-language default and a realistic set of screens. Everything else asks it.
 */

/** What the running machine actually is. */
export function hostTarget(): DeviceTarget {
  switch (process.platform) {
    case 'win32':
      // The build is Windows 11 or 10 and only the build number separates them; for a profile
      // claim, 11 is the honest default for a current machine and the user can pick 10.
      return 'Windows 11';
    case 'darwin':
      return 'macOS';
    default:
      return 'Linux';
  }
}

/** The target that means "whatever this PC is". */
export const SYSTEM_TARGET: DeviceTarget = 'System default';

export function resolveTarget(target: DeviceTarget): {
  deviceType: DeviceType;
  resolvedOs: ResolvedOs;
  /** What `navigator.platform` says. */
  platform: string;
  /** What the client hints call the OS. */
  osPlatform: string;
} {
  const chosen = target === SYSTEM_TARGET ? hostTarget() : target;
  switch (chosen) {
    case 'Android':
      return { deviceType: 'mobile', resolvedOs: 'Linux', platform: 'Linux armv8l', osPlatform: 'Android' };
    case 'iPhone':
      return { deviceType: 'mobile', resolvedOs: 'macOS 15', platform: 'iPhone', osPlatform: 'iOS' };
    case 'iPad':
      return { deviceType: 'tablet', resolvedOs: 'macOS 15', platform: 'iPad', osPlatform: 'iOS' };
    case 'Windows 10':
      return { deviceType: 'desktop', resolvedOs: 'Windows 10', platform: 'Win32', osPlatform: 'Windows' };
    case 'macOS':
      return { deviceType: 'desktop', resolvedOs: 'macOS 15', platform: 'MacIntel', osPlatform: 'macOS' };
    case 'Linux':
      return { deviceType: 'desktop', resolvedOs: 'Linux', platform: 'Linux x86_64', osPlatform: 'Linux' };
    default:
      return { deviceType: 'desktop', resolvedOs: 'Windows 11', platform: 'Win32', osPlatform: 'Windows' };
  }
}

/** True for the phone and tablet targets, where a touch screen and a dpr of 3 are the norm. */
export function isMobileTarget(target: DeviceTarget): boolean {
  const device = resolveTarget(target).deviceType;
  return device !== 'desktop';
}

export function isIosTarget(target: DeviceTarget): boolean {
  return target === 'iPhone' || target === 'iPad';
}

export function isAndroidTarget(target: DeviceTarget): boolean {
  return target === 'Android';
}

export function isWindowsTarget(target: DeviceTarget): boolean {
  const resolved = resolveTarget(target).resolvedOs;
  return resolved === 'Windows 11' || resolved === 'Windows 10';
}

/**
 * Screens that really ship, per target. A phone claim with a 1920x1080 screen is the kind of
 * contradiction a checker flags without any database at all.
 */
export const SCREENS_BY_TARGET: Record<DeviceTarget, { w: number; h: number; dpr: number; weight: number; label: string }[]> = {
  'System default': [
    { w: 1920, h: 1080, dpr: 1, weight: 30, label: '1920 × 1080' },
    { w: 1536, h: 864, dpr: 1.25, weight: 22, label: '1536 × 864' },
    { w: 2560, h: 1440, dpr: 1, weight: 16, label: '2560 × 1440' },
    { w: 1366, h: 768, dpr: 1, weight: 14, label: '1366 × 768' },
    { w: 1440, h: 900, dpr: 1, weight: 9, label: '1440 × 900' },
    { w: 3840, h: 2160, dpr: 1.5, weight: 9, label: '3840 × 2160' },
  ],
  'Windows 11': [
    { w: 1920, h: 1080, dpr: 1, weight: 32, label: '1920 × 1080' },
    { w: 1536, h: 864, dpr: 1.25, weight: 24, label: '1536 × 864' },
    { w: 2560, h: 1440, dpr: 1, weight: 14, label: '2560 × 1440' },
    { w: 1366, h: 768, dpr: 1, weight: 11, label: '1366 × 768' },
    { w: 3840, h: 2160, dpr: 1.5, weight: 10, label: '3840 × 2160' },
    { w: 2880, h: 1800, dpr: 2, weight: 9, label: '2880 × 1800 (200%)' },
  ],
  'Windows 10': [
    { w: 1920, h: 1080, dpr: 1, weight: 34, label: '1920 × 1080' },
    { w: 1366, h: 768, dpr: 1, weight: 26, label: '1366 × 768' },
    { w: 1600, h: 900, dpr: 1, weight: 14, label: '1600 × 900' },
    { w: 1536, h: 864, dpr: 1.25, weight: 12, label: '1536 × 864' },
    { w: 2560, h: 1440, dpr: 1, weight: 8, label: '2560 × 1440' },
    { w: 1280, h: 720, dpr: 1, weight: 6, label: '1280 × 720' },
  ],
  macOS: [
    { w: 1512, h: 982, dpr: 2, weight: 26, label: '1512 × 982 (MacBook Pro 14")' },
    { w: 1440, h: 900, dpr: 2, weight: 20, label: '1440 × 900 (MacBook Air)' },
    { w: 1728, h: 1117, dpr: 2, weight: 18, label: '1728 × 1117 (MacBook Pro 16")' },
    { w: 2560, h: 1440, dpr: 1, weight: 14, label: '2560 × 1440 (Studio Display)' },
    { w: 1920, h: 1080, dpr: 1, weight: 12, label: '1920 × 1080' },
    { w: 1280, h: 800, dpr: 2, weight: 10, label: '1280 × 800 (MacBook Air 13")' },
  ],
  Linux: [
    { w: 1920, h: 1080, dpr: 1, weight: 40, label: '1920 × 1080' },
    { w: 1366, h: 768, dpr: 1, weight: 26, label: '1366 × 768' },
    { w: 2560, h: 1440, dpr: 1, weight: 18, label: '2560 × 1440' },
    { w: 1600, h: 900, dpr: 1, weight: 16, label: '1600 × 900' },
  ],
  Android: [
    { w: 412, h: 915, dpr: 2.625, weight: 26, label: '412 × 915 (Pixel 7)' },
    { w: 393, h: 851, dpr: 2.75, weight: 22, label: '393 × 851 (Pixel 8)' },
    { w: 360, h: 800, dpr: 3, weight: 18, label: '360 × 800 (Galaxy S21)' },
    { w: 411, h: 891, dpr: 3.5, weight: 14, label: '411 × 891 (Galaxy S23)' },
    { w: 427, h: 952, dpr: 3, weight: 12, label: '427 × 952 (Pixel 7 Pro)' },
    { w: 384, h: 854, dpr: 3, weight: 8, label: '384 × 854 (Xiaomi)' },
  ],
  iPhone: [
    { w: 393, h: 852, dpr: 3, weight: 28, label: '393 × 852 (iPhone 15)' },
    { w: 390, h: 844, dpr: 3, weight: 24, label: '390 × 844 (iPhone 14)' },
    { w: 430, h: 932, dpr: 3, weight: 18, label: '430 × 932 (iPhone 15 Pro Max)' },
    { w: 375, h: 812, dpr: 3, weight: 16, label: '375 × 812 (iPhone 13 mini)' },
    { w: 428, h: 926, dpr: 3, weight: 14, label: '428 × 926 (iPhone 13 Pro Max)' },
  ],
  iPad: [
    { w: 820, h: 1180, dpr: 2, weight: 30, label: '820 × 1180 (iPad 10)' },
    { w: 1024, h: 1366, dpr: 2, weight: 26, label: '1024 × 1366 (iPad Pro 12.9")' },
    { w: 834, h: 1194, dpr: 2, weight: 22, label: '834 × 1194 (iPad Pro 11")' },
    { w: 744, h: 1133, dpr: 2, weight: 14, label: '744 × 1133 (iPad mini)' },
    { w: 1194, h: 834, dpr: 2, weight: 8, label: '1194 × 834 (iPad Pro landscape)' },
  ],
};

/** Chips a phone or tablet carries; a desktop reports 0. */
export function touchPointsFor(target: DeviceTarget, seedValue: number): number {
  const device = resolveTarget(target).deviceType;
  if (device === 'desktop') return 0;
  // Five is the floor Android reports and ten is everything; Apple reports exactly five.
  if (isIosTarget(target)) return 5;
  return 5 + (Math.abs(seedValue) % 6);
}

/** GPU pools that belong to the target, so a phone claim does not carry a discrete card. */
export const GPUS_BY_TARGET: Record<'desktop-windows' | 'desktop-mac' | 'desktop-linux' | 'ios' | 'android', { vendor: string; renderer: string; weight: number }[]> = {
  'desktop-windows': [
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 10 },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 9 },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 8 },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 6 },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 5 },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 4 },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 11 },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 9 },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 7 },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 6 },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 6 },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 5 },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 3 },
    { vendor: 'Google Inc. (Microsoft)', renderer: 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', weight: 2 },
  ],
  'desktop-mac': [
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', weight: 10 },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', weight: 9 },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', weight: 6 },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)', weight: 4 },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics, OpenGL 4.1)', weight: 3 },
  ],
  'desktop-linux': [
    { vendor: 'Google Inc. (Mesa)', renderer: 'ANGLE (Mesa, llvmpipe (LLVM 15.0.7, 256 bits), OpenGL 4.5)', weight: 6 },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)', weight: 5 },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050/PCIe/SSE2, OpenGL 4.5)', weight: 3 },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Series (POLARIS10, DRM 3.49.0), OpenGL 4.6)', weight: 3 },
  ],
  ios: [
    { vendor: 'Apple Inc.', renderer: 'Apple GPU', weight: 1 },
  ],
  android: [
    { vendor: 'Google Inc. (Qualcomm)', renderer: 'ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)', weight: 9 },
    { vendor: 'Google Inc. (ARM)', renderer: 'ANGLE (ARM, Mali-G715, OpenGL ES 3.2)', weight: 7 },
    { vendor: 'Google Inc. (Qualcomm)', renderer: 'ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)', weight: 6 },
    { vendor: 'Google Inc. (ARM)', renderer: 'ANGLE (ARM, Mali-G78 MP20, OpenGL ES 3.2)', weight: 4 },
    { vendor: 'Google Inc. (Imagination)', renderer: 'ANGLE (Imagination, PowerVR Rogue GE8320, OpenGL ES 3.2)', weight: 3 },
  ],
};

export function gpuPoolKey(target: DeviceTarget): keyof typeof GPUS_BY_TARGET {
  if (isIosTarget(target)) return 'ios';
  if (isAndroidTarget(target)) return 'android';
  const resolved = resolveTarget(target).resolvedOs;
  if (resolved.startsWith('macOS')) return 'desktop-mac';
  if (resolved === 'Linux') return 'desktop-linux';
  return 'desktop-windows';
}

/**
 * The version a phone target reports. "auto" follows the handset the viewport belongs to, which
 * is what the original meant by the word: an Android screen of 393 × 851 is a Pixel on 14, not a
 * 10-inch tablet on 12.
 */
export function androidVersionFor(target: DeviceTarget, fp: FingerprintConfig): string {
  if (!isAndroidTarget(target)) return fp.androidVersion;
  if (fp.androidVersion && fp.androidVersion !== 'auto') return fp.androidVersion;
  const area = fp.screenW * fp.screenH;
  if (area >= 400000) return '13';
  if (fp.screenW >= 420) return '14';
  return fp.screenW >= 400 ? '14' : '13';
}

export function iosVersionFor(target: DeviceTarget, fp: FingerprintConfig): string {
  if (!isIosTarget(target)) return fp.iosVersion;
  if (fp.iosVersion && fp.iosVersion !== 'auto') return fp.iosVersion;
  return '17.5';
}

/** The handset model named in the UA, derived from the screen so the two always agree. */
export function handsetFor(target: DeviceTarget, fp: FingerprintConfig): string {
  if (isIosTarget(target)) return target === 'iPad' ? 'iPad' : 'iPhone';
  if (isAndroidTarget(target)) {
    const key = `${fp.screenW}x${fp.screenH}`;
    const models: Record<string, string> = {
      '412x915': 'Pixel 7',
      '393x851': 'Pixel 8',
      '360x800': 'SM-G991B',
      '411x891': 'SM-S911B',
      '427x952': 'Pixel 7 Pro',
      '384x854': 'M2101K6G',
    };
    return models[key] ?? 'Pixel 7';
  }
  return '';
}

/**
 * Target choices for a picker, in the original's order, with the running machine named rather
 * than left as an abstract "system default".
 */
export function targetChoices(machineName: string): { value: DeviceTarget; label: string; hint: string }[] {
  return [
    { value: 'System default', label: 'System default', hint: `This PC — ${machineName}` },
    { value: 'Windows 11', label: 'Windows 11', hint: 'Windows 11 · desktop' },
    { value: 'Windows 10', label: 'Windows 10', hint: 'Windows 10 · desktop' },
    { value: 'macOS', label: 'macOS', hint: 'macOS 15 · desktop' },
    { value: 'Linux', label: 'Linux', hint: 'Linux x86_64 · desktop' },
    { value: 'Android', label: 'Android', hint: 'Android 14 · phone' },
    { value: 'iPhone', label: 'iPhone', hint: 'iPhone · iOS 17.5 · phone' },
    { value: 'iPad', label: 'iPad', hint: 'iPad · iOS 17.5 · tablet' },
  ];
}

/** Normalise anything a store file might hold into a known target. */
export function asTarget(value: unknown): DeviceTarget {
  const allowed: DeviceTarget[] = [
    'System default', 'Windows 11', 'Windows 10', 'macOS', 'Linux', 'Android', 'iPhone', 'iPad',
  ];
  if (typeof value === 'string') {
    if ((allowed as string[]).includes(value)) return value as DeviceTarget;
    if (value.startsWith('macOS')) return 'macOS';
    if (value === 'Windows') return 'Windows 11';
  }
  return 'System default';
}
