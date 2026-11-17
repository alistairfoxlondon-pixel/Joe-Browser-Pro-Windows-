import type { ProxyConfig, ProxyType } from './types';

/**
 * Accept the formats people actually paste from a proxy seller:
 *   host:port
 *   host:port:user:pass
 *   user:pass@host:port
 *   http://user:pass@host:port
 *   socks5://host:port
 */
export function parseProxyLine(raw: string): Partial<ProxyConfig> | null {
  const text = raw.trim();
  if (!text) return null;

  let type: ProxyType = 'http';
  let rest = text;

  const scheme = /^(https?|socks5h?|socks):\/\//i.exec(rest);
  if (scheme) {
    const schemeName = scheme[1]!.toLowerCase();
    type = schemeName.startsWith('socks') ? 'socks5' : schemeName === 'https' ? 'https' : 'http';
    rest = rest.slice(scheme[0].length);
  }

  let user = '';
  let password = '';

  const at = rest.lastIndexOf('@');
  if (at >= 0) {
    const creds = rest.slice(0, at);
    rest = rest.slice(at + 1);
    const colon = creds.indexOf(':');
    if (colon >= 0) {
      try {
        user = decodeURIComponent(creds.slice(0, colon));
        password = decodeURIComponent(creds.slice(colon + 1));
      } catch { return null; }
    } else {
      try { user = decodeURIComponent(creds); } catch { return null; }
    }
  }

  const parts = rest.split(':').map((p) => p.trim());
  const host = parts[0] ?? '';
  const portText = parts[1] ?? '';
  if (!/^\d+$/.test(portText) || parts.length === 3 || (at >= 0 && parts.length > 2)) return null;
  const port = Number(portText);

  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) return null;

  // host:port:user:pass, the seller-copy format.
  if (!user && parts.length >= 4) {
    user = parts[2] ?? '';
    password = parts.slice(3).join(':');
  }

  return { type, host, port, user, password };
}

