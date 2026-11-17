import https from 'node:https';
import net from 'node:net';

export interface IpRisk { ip: string; score: number; proxy: string; type: string }

/** Interpret only an explicit successful provider response; missing data is never a clean verdict. */
export function parseIpRisk(ip: string, data: unknown): IpRisk {
  if (!data || typeof data !== 'object') throw new Error('Risk data unavailable.');
  const obj = data as Record<string, unknown>;
  const row = obj[ip];
  if (obj.status !== 'ok' || !row || typeof row !== 'object') throw new Error('Risk data unavailable or rate limit reached.');
  const item = row as Record<string, unknown>;
  const score = item.risk;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) throw new Error('Risk score unavailable.');
  return { ip, score, proxy: typeof item.proxy === 'string' ? item.proxy : '', type: typeof item.type === 'string' ? item.type.slice(0, 80) : '' };
}

/** Explicit, user-initiated lookup. Only the exit IP is sent; no proxy credentials are sent. */
export function checkIpRisk(ip: string): Promise<IpRisk> {
  if (!net.isIP(ip)) return Promise.reject(new Error('A valid exit IP is required.'));
  return new Promise((resolve, reject) => {
    const request = https.get(`https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&risk=1`, { timeout: 10000 }, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Risk service unavailable.')); return; }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; if (body.length > 32768) request.destroy(new Error('Risk response too large.')); });
      response.on('end', () => { try { resolve(parseIpRisk(ip, JSON.parse(body))); } catch { reject(new Error('Risk data unavailable or rate limit reached.')); } });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Risk lookup timed out.')));
    request.on('error', reject);
  });
}
