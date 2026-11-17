import type { Profile, ProfileLocation, ProxyCheckResult } from '../../shared/types';
import { profileLocationKey } from './store';
import { countryCode, countryName } from '../../shared/countries';

/** Short-lived, in-memory cache. Failure never triggers a direct lookup for a configured proxy. */
export class ProfileLocationService {
  private cache = new Map<string, { expires: number; result: ProfileLocation }>();
  private pending = new Map<string, Promise<ProfileLocation>>();
  constructor(
    private readonly direct: () => Promise<ProxyCheckResult>,
    private readonly proxied: (profile: Profile) => Promise<ProxyCheckResult>,
    private readonly now: () => number = Date.now,
  ) {}

  async locate(profile: Profile): Promise<ProfileLocation> {
    const key = profileLocationKey(profile);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.result;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = (async () => {
      let result: ProfileLocation = { key, country: '', countryCode: '', ok: false };
      try {
        const reply = await (profile.proxy.type === 'none' ? this.direct() : this.proxied(profile));
        const code = countryCode(reply.countryCode);
        if (reply.ok && code) {
          result = { key, country: countryName(code, reply.country), countryCode: code, ok: true };
        }
      } catch { /* Unavailable is distinct from a known country. */ }
      if (this.cache.size >= 512) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { result, expires: this.now() + 30_000 });
      return result;
    })();
    this.pending.set(key, request);
    try { return await request; } finally { this.pending.delete(key); }
  }
}
