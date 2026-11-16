import type { DesktopOs, DeviceType } from '../../shared/types';
import { Rng } from './rng';

/**
 * User agent, client hints and brands, all derived from one (engine, version, os) triple.
 *
 * The three surfaces have to agree. A user agent that says Windows while `navigator.platform`
 * says Linux, or a brand list carrying a Chrome version the binary is not, is the first thing
 * a checker reports - and unlike canvas noise there is no repairing it after the fact.
 */

export const GREASE_BRANDS = [
  'Not_A Brand',
  'Not)A;Brand',
  'Not?A_Brand',
  'Not A(Brand',
  'Not;A=Brand',
  'Not.A/Brand',
];

export interface Identity {
  userAgent: string;
  platform: string;
  brands: { brand: string; version: string }[];
  fullVersionList: { brand: string; version: string }[];
  osPlatform: string;
  osVersion: string;
  architecture: string;
  bitness: string;
  mobile: boolean;
  appVersion: string;
}

function majorOf(version: string): string {
  const major = version.split('.')[0];
  return major && /^\d+$/.test(major) ? major : '157';
}

function chromeOsToken(os: DesktopOs, device: DeviceType): string {
  if (device === 'mobile') return 'Linux; Android 14; Pixel 8';
  if (device === 'tablet') return 'Linux; Android 13; SM-X710';
  switch (os) {
    case 'Windows 11':
    case 'Windows 10':
      return 'Windows NT 10.0; Win64; x64';
    case 'macOS 15':
    case 'macOS 14':
      return 'Macintosh; Intel Mac OS X 10_15_7';
    default:
      return 'X11; Linux x86_64';
  }
}

function platformOf(os: DesktopOs, device: DeviceType): string {
  if (device !== 'desktop') return 'Linux armv8l';
  if (os === 'Windows 11' || os === 'Windows 10') return 'Win32';
  if (os === 'Linux') return 'Linux x86_64';
  return 'MacIntel';
}

function osPlatformOf(os: DesktopOs, device: DeviceType): string {
  if (device !== 'desktop') return 'Android';
  if (os === 'Windows 11' || os === 'Windows 10') return 'Windows';
  if (os === 'Linux') return 'Linux';
  return 'macOS';
}

/** Windows 11 and 10 both report NT 10.0; the client-hint version is what separates them. */
function osVersionOf(os: DesktopOs, device: DeviceType): string {
  if (device !== 'desktop') return '14.0.0';
  switch (os) {
    case 'Windows 11':
      return '15.0.0';
    case 'Windows 10':
      return '10.0.0';
    case 'macOS 15':
      return '15.1.0';
    case 'macOS 14':
      return '14.6.1';
    default:
      return '6.6.0';
  }
}

/**
 * Build the whole identity. `seed` drives the GREASE ordering only, so two profiles on the
 * same kernel do not share a brand permutation.
 */
export function buildIdentity(
  engine: string,
  version: string,
  os: DesktopOs,
  device: DeviceType,
  seed: number,
): Identity {
  const rng = new Rng(seed ^ 0x5f3759df);
  const major = majorOf(version);
  const full = version.includes('.') ? version : `${version}.0.0.0`;

  if (engine === 'firefox') {
    const ffMajor = majorOf(version);
    const osToken = os === 'Linux' ? 'X11; Linux x86_64' : os.startsWith('macOS')
      ? 'Macintosh; Intel Mac OS X 10.15'
      : 'Windows NT 10.0; Win64; x64';
    const userAgent = `Mozilla/5.0 (${osToken}; rv:${ffMajor}.0) Gecko/20100101 Firefox/${ffMajor}.0`;
    return {
      userAgent,
      platform: os.startsWith('macOS') ? 'MacIntel' : os === 'Linux' ? 'Linux x86_64' : 'Win32',
      // Firefox exposes no client hints at all; an empty list is the honest answer and the
      // injection script removes the NavigatorUAData interface for these profiles.
      brands: [],
      fullVersionList: [],
      osPlatform: '',
      osVersion: '',
      architecture: '',
      bitness: '',
      mobile: false,
      appVersion: userAgent.replace('Mozilla/', ''),
    };
  }

  const chromeToken = `Chrome/${major}.0.0.0`;
  const branded =
    engine === 'edge' ? ` Edg/${major}.0.0.0` : engine === 'opera' ? ` OPR/${major}.0.0.0` : '';

  const userAgent =
    `Mozilla/5.0 (${chromeOsToken(os, device)}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `${chromeToken} Safari/537.36${branded}`;

  // The GREASE brand and its position are part of the identity: Chrome randomises them and a
  // fixed order is its own tell.
  const grease = rng.pick(GREASE_BRANDS);
  const greaseVersion = String(rng.pick([8, 24, 99, 0, 13]));

  const order = rng.shuffle(['grease', 'chromium', 'brand']).map((slot) => {
    if (slot === 'grease') return { brand: grease, version: greaseVersion };
    if (slot === 'chromium') return { brand: 'Chromium', version: major };
    return { brand: brandNameFor(engine), version: major };
  });

  const fullVersion = {
    brand: brandNameFor(engine),
    version: full.replace(/\.0$/, ''),
  };

  return {
    userAgent,
    platform: platformOf(os, device),
    brands: order,
    fullVersionList: [
      { brand: grease, version: '99.0.0.0' },
      { brand: 'Chromium', version: full },
      fullVersion,
    ],
    osPlatform: osPlatformOf(os, device),
    osVersion: osVersionOf(os, device),
    architecture: device === 'desktop' ? 'x86' : 'arm',
    bitness: device === 'desktop' ? '64' : '32',
    mobile: device !== 'desktop',
    appVersion: userAgent.replace('Mozilla/', ''),
  };
}

export function brandNameFor(engine: string): string {
  switch (engine) {
    case 'edge':
      return 'Microsoft Edge';
    case 'brave':
      return 'Brave';
    case 'opera':
      return 'Opera';
    case 'chromium':
      return 'Chromium';
    default:
      return 'Google Chrome';
  }
}
