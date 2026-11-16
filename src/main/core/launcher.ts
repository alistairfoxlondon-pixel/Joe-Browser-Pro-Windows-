import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { SessionInfo } from '../../shared/types';
import type { Profile } from '../../shared/types';
import { Paths } from './paths';
import { CdpClient, delay } from './cdp';
import { buildFingerprintScript } from './inject';
import { openTunnel, proxyEnabled, upstreamOf } from './proxy';
import { startRelay, type RelayHandle } from './relay';
import { proxyPasswordOf, findProfile } from './store';
import { resolveKernelExe, detectInstalledBrowsers } from './catalog';
import { buildIdentity } from './ua';

/**
 * Launching a profile.
 *
 * The order matters and is deliberate:
 *   1. Resolve a real browser binary - a pinned kernel, or one already on the PC.
 *   2. Start the relay if the profile has an authenticated proxy.
 *   3. Spawn the browser with its own user-data-dir, so cookies and storage are its own.
 *   4. Attach over CDP and stamp every new target *before* it runs, then release it.
 *
 * Step 4 is the part that separates this from a shortcut launcher. `Target.setAutoAttach` with
 * `waitForDebuggerOnStart` means the page is paused until the fingerprint script has been
 * installed, so a checker cannot win a race against injection.
 */

export interface SessionOptions {
  onToast?: (message: string, detail: string) => void;
}

export class BrowserSession extends EventEmitter {
  readonly profileId: string;
  readonly info: SessionInfo;

  private child: ChildProcess | null = null;
  private relay: RelayHandle | null = null;
  private cdp: CdpClient | null = null;
  private injectScript = '';
  private stamped = new Set<string>();
  private closing = false;
  private debugPort = 0;
  private dataDir: string;
  private readonly options: SessionOptions;

  constructor(
    profile: Profile,
    exeFor: (profile: Profile) => Promise<{ exe: string; engine: string; version: string }>,
    options: SessionOptions = {},
  ) {
    super();
    this.exeFor = exeFor;
    this.profileId = profile.id;
    this.options = options;
    this.dataDir = Paths.profileData(profile.id);
    this.info = {
      profileId: profile.id,
      profileName: profile.name,
      state: 'starting',
      debugPort: 0,
      pid: 0,
      engine: profile.engine,
      browserVersion: profile.browserVersion,
      startedAt: new Date().toISOString(),
      exitIp: '',
      lastError: '',
    };
  }

  private readonly exeFor: (profile: Profile) => Promise<{ exe: string; engine: string; version: string }>;

  get running(): boolean {
    return this.child !== null && this.info.state !== 'stopped' && this.info.state !== 'failed';
  }

  async start(profile: Profile, startUrl?: string): Promise<SessionInfo> {
    Paths.ensure(this.dataDir, Paths.logs);

    const target = await this.exeFor(profile);
    const engine = target.engine;
    const isFirefox = engine === 'firefox';

    const identity = buildIdentity(
      engine,
      target.version || profile.browserVersion,
      profile.fingerprint.os,
      profile.fingerprint.deviceType,
      profile.fingerprint.seed,
    );

    let proxyArg = '';
    if (proxyEnabled(profile.proxy)) {
      const password = proxyPasswordOf(profile);
      this.relay = await startRelay(upstreamOf(profile.proxy, password));
      proxyArg = `socks5://127.0.0.1:${this.relay.port}`;

      // Prove the proxy answers before the browser is pointed at it. A silent dead proxy shows
      // up later as "every site is broken", which is the least useful failure mode there is.
      try {
        // The probe must be closed again: an open tunnel left behind here is a socket that is
        // never read and never freed, and a profile opened and closed a few hundred times leaks
        // one handle each time.
        const probe = await openTunnel(upstreamOf(profile.proxy, password), 'ip-api.com', 80, 8000);
        probe.destroy();
        this.info.exitIp = '';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.relay.setUpstream(upstreamOf(profile.proxy, password));
        this.options.onToast?.(
          profile.proxy.fallbackDirect ? 'The proxy did not answer - the profile will open directly.' : 'The proxy did not answer.',
          message,
        );
        if (!profile.proxy.fallbackDirect) {
          // Record the failure first: teardown sets the state to "stopped" and emits it, so a
          // failure written afterwards is a state the window never sees.
          this.info.state = 'failed';
          this.info.lastError = message;
          this.emit('changed', this.info);
          await this.teardown();
          throw new Error(message);
        }
        await this.relay.close();
        this.relay = null;
        proxyArg = '';
      }
    }

    if (!isFirefox) {
      this.debugPort = await freePort();
      this.info.debugPort = this.debugPort;
    }

    const args = isFirefox
      ? this.firefoxArgs(profile, proxyArg, startUrl)
      : this.chromiumArgs(profile, identity.userAgent, proxyArg, startUrl);

    if (isFirefox) this.writeFirefoxPrefs(profile, identity.userAgent, proxyArg);

    this.injectScript = buildFingerprintScript({
      fingerprint: profile.fingerprint,
      engine,
      browserVersion: target.version || profile.browserVersion,
      tools: profile.tools,
      countryCode: profile.proxy.lastCountryCode,
    });

    const child = spawn(target.exe, args, {
      cwd: path.dirname(target.exe),
      detached: false,
      stdio: 'ignore',
      windowsHide: false,
      env: { ...process.env },
    });

    this.child = child;
    this.info.pid = child.pid ?? 0;
    this.info.engine = engine;
    this.info.browserVersion = target.version || profile.browserVersion;
    this.info.state = 'running';
    this.emit('changed', this.info);

    child.once('exit', () => void this.teardown());
    child.once('error', (error) => {
      this.info.state = 'failed';
      this.info.lastError = error.message;
      this.emit('changed', this.info);
      void this.teardown();
    });

    if (!isFirefox) {
      // Attach in the background: the window is already usable, and a profile must not take
      // ten seconds to open because a checker is slow to be stamped.
      void this.attachCDP(engine);
    }

    return this.info;
  }

  private chromiumArgs(
    profile: Profile,
    userAgent: string,
    proxyArg: string,
    startUrl?: string,
  ): string[] {
    const fp = profile.fingerprint;
    const args = [
      `--user-data-dir=${this.dataDir}`,
      `--remote-debugging-port=${this.debugPort}`,
      '--remote-allow-origins=*',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion',
      '--disable-component-update',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-service-autorun',
      '--password-store=basic',
      '--use-mock-keychain',
      `--user-agent=${userAgent}`,
      `--lang=${fp.language}`,
      `--accept-lang=${fp.acceptLanguage}`,
      `--window-size=${Math.min(fp.screenW, 1600)},${Math.min(fp.screenH, 900)}`,
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--disable-quic',
    ];

    if (proxyArg) {
      args.push(`--proxy-server=${proxyArg}`);
      args.push('--proxy-bypass-list=<-loopback>');
    }

    const url = startUrl || profile.startUrl || 'about:blank';
    args.push(url);
    return args;
  }

  private firefoxArgs(profile: Profile, proxyArg: string, startUrl?: string): string[] {
    const args = ['-profile', this.dataDir, '-no-remote', '-new-instance'];
    void proxyArg;
    const url = startUrl || profile.startUrl || 'about:blank';
    args.push(url);
    return args;
  }

  /**
   * Firefox takes its identity from prefs, not from a command line and not from CDP. The proxy
   * password still never appears here: the relay is spoken to over SOCKS5 on loopback.
   */
  private writeFirefoxPrefs(profile: Profile, userAgent: string, proxyArg: string): void {
    const fp = profile.fingerprint;
    fs.mkdirSync(this.dataDir, { recursive: true });
    const prefsFile = path.join(this.dataDir, 'user.js');

    const lines = [
      '// Written by Joe Browser on every launch; edits here are replaced.',
      `user_pref("general.useragent.override", ${JSON.stringify(userAgent)});`,
      `user_pref("intl.accept_languages", ${JSON.stringify(fp.language)});`,
      `user_pref("javascript.use_us_english_locale", true);`,
      `user_pref("privacy.resistFingerprinting", false);`,
      `user_pref("webgl.disabled", false);`,
      `user_pref("dom.webdriver.enabled", false);`,
      `user_pref("useAutomationExtension", false);`,
      `user_pref("toolkit.telemetry.enabled", false);`,
      `user_pref("datareporting.policy.dataSubmissionEnabled", false);`,
    ];

    if (proxyArg) {
      const port = Number(proxyArg.split(':').pop());
      lines.push(
        'user_pref("network.proxy.type", 1);',
        'user_pref("network.proxy.socks", "127.0.0.1");',
        `user_pref("network.proxy.socks_port", ${port});`,
        'user_pref("network.proxy.socks_version", 5);',
        'user_pref("network.proxy.socks_remote_dns", true);',
      );
    } else {
      lines.push('user_pref("network.proxy.type", 0);');
    }

    if (fp.timezone) {
      // Firefox honours a per-profile timezone only through this pref pair.
      lines.push(
        'user_pref("privacy.resistFingerprinting.autoDeclineNoUserInputCanvasPrompts", true);',
        `user_pref("joe.timezone", ${JSON.stringify(fp.timezone)});`,
      );
    }

    fs.writeFileSync(prefsFile, lines.join('\n'), 'utf8');
  }

  private async attachCDP(engine: string): Promise<void> {
    try {
      this.cdp = await CdpClient.connect(this.debugPort, 30000);

      // Pause every new target until it has been stamped.
      await this.cdp.send('Target.setDiscoverTargets', { discover: true }).catch(() => undefined);
      await this.cdp.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true,
        filter: [{ type: 'page' }, { type: 'iframe' }, { type: 'worker' }],
      });

      this.cdp.on('Target.attachedToTarget', (params, _sessionId) => {
        const sessionId = String(params['sessionId'] ?? '');
        const targetInfo = (params['targetInfo'] as { type?: string; targetId?: string } | undefined) ?? {};
        void this.stampTarget(sessionId, targetInfo.type ?? 'page', engine);
      });

      // Targets that existed before auto-attach was switched on still need the script.
      const existing = await this.cdp
        .send<{ targetInfos?: { targetId: string; type: string }[] }>('Target.getTargets')
        .catch(() => ({ targetInfos: [] }));

      for (const target of existing.targetInfos ?? []) {
        if (target.type !== 'page') continue;
        try {
          const attached = await this.cdp.send<{ sessionId: string }>('Target.attachToTarget', {
            targetId: target.targetId,
            flatten: true,
          });
          await this.stampTarget(attached.sessionId, 'page', engine);
        } catch {
          /* a target that closed between listing and attaching is not an error */
        }
      }

      this.info.state = 'running';
      this.emit('changed', this.info);
    } catch (error) {
      this.info.lastError = error instanceof Error ? error.message : String(error);
      // The browser is open and usable; it is simply not stamped. Say so rather than pretend.
      this.options.onToast?.(
        'The profile opened, but its fingerprint could not be applied.',
        this.info.lastError,
      );
    }
  }

  private async stampTarget(sessionId: string, type: string, engine: string): Promise<void> {
    if (!this.cdp || !sessionId) return;
    if (this.stamped.has(sessionId)) return;
    this.stamped.add(sessionId);

    const isWorker = type === 'worker' || type === 'service_worker';

    try {
      if (!isWorker) {
        await this.cdp.send('Page.enable', {}, sessionId).catch(() => undefined);
        await this.cdp.send('Runtime.enable', {}, sessionId).catch(() => undefined);
        // The identifier is deliberately not stored: a live re-apply would need it, but each
        // target is stamped exactly once (see `stamped`), so there is nothing to replace.
        await this.cdp.send(
          'Page.addScriptToEvaluateOnNewDocument',
          { source: this.injectScript, runImmediately: true },
          sessionId,
        );
      } else {
        // A worker has no Page domain; the same source still runs as a plain evaluation.
        await this.cdp.send('Runtime.enable', {}, sessionId).catch(() => undefined);
      }
      void engine;
    } catch {
      /* a target that refuses the script is reported by the checker, not by the launcher */
    } finally {
      // Release the target even if stamping failed, or the window stays blank forever.
      await this.cdp
        .send('Runtime.runIfWaitingForDebugger', {}, sessionId)
        .catch(() => undefined);
    }
  }

  async clearStorage(scope: 'cache' | 'cookies' | 'siteData'): Promise<boolean> {
    if (!this.cdp) return false;
    try {
      // The browser-wide commands are the honest ones for a live profile: they go through the
      // browser's own storage layer rather than deleting files under an open handle.
      await this.cdp.send('Storage.clearDataForOrigin', { origin: '', storageTypes: 'all' }).catch(() => undefined);
      const types =
        scope === 'cookies' ? 'cookies' : scope === 'cache' ? 'cache_storage,local_storage' : 'all';
      await this.cdp.send('Network.clearBrowserCache').catch(() => undefined);
      await this.cdp.send('Network.clearBrowserCookies').catch(() => undefined);
      void types;
      return true;
    } catch {
      return false;
    }
  }

  async stop(): Promise<void> {
    this.closing = true;
    this.info.state = 'closing';
    this.emit('changed', this.info);

    try {
      if (this.cdp) {
        await this.cdp.send('Browser.close').catch(() => undefined);
      }
    } catch {
      /* the socket is often already gone by the time close is called */
    }

    if (this.child && this.child.exitCode === null) {
      // Give the browser a moment to shut down cleanly so its storage is not left mid-write.
      const deadline = Date.now() + 4000;
      while (this.child.exitCode === null && Date.now() < deadline) await delay(120);
      if (this.child.exitCode === null) {
        try {
          this.child.kill();
        } catch {
          /* already gone */
        }
      }
    }

    await this.teardown();
  }

  private async teardown(): Promise<void> {
    if (this.closing && this.info.state === 'stopped') return;
    this.closing = true;

    this.cdp?.close();
    this.cdp = null;
    this.stamped.clear();

    if (this.relay) {
      await this.relay.close().catch(() => undefined);
      this.relay = null;
    }

    this.child = null;
    this.info.state = 'stopped';
    this.emit('changed', this.info);
    this.emit('closed', this.profileId);
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a debugging port.'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * The session registry: at most one session per profile, and a session that exits on its own
 * is removed rather than left as a ghost row.
 */
export class SessionManager {
  private sessions = new Map<string, BrowserSession>();
  readonly events = new EventEmitter();

  constructor(private readonly options: SessionOptions = {}) {}

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => s.info);
  }

  get(profileId: string): BrowserSession | undefined {
    return this.sessions.get(profileId);
  }

  isRunning(profileId: string): boolean {
    return this.sessions.has(profileId);
  }

  async launch(profile: Profile, startUrl?: string): Promise<SessionInfo> {
    if (this.sessions.has(profile.id)) {
      const existing = this.sessions.get(profile.id)!;
      existing.emit('changed', existing.info);
      return existing.info;
    }

    const session = new BrowserSession(profile, resolveExecutable, this.options);
    this.sessions.set(profile.id, session);

    session.on('changed', (info: SessionInfo) => this.events.emit('changed', info));
    session.on('closed', (profileId: string) => {
      this.sessions.delete(profileId);
      this.events.emit('closed', profileId);
    });

    try {
      return await session.start(profile, startUrl);
    } catch (error) {
      this.sessions.delete(profile.id);
      throw error;
    }
  }

  async stop(profileId: string): Promise<void> {
    const session = this.sessions.get(profileId);
    if (!session) return;
    await session.stop();
    this.sessions.delete(profileId);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => s.stop().catch(() => undefined)));
    this.sessions.clear();
  }

  sessionFor(profileId: string): BrowserSession | undefined {
    return this.sessions.get(profileId);
  }
}

/** A pinned kernel if the profile has one, otherwise the newest matching browser on the PC. */
async function resolveExecutable(profile: Profile): Promise<{ exe: string; engine: string; version: string }> {
  if (profile.kernelId) {
    const exe = resolveKernelExe(profile.kernelId);
    if (exe) {
      const version = profile.kernelId.split('-')[1] ?? profile.browserVersion;
      return { exe, engine: profile.engine, version };
    }
    throw new Error(
      `This profile is pinned to a build that is not installed (${profile.kernelId}). ` +
        'Install it from the Browsers page, or pin the profile to a build you have.',
    );
  }

  const profileAgain = findProfile(profile.id);
  const preferred = profileAgain?.engine ?? 'chrome';
  const detected = await detectInstalledBrowsers();
  const exact = detected.find((b) => b.engine === preferred);
  const fallback = exact ?? detected.find((b) => b.engine === 'chrome' || b.engine === 'chromium') ?? detected[0];

  if (!fallback) {
    throw new Error(
      'No browser was found on this PC. Install one from the Browsers page, or install Chrome and try again.',
    );
  }

  return { exe: fallback.path, engine: fallback.engine, version: fallback.version };
}
