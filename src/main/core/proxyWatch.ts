export type ProxyNotice = { kind: 'warn' | 'success'; message: string; detail: string };

/** Transition-based notices avoid repeated alerts while a proxy stays offline. */
export class ProxyWatchState {
  private failures = 0;
  private down = false;
  private lastIp = '';

  constructor(private readonly profileName: string) {}

  failure(detail: string): ProxyNotice | null {
    this.failures++;
    if (this.failures < 2 || this.down) return null;
    this.down = true;
    return { kind: 'warn', message: `The proxy for ${this.profileName} stopped answering`, detail };
  }

  success(ip: string, location: string): ProxyNotice[] {
    this.failures = 0;
    const notices: ProxyNotice[] = [];
    if (this.down) {
      this.down = false;
      notices.push({ kind: 'success', message: `The proxy for ${this.profileName} is answering again`, detail: [ip, location].filter(Boolean).join(' · ') });
    }
    if (ip && this.lastIp && ip !== this.lastIp) {
      notices.push({ kind: 'warn', message: `The exit address for ${this.profileName} changed`, detail: `${this.lastIp} → ${ip}` });
    }
    if (ip) this.lastIp = ip;
    return notices;
  }
}
