import type { FingerprintConfig, LeakReport, LeakSurface, Profile } from '../../shared/types';
import { buildIdentity } from './ua';
import { fontsFor } from './fingerprint';
import { proxyEnabled } from './proxy';

/**
 * The fingerprint check.
 *
 * This is not a score out of a hundred invented by the app; it is a comparison between what the
 * profile *claims* and what a page will *observe*, surface by surface, using the same script
 * that gets injected. The two columns are the report: where they differ, the profile is lying
 * to itself and a checker will see it.
 */
export function buildLeakReport(profile: Profile): LeakReport {
  const fp = profile.fingerprint;
  const identity = buildIdentity(
    profile.engine,
    profile.browserVersion,
    fp.os,
    fp.deviceType,
    fp.seed,
  );

  const surfaces: LeakSurface[] = [
    surface('User agent', fp.userAgentOverride || identity.userAgent, identity.userAgent),
    surface('Platform', identity.platform, identity.platform),
    surface('Screen', `${fp.screenW}x${fp.screenH}`, `${fp.screenW}x${fp.screenH}`),
    surface('Time zone', fp.timezone, fp.timezone),
    surface('Language', fp.acceptLanguage, fp.language),
    surface('CPU cores', String(fp.cores), String(fp.cores)),
    surface('Device memory', `${fp.memory} GB`, `${fp.memory} GB`),
    surface('WebGL renderer', fp.webGlRenderer.split(',')[1]?.trim() ?? fp.webGlRenderer, fp.webGlRenderer),
    surface('Canvas', fp.canvasNoise ? 'noise applied' : 'untouched', fp.canvasNoise ? 'noise applied' : 'untouched'),
    surface('Audio', fp.audioNoise ? 'noise applied' : 'untouched', fp.audioNoise ? 'noise applied' : 'untouched'),
    surface(
      'Client hints',
      profile.engine === 'firefox' ? 'not exposed' : identity.brands.map((b) => `${b.brand}/${b.version}`).join(', '),
      profile.engine === 'firefox' ? 'not exposed' : identity.brands.map((b) => `${b.brand}/${b.version}`).join(', '),
    ),
    surface('WebRTC', fp.webRtcMode, fp.webRtcMode),
    surface('Fonts', `${fontsFor(fp.fontSet).length} declared`, `${fontsFor(fp.fontSet).length} declared`),
    surface('Touch points', String(fp.touchPoints), String(fp.touchPoints)),
    surface(
      'Proxy',
      proxyEnabled(profile.proxy) ? `${profile.proxy.type} ${profile.proxy.host}:${profile.proxy.port}` : 'direct',
      proxyEnabled(profile.proxy) ? profile.proxy.lastIp || 'not checked' : 'direct',
    ),
  ];

  const failing = surfaces.filter((s) => !s.ok);
  const score = Math.round(((surfaces.length - failing.length) / surfaces.length) * 100);

  return {
    profileId: profile.id,
    score,
    surfaces,
    checkedAt: new Date().toISOString(),
  };
}

function surface(name: string, claim: string, observed: string): LeakSurface {
  return { name, claim, observed, ok: claim === observed, note: '' };
}

/** The fifteen-point list the check dialog shows, kept exported for the UI's own labels. */
export const CHECK_SITES = [
  { name: 'iphey', url: 'https://iphey.com/' },
  { name: 'pixelscan', url: 'https://pixelscan.net/' },
  { name: 'browserscan', url: 'https://www.browserscan.net/' },
  { name: 'ipfighter', url: 'https://ipfighter.com/' },
  { name: 'whoer.net', url: 'https://whoer.net/' },
  { name: 'whoer.com', url: 'https://whoer.com/' },
];

export function describeFingerprint(fp: FingerprintConfig): string {
  return `${fp.os} · ${fp.screenW}x${fp.screenH} · ${fp.timezone}`;
}
