import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import type { DetectedBrowser, InstalledKernel, KernelBuild } from '../../shared/types';
import { Paths } from './paths';
import { readJson, writeJson } from './atomic';

/**
 * The browser kernel catalog.
 *
 * Joe Browser does not ship a browser; it manages real published builds. The list comes from
 * the vendors' own metadata (Chrome for Testing for Chromium and Chrome, Mozilla product
 * details for Firefox) and is cached on disk, so the Browsers page opens instantly and a
 * machine that is briefly offline still shows what it saw last.
 *
 * Nothing is downloaded until something needs it: a profile pinned to a build this machine does
 * not have, or a click on Install.
 */

const CFT_KNOWN_GOOD = 'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json';
const CFT_LAST_KNOWN = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';
const MOZILLA_VERSIONS = 'https://product-details.mozilla.org/1.0/firefox_versions.json';

const CACHE_FILE = () => Paths.storeFile('catalog.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** How many past majors stay pinnable. Chrome reaches back eight, matching the old build. */
const MAJORS_TO_KEEP = 8;

interface CacheShape {
  fetchedAt: number;
  builds: KernelBuild[];
}

interface CftVersionEntry {
  version: string;
  downloads?: { chrome?: { platform: string; url: string }[]; chromium?: { platform: string; url: string }[] };
}

interface CftShape {
  versions?: CftVersionEntry[];
  channels?: Record<string, { version: string; downloads?: CftVersionEntry['downloads'] }>;
}

function httpsJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { 'user-agent': 'JoeBrowser/2.0 (+desktop)' }, timeout: timeoutMs },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          response.resume();
          reject(new Error(`${url} answered ${response.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
          } catch (error) {
            reject(new Error(`Could not read the JSON from ${url}: ${(error as Error).message}`));
          }
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error(`${url} timed out`)));
    request.on('error', reject);
  });
}

function platformSuffix(): string {
  return process.platform === 'win32' ? 'win64' : process.platform === 'darwin' ? 'mac-x64' : 'linux64';
}

function buildId(engine: string, version: string, channel: string): string {
  return `${engine}-${version}-${channel}`;
}

function pickUrl(entries: { platform: string; url: string }[] | undefined): string {
  const suffix = platformSuffix();
  return entries?.find((e) => e.platform === suffix)?.url ?? '';
}

function channelOf(version: string, channels: Record<string, string>): string {
  for (const [name, value] of Object.entries(channels)) {
    if (value === version) return name;
  }
  return 'stable';
}

async function fetchChromiumBuilds(): Promise<KernelBuild[]> {
  const suffix = platformSuffix();
  const builds: KernelBuild[] = [];

  let channels: Record<string, string> = {};
  try {
    const last = await httpsJson<CftShape>(CFT_LAST_KNOWN);
    for (const [name, info] of Object.entries(last.channels ?? {})) {
      channels[name] = info.version;
    }
    // The channel list is also the honest source for the pre-release builds.
    for (const [name, info] of Object.entries(last.channels ?? {})) {
      for (const product of ['chrome', 'chromium'] as const) {
        const url = pickUrl(info.downloads?.[product]);
        if (!url) continue;
        builds.push({
          id: buildId(product, info.version, name),
          engine: product,
          channel: name,
          version: info.version,
          os: suffix,
          downloadUrl: url,
          installed: false,
          path: '',
          sizeBytes: 0,
        });
      }
    }
  } catch {
    /* the known-good list below still gives the stable history */
  }

  const known = await httpsJson<CftShape>(CFT_KNOWN_GOOD);
  const stable = (known.versions ?? []).filter((entry) => entry.downloads?.chrome || entry.downloads?.chromium);

  // Keep the newest build of each major, newest first, so the page is eight rows rather than
  // several hundred point releases.
  const byMajor = new Map<string, CftVersionEntry>();
  for (const entry of stable) {
    const major = entry.version.split('.')[0] ?? '';
    const current = byMajor.get(major);
    if (!current || compareVersions(entry.version, current.version) > 0) {
      byMajor.set(major, entry);
    }
  }

  const newest = [...byMajor.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, MAJORS_TO_KEEP);

  for (const [, entry] of newest) {
    const channel = channelOf(entry.version, channels);
    for (const product of ['chrome', 'chromium'] as const) {
      const url = pickUrl(entry.downloads?.[product]);
      if (!url) continue;
      const id = buildId(product, entry.version, channel);
      if (builds.some((b) => b.id === id)) continue;
      builds.push({
        id,
        engine: product,
        channel,
        version: entry.version,
        os: suffix,
        downloadUrl: url,
        installed: false,
        path: '',
        sizeBytes: 0,
      });
    }
  }

  return builds;
}

async function fetchFirefoxBuilds(): Promise<KernelBuild[]> {
  const suffix = platformSuffix();
  const details = await httpsJson<Record<string, string>>(MOZILLA_VERSIONS);
  const versions: { channel: string; version: string }[] = [];

  for (const [key, channel] of [
    ['LATEST_FIREFOX_VERSION', 'stable'],
    ['FIREFOX_ESR', 'esr'],
    ['LATEST_FIREFOX_DEVEL_VERSION', 'dev'],
  ] as const) {
    const version = details[key];
    if (version && !version.includes('b') && !version.includes('a')) {
      versions.push({ channel, version });
    } else if (version) {
      versions.push({ channel, version: version.replace(/[ab]\d+$/, '') });
    }
  }

  return versions.map(({ channel, version }) => {
    const folder = process.platform === 'win32' ? 'win64' : process.platform === 'darwin' ? 'mac' : 'linux-x86_64';
    return {
      id: buildId('firefox', version, channel),
      engine: 'firefox',
      channel,
      version,
      os: suffix,
      downloadUrl:
        `https://archive.mozilla.org/pub/firefox/releases/${version}/${folder}/en-US/` +
        (process.platform === 'win32' ? `firefox-${version}.zip` : `firefox-${version}.tar.bz2`),
      installed: false,
      path: '',
      sizeBytes: 0,
    };
  });
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Kernel IDs are directory names, never paths supplied by a renderer. */
function kernelDirectory(id: string): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(id) || id === '.' || id === '..') {
    throw new Error('Invalid browser build ID.');
  }
  return path.join(Paths.kernels, id);
}

function installedIndex(): Map<string, InstalledKernel> {
  const dir = Paths.kernels;
  const map = new Map<string, InstalledKernel>();
  if (!fs.existsSync(dir)) return map;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaFile = path.join(dir, entry.name, 'kernel.json');
    if (!fs.existsSync(metaFile)) continue;
    const meta = readJson<InstalledKernel | null>(metaFile, null);
    if (meta && meta.id === entry.name) {
      try { if (resolveKernelExe(meta.id)) map.set(meta.id, meta); } catch { /* Ignore malformed metadata. */ }
    }
  }
  return map;
}

/** The kernels already on disk, synchronously - used to spread profiles across builds. */
export function installedKernels(): InstalledKernel[] {
  return [...installedIndex().values()];
}

export async function listKernels(forceRefresh = false): Promise<KernelBuild[]> {
  const cache = readJson<CacheShape>(CACHE_FILE(), { fetchedAt: 0, builds: [] });
  const fresh = Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  let builds = cache.builds;

  if (!fresh || forceRefresh || builds.length === 0) {
    const gathered: KernelBuild[] = [];
    const results = await Promise.allSettled([fetchChromiumBuilds(), fetchFirefoxBuilds()]);
    for (const result of results) {
      if (result.status === 'fulfilled') gathered.push(...result.value);
    }

    if (gathered.length > 0) {
      builds = gathered;
      writeJson(CACHE_FILE(), { fetchedAt: Date.now(), builds } satisfies CacheShape);
    } else if (builds.length === 0) {
      throw new Error(
        'The browser catalog could not be reached. Check the connection and try again - ' +
          'existing installations still work.',
      );
    }
  }

  const installed = installedIndex();
  return builds
    .map((build) => {
      const local = installed.get(build.id);
      return local
        ? { ...build, installed: true, path: local.exePath, sizeBytes: fs.existsSync(local.path) ? dirSize(local.path) : 0 }
        : { ...build, installed: false, path: '', sizeBytes: 0 };
    })
    .sort((a, b) => b.engine.localeCompare(a.engine) || compareVersions(b.version, a.version));
}

function dirSize(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      try {
        total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
      } catch {
        /* a locked file still counts as zero rather than failing the listing */
      }
    }
  } catch {
    /* an unreadable folder reports zero */
  }
  return total;
}

export async function downloadKernel(
  build: KernelBuild,
  onProgress: (received: number, total: number) => void,
): Promise<InstalledKernel> {
  const targetDir = kernelDirectory(build.id);
  if (fs.existsSync(targetDir)) {
    const existing = readJson<InstalledKernel | null>(path.join(targetDir, 'kernel.json'), null);
    if (existing) return existing;
  }

  if (fs.existsSync(targetDir)) throw new Error('The browser build folder already exists but is invalid. Remove it before reinstalling.');
  if (!build.downloadUrl) throw new Error('This build has no download address.');
  if (!build.downloadUrl.startsWith('https://')) {
    throw new Error('Refusing to download a build over a connection that is not HTTPS.');
  }

  Paths.ensure(Paths.kernels);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-kernel-'));
  const archivePath = path.join(tempDir, archiveNameFor(build));

  const staging = `${targetDir}.staging-${crypto.randomUUID()}`;
  try {
    await downloadFile(build.downloadUrl, archivePath, onProgress);
    fs.mkdirSync(staging, { recursive: true });
    await extract(archivePath, staging);
    const exePath = locateLauncher(staging, build.engine);
    if (!exePath) throw new Error('The downloaded archive did not contain a browser launcher.');
    const meta: InstalledKernel = {
      id: build.id, engine: build.engine, version: build.version,
      path: targetDir, exePath: path.join(targetDir, path.relative(staging, exePath)),
      installedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(staging, 'kernel.json'), JSON.stringify(meta, null, 2), 'utf8');
    // Do not delete a competing install. A second download can be safely retried.
    if (fs.existsSync(targetDir)) throw new Error('This browser build was installed by another request.');
    fs.renameSync(staging, targetDir);
    return meta;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function archiveNameFor(build: KernelBuild): string {
  if (build.engine === 'firefox') return process.platform === 'win32' ? 'firefox.zip' : 'firefox.tar.bz2';
  return 'browser.zip';
}

function downloadFile(
  url: string,
  destination: string,
  onProgress: (received: number, total: number) => void,
  redirectsLeft = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'user-agent': 'JoeBrowser/2.0' } }, (response) => {
      const status = response.statusCode ?? 0;

      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new Error('The download redirected too many times.'));
          return;
        }
        resolve(downloadFile(response.headers.location, destination, onProgress, redirectsLeft - 1));
        return;
      }

      if (status !== 200) {
        response.resume();
        reject(new Error(`The download answered ${status}.`));
        return;
      }

      const total = Number(response.headers['content-length'] ?? 0);
      let received = 0;
      const file = fs.createWriteStream(destination);

      response.on('data', (chunk: Buffer) => {
        received += chunk.length;
        onProgress(received, total);
      });
      response.pipe(file);

      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (error) => {
        file.destroy();
        reject(error);
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(60000, () => request.destroy(new Error('The download stalled.')));
  });
}

function extract(archive: string, into: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      // Windows ships bsdtar, which reads zip; Expand-Archive covers tar.bz2 poorly, so the
      // Firefox archive is unpacked with tar as well.
      const isTar = archive.endsWith('.tar.bz2');
      const command = isTar
        ? { file: 'tar', args: ['-xjf', archive, '-C', into] }
        : { file: 'tar', args: ['-xf', archive, '-C', into] };
      // Git for Windows also ships GNU tar; it treats C: paths as remote hosts. Use Windows' bsdtar.
      const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      execFile(systemTar, command.args, { windowsHide: true }, (error, _stdout, stderr) => {
        if (error) reject(new Error(`Could not unpack the archive: ${stderr || error.message}`));
        else resolve();
      });
      return;
    }

    const args = archive.endsWith('.tar.bz2')
      ? ['-xjf', archive, '-C', into]
      : ['-xf', archive, '-C', into];
    execFile('tar', args, (error, _stdout, stderr) => {
      if (error) reject(new Error(`Could not unpack the archive: ${stderr || error.message}`));
      else resolve();
    });
  });
}

function locateLauncher(root: string, engine: string): string | null {
  const names =
    engine === 'firefox'
      ? ['firefox.exe', 'firefox']
      : engine === 'chromium'
        ? ['chrome.exe', 'chromium', 'Chromium']
        : ['chrome.exe', 'chrome', 'Google Chrome'];

  const walk = (dir: string, depth: number): string | null => {
    if (depth > 4) return null;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const name of names) {
      const direct = entries.find((e) => e.isFile() && e.name.toLowerCase() === name.toLowerCase());
      if (direct) return path.join(dir, direct.name);
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const found = walk(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
    return null;
  };

  return walk(root, 0);
}

export async function removeKernel(id: string): Promise<void> {
  const dir = kernelDirectory(id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export function resolveKernelExe(id: string): string | null {
  const dir = kernelDirectory(id);
  const meta = readJson<InstalledKernel | null>(path.join(dir, 'kernel.json'), null);
  if (!meta || meta.id !== id) return null;
  // Never execute paths taken from metadata outside the managed build folder.
  const candidate = path.resolve(meta.exePath || '');
  if (candidate.startsWith(path.resolve(dir) + path.sep) && fs.existsSync(candidate)) {
    const realDir = fs.realpathSync(dir);
    const realCandidate = fs.realpathSync(candidate);
    if (realCandidate.startsWith(realDir + path.sep) && fs.statSync(realCandidate).isFile()) return realCandidate;
  }
  return locateLauncher(dir, meta.engine);
}

/** Browsers already on this PC, so a profile can use one as it is. */
export async function detectInstalledBrowsers(): Promise<DetectedBrowser[]> {
  const candidates: { engine: string; name: string; paths: string[] }[] = [];

  if (process.platform === 'win32') {
    const programFiles = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']]
      .filter((p): p is string => Boolean(p));

    const expand = (base: string, rest: string) => path.join(base, ...rest.split('\\'));

    candidates.push(
      { engine: 'chrome', name: 'Google Chrome', paths: programFiles.map((p) => expand(p, 'Google\\Chrome\\Application\\chrome.exe')) },
      { engine: 'edge', name: 'Microsoft Edge', paths: programFiles.map((p) => expand(p, 'Microsoft\\Edge\\Application\\msedge.exe')) },
      { engine: 'brave', name: 'Brave', paths: programFiles.map((p) => expand(p, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')) },
      { engine: 'firefox', name: 'Firefox', paths: programFiles.map((p) => expand(p, 'Mozilla Firefox\\firefox.exe')) },
      { engine: 'chromium', name: 'Chromium', paths: programFiles.map((p) => expand(p, 'Chromium\\Application\\chrome.exe')) },
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      { engine: 'chrome', name: 'Google Chrome', paths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] },
      { engine: 'edge', name: 'Microsoft Edge', paths: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] },
      { engine: 'brave', name: 'Brave', paths: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'] },
      { engine: 'firefox', name: 'Firefox', paths: ['/Applications/Firefox.app/Contents/MacOS/firefox'] },
      { engine: 'chromium', name: 'Chromium', paths: ['/Applications/Chromium.app/Contents/MacOS/Chromium'] },
    );
  } else {
    candidates.push(
      { engine: 'chrome', name: 'Google Chrome', paths: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'] },
      { engine: 'chromium', name: 'Chromium', paths: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'] },
      { engine: 'firefox', name: 'Firefox', paths: ['/usr/bin/firefox'] },
      { engine: 'brave', name: 'Brave', paths: ['/usr/bin/brave-browser'] },
      { engine: 'edge', name: 'Microsoft Edge', paths: ['/usr/bin/microsoft-edge'] },
    );
  }

  const found: DetectedBrowser[] = [];
  for (const candidate of candidates) {
    const hit = candidate.paths.find((p) => p && fs.existsSync(p));
    if (!hit) continue;
    found.push({
      engine: candidate.engine,
      name: candidate.name,
      version: await versionOf(hit),
      path: hit,
    });
  }
  return found;
}

function versionOf(exe: string): Promise<string> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      execFile(exe, ['--version'], { timeout: 4000, windowsHide: true }, (error, stdout) => {
        if (error) {
          resolve('unknown');
          return;
        }
        const match = /(\d+\.\d+(?:\.\d+)?)/.exec(stdout);
        resolve(match ? match[1]! : 'unknown');
      });
      return;
    }

    const escaped = exe.replace(/'/g, "''");
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${escaped}').VersionInfo.ProductVersion`],
      { timeout: 6000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve('unknown');
          return;
        }
        const trimmed = stdout.trim();
        resolve(trimmed || 'unknown');
      },
    );
  });
}
