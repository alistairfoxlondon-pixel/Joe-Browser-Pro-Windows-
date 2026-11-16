import net from 'node:net';
import type { ProxyCheckResult, ProxyConfig, ProxyType } from '../../shared/types';

/**
 * Proxy plumbing.
 *
 * Chromium and Firefox both accept a proxy on the command line or in prefs, but neither can be
 * given a password that way - it would sit in the process table where any user-level tool can
 * read it. So an authenticated proxy is always reached through `relay.ts`, and the browser only
 * ever learns `127.0.0.1:<random local port>`. Everything in this file works for the relay and
 * for the "Test" button, and both use the same handshakes so a proxy that tests green is a
 * proxy the browser can actually use.
 */

export const EMPTY_PASSWORD = '';

export function proxyTypeOf(value: unknown): ProxyType {
  return value === 'http' || value === 'https' || value === 'socks5' ? value : 'none';
}

export function normalizeProxy(input: Partial<ProxyConfig> | undefined): ProxyConfig {
  const type = proxyTypeOf(input?.type);
  return {
    type,
    host: (input?.host ?? '').trim(),
    port: Number.isFinite(input?.port) ? Number(input?.port) : 0,
    user: (input?.user ?? '').trim(),
    password: input?.password ?? EMPTY_PASSWORD,
    passwordEnc: input?.passwordEnc ?? '',
    lastIp: input?.lastIp ?? '',
    lastCountry: input?.lastCountry ?? '',
    lastCountryCode: input?.lastCountryCode ?? '',
    lastTimezone: input?.lastTimezone ?? '',
    lastCity: input?.lastCity ?? '',
    fallbackDirect: input?.fallbackDirect ?? true,
  };
}

export function proxyEnabled(p: ProxyConfig): boolean {
  return p.type !== 'none' && p.host.length > 0 && p.port > 0;
}

export function proxyLabel(p: ProxyConfig): string {
  if (!proxyEnabled(p)) return 'Direct';
  return p.lastCountryCode ? `Proxy ${p.lastCountryCode}` : 'Proxy';
}

export function proxyDetail(p: ProxyConfig): string {
  if (!proxyEnabled(p)) return 'No proxy';
  return `${p.type.toUpperCase()} ${p.host}:${p.port}${p.user ? ' · auth' : ''}`;
}

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
      user = decodeURIComponent(creds.slice(0, colon));
      password = decodeURIComponent(creds.slice(colon + 1));
    } else {
      user = decodeURIComponent(creds);
    }
  }

  const parts = rest.split(':').map((p) => p.trim());
  const host = parts[0] ?? '';
  const port = Number.parseInt(parts[1] ?? '', 10);

  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) return null;

  // host:port:user:pass, the seller-copy format.
  if (!user && parts.length >= 4) {
    user = parts[2] ?? '';
    password = parts.slice(3).join(':');
  }

  return { type, host, port, user, password };
}

/** Upstream detail, used by the relay and the tester only. */
export interface Upstream {
  type: ProxyType;
  host: string;
  port: number;
  user: string;
  password: string;
}

export function upstreamOf(p: ProxyConfig, password?: string): Upstream {
  return {
    type: p.type,
    host: p.host,
    port: p.port,
    user: p.user,
    password: password ?? p.password ?? EMPTY_PASSWORD,
  };
}

/** A tunnel through the upstream proxy to host:port, or a rejected promise. */
export async function openTunnel(
  upstream: Upstream,
  host: string,
  port: number,
  timeoutMs = 20000,
): Promise<net.Socket> {
  const socket = net.connect({ host: upstream.host, port: upstream.port });
  socket.setTimeout(timeoutMs);

  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.once('error', fail);
    socket.once('timeout', () => fail(new Error('The proxy did not answer in time.')));
    socket.once('connect', () => {
      socket.removeListener('error', fail);
      socket.removeListener('timeout', () => fail(new Error('timeout')));
      resolve();
    });
  });

  try {
    if (upstream.type === 'socks5') {
      await socks5Connect(socket, upstream, host, port);
    } else {
      await httpConnect(socket, upstream, host, port);
    }
  } catch (error) {
    socket.destroy();
    throw error;
  }

  socket.setTimeout(0);
  return socket;
}

function socks5Connect(
  socket: net.Socket,
  upstream: Upstream,
  host: string,
  port: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stage: 'greeting' | 'auth' | 'connect' = 'greeting';
    let buffer = Buffer.alloc(0);

    const write = (chunk: Buffer) => socket.write(chunk);

    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };

    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (stage === 'greeting') {
        if (buffer.length < 2) return;
        if (buffer[0] !== 0x05) return fail('The proxy is not speaking SOCKS5.');
        const method = buffer[1];
        buffer = buffer.subarray(2);

        if (method === 0x02) {
          if (!upstream.user && !upstream.password) {
            return fail('The proxy wants a username and password.');
          }
          const user = Buffer.from(upstream.user, 'utf8');
          const pass = Buffer.from(upstream.password, 'utf8');
          const auth = Buffer.concat([
            Buffer.from([0x01, user.length]),
            user,
            Buffer.from([pass.length]),
            pass,
          ]);
          stage = 'auth';
          write(auth);
          return;
        }
        if (method === 0x00) {
          stage = 'connect';
          write(connectRequest(Buffer.from(host, 'utf8'), port));
          return;
        }
        return fail(method === 0xff
          ? 'The proxy refused every authentication method it was offered.'
          : 'The proxy asked for an authentication method this app does not use.');
      }

      if (stage === 'auth') {
        if (buffer.length < 2) return;
        const status = buffer[1];
        buffer = buffer.subarray(2);
        if (status !== 0x00) return fail('The proxy rejected the username or password.');
        stage = 'connect';
        write(connectRequest(Buffer.from(host, 'utf8'), port));
        return;
      }

      if (stage === 'connect') {
        if (buffer.length < 4) return;
        const reply = buffer[1] ?? 0;
        if (reply !== 0x00) return fail(socksReplyText(reply));
        // Drain the bound address so nothing is left for the caller to parse.
        const atyp = buffer[3];
        const addressLength = atyp === 0x01 ? 4 : atyp === 0x03 ? (buffer[4] ?? 0) + 1 : atyp === 0x04 ? 16 : 0;
        if (addressLength === 0) return fail('The proxy answered with an address family this app does not read.');
        if (buffer.length < 4 + addressLength + 2) return;
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('The proxy closed the connection during the SOCKS5 handshake.'));
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);

    write(Buffer.from(upstream.user || upstream.password ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]));
  });
}

function connectRequest(host: Buffer, port: number): Buffer {
  const portBuffer = Buffer.alloc(2);
  portBuffer.writeUInt16BE(port, 0);

  if (host.length > 255) {
    // A very long name cannot be length-prefixed; fall back to domain encoding anyway so the
    // failure comes from the proxy rather than from a malformed packet.
    return Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, 255]), host.subarray(0, 255), portBuffer]);
  }

  return Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]), host, portBuffer]);
}

function socksReplyText(code: number): string {
  switch (code) {
    case 1:
      return 'The proxy reported a general failure.';
    case 2:
      return 'The proxy refused the connection (its rules blocked the host).';
    case 3:
      return 'The destination is unreachable from the proxy.';
    case 4:
      return 'The host could not be reached from the proxy.';
    case 5:
      return 'The proxy refused the request.';
    case 6:
      return 'The request expired at the proxy.';
    case 7:
      return 'The proxy does not support the requested command.';
    case 8:
      return 'The proxy does not support that address type.';
    default:
      return `The proxy answered with SOCKS5 reply ${code}.`;
  }
}

function httpConnect(
  socket: net.Socket,
  upstream: Upstream,
  host: string,
  port: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    };
    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => fail('The proxy closed the connection before it answered.');

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('latin1');
      if (!buffer.includes('\r\n\r\n')) {
        if (buffer.length > 16384) fail('The proxy sent an oversized response header.');
        return;
      }

      const head = buffer.slice(0, buffer.indexOf('\r\n\r\n'));
      const statusLine = head.split('\r\n')[0] ?? '';
      const match = /^HTTP\/1\.[01]\s+(\d{3})/i.exec(statusLine);
      const status = match ? Number(match[1]) : 0;

      // Anything the proxy sent after the header belongs to the tunnel.
      const leftover = buffer.slice(buffer.indexOf('\r\n\r\n') + 4);
      cleanup();

      if (status === 200) {
        if (leftover.length > 0) socket.unshift(Buffer.from(leftover, 'latin1'));
        resolve();
        return;
      }
      if (status === 407) {
        reject(new Error('The proxy rejected the username or password.'));
        return;
      }
      if (status === 0) {
        reject(new Error('The proxy did not answer with HTTP.'));
        return;
      }
      reject(new Error(`The proxy answered ${status} to the tunnel request.`));
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);

    const auth = upstream.user
      ? `Proxy-Authorization: Basic ${Buffer.from(`${upstream.user}:${upstream.password}`).toString('base64')}\r\n`
      : '';

    socket.write(
      `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}` +
        'Proxy-Connection: keep-alive\r\n\r\n',
      'latin1',
    );
  });
}

/** A tiny HTTP/1.1 GET over an existing socket, enough for the IP echo endpoint. */
function httpGetOver(socket: net.Socket, host: string, pathName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', reject);
      socket.removeListener('close', onClose);
    };
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 262144) {
        cleanup();
        socket.destroy();
        reject(new Error('The check endpoint sent an oversized response.'));
      }
    };
    const onClose = () => {
      cleanup();
      resolve(buffer.toString('utf8'));
    };

    socket.on('data', onData);
    socket.on('error', reject);
    socket.on('close', onClose);

    socket.write(
      `GET ${pathName} HTTP/1.1\r\nHost: ${host}\r\nAccept: application/json\r\n` +
        'User-Agent: JoeBrowser/2.0\r\nConnection: close\r\n\r\n',
      'latin1',
    );
  });
}

/** Strip status line, headers and chunked framing; return the body. */
function bodyOf(raw: string): string {
  const split = raw.indexOf('\r\n\r\n');
  if (split < 0) return raw.trim();
  const head = raw.slice(0, split).toLowerCase();
  let body = raw.slice(split + 4);

  if (head.includes('transfer-encoding: chunked')) {
    let out = '';
    let index = 0;
    while (index < body.length) {
      const lineEnd = body.indexOf('\r\n', index);
      if (lineEnd < 0) break;
      const size = Number.parseInt(body.slice(index, lineEnd).trim(), 16);
      if (!Number.isFinite(size) || size <= 0) break;
      out += body.slice(lineEnd + 2, lineEnd + 2 + size);
      index = lineEnd + 2 + size + 2;
    }
    body = out;
  }

  const firstBrace = body.indexOf('{');
  return firstBrace >= 0 ? body.slice(firstBrace) : body.trim();
}

const CHECK_HOST = 'ip-api.com';
const CHECK_PATH = '/json/?fields=status,message,country,countryCode,city,timezone,query';

interface IpEcho {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  timezone: string;
}

function parseEcho(json: string): IpEcho {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  if (parsed['status'] === 'fail') {
    throw new Error(String(parsed['message'] ?? 'The check endpoint refused the request.'));
  }
  return {
    ip: String(parsed['query'] ?? ''),
    country: String(parsed['country'] ?? ''),
    countryCode: String(parsed['countryCode'] ?? ''),
    city: String(parsed['city'] ?? ''),
    timezone: String(parsed['timezone'] ?? ''),
  };
}

/**
 * Ask an IP echo service who we look like through this proxy. This is the same request the
 * proxy watch repeats every minute while a profile is open.
 */
export async function testProxy(
  config: ProxyConfig,
  password?: string,
  timeoutMs = 20000,
): Promise<ProxyCheckResult> {
  const started = Date.now();
  const base: ProxyCheckResult = {
    ok: false,
    ip: '',
    country: '',
    countryCode: '',
    city: '',
    timezone: '',
    latencyMs: 0,
    error: '',
  };

  if (!proxyEnabled(config)) {
    return { ...base, error: 'No proxy is configured for this profile.' };
  }

  let socket: net.Socket | null = null;
  try {
    socket = await openTunnel(upstreamOf(config, password), CHECK_HOST, 80, timeoutMs);
    const raw = await httpGetOver(socket, CHECK_HOST, CHECK_PATH);
    const echo = parseEcho(bodyOf(raw));
    if (!echo.ip) throw new Error('The check endpoint answered without an address.');
    return {
      ...base,
      ok: true,
      ...echo,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ...base,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    socket?.destroy();
  }
}

/** The same question asked on a direct connection, for the "is the proxy really working" case. */
export async function testDirect(timeoutMs = 15000): Promise<ProxyCheckResult> {
  const started = Date.now();
  let socket: net.Socket | null = null;
  try {
    socket = net.connect({ host: CHECK_HOST, port: 80 });
    socket.setTimeout(timeoutMs);
    await new Promise<void>((resolve, reject) => {
      socket!.once('connect', () => resolve());
      socket!.once('timeout', () => reject(new Error('The check timed out on a direct connection.')));
      socket!.once('error', (e) => reject(e));
    });
    socket.setTimeout(0);
    const raw = await httpGetOver(socket, CHECK_HOST, CHECK_PATH);
    return { ok: true, ...parseEcho(bodyOf(raw)), latencyMs: Date.now() - started, error: '' };
  } catch (error) {
    return {
      ok: false,
      ip: '',
      country: '',
      countryCode: '',
      city: '',
      timezone: '',
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    socket?.destroy();
  }
}
