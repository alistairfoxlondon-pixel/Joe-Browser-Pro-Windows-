import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import https from 'node:https';
import { execFile } from 'node:child_process';
import type { ExtensionItem, ExtensionReport, Profile } from '../../shared/types';
import { Paths } from './paths';
import { readJson, writeJson } from './atomic';
import {
  INSTALLED_DEFINITIONS,
  ensureFirstPartyExtensions,
  extensionArgs as firstPartyArgs,
} from './extensions';

/**
 * The extension library.
 *
 * The port could only describe the three scripts it writes itself, so adding an extension a user
 * actually wanted was impossible. The original had a library: add one by store link, by `.crx`,
 * or by folder; enable, disable, delete; keep the two included extensions recoverable; and offer
 * a few recommendations as store *searches* rather than invented ids, because an id nobody
 * checked 404s.
 *
 * A store link cannot be fetched by the app with any confidence: the store serves a redirect
 * page, then a one-time signed URL, and a build that depends on that breaks when Google changes
 * it. So the link is unpacked by the browser itself when the user pastes one, and the app
 * validates what it is given. Where a direct `.crx` URL is supplied, the CRX header is stripped
 * and the ZIP is unpacked here - that part is stable and it is what every CRX downloader does.
 */

const LIBRARY_FILE = () => Paths.storeFile('extensions.json');
const IMPORTED_ROOT = () => path.join(Paths.extensions, 'imported');
const SHIPPED_ROOT = () => path.join(Paths.extensions, 'shipped');

export const SHIPPED_IDS = {
  tracker: 'joe-http-tracker-plus',
  rightClick: 'joe-right-click-enable',
} as const;

const SHIPPED_DEFINITIONS: { id: string; name: string; description: string }[] = [
  {
    id: SHIPPED_IDS.tracker,
    name: 'HTTP Tracker Plus',
    description: 'See the redirect chain, status and hosts this tab requests.',
  },
  {
    id: SHIPPED_IDS.rightClick,
    name: 'Absolute Enable Right Click and Copy',
    description: 'Restores the right-click menu, text selection and copy on sites that block them.',
  },
];

const RECOMMENDED = [
  { name: 'Ad Blocker', description: 'A clean, quiet browsing session without pop-ups.', query: 'uBlock%20Origin', icon: 'shield' },
  { name: 'Google Translate', description: 'Translate pages inline without leaving the profile.', query: 'google%20translate', icon: 'translate' },
  { name: 'Cookie Editor', description: 'Inspect and edit cookies for the running profile.', query: 'cookie%20editor', icon: 'cookie' },
];

interface LibraryRow extends ExtensionItem {
  /** For an imported extension, the folder name inside `extensions/imported`. */
  folderName: string;
}

interface LibraryShape {
  version: number;
  items: LibraryRow[];
  /** Shipped extensions the user removed and has not restored. */
  removedShipped: string[];
}

const EMPTY: LibraryShape = { version: 1, items: [], removedShipped: [] };

function load(): LibraryShape {
  const raw = readJson<LibraryShape>(LIBRARY_FILE(), EMPTY);
  return {
    version: 1,
    items: Array.isArray(raw.items) ? raw.items : [],
    removedShipped: Array.isArray(raw.removedShipped) ? raw.removedShipped : [],
  };
}

function persist(shape: LibraryShape): void {
  writeJson(LIBRARY_FILE(), shape);
}

export function storeSearchUrl(query: string): string {
  return query ? `https://chromewebstore.google.com/search/${query.trim()}` : 'https://chromewebstore.google.com/';
}

/* ------------------------------------------------------------------ manifests */

interface Manifest {
  name?: string;
  version?: string;
  description?: string;
  icons?: Record<string, string>;
  action?: { default_icon?: Record<string, string> | string; default_title?: string };
  key?: string;
  content_scripts?: { js?: string[] }[];
  background?: { service_worker?: string; scripts?: string[] };
}

function readManifest(folder: string): Manifest | null {
  try {
    const text = fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8');
    return JSON.parse(text) as Manifest;
  } catch {
    return null;
  }
}

/** The largest icon a package ships, as an absolute path, or '' when it ships none. */
function iconOf(folder: string, manifest: Manifest | null): string {
  if (!manifest) return '';
  const candidates: string[] = [];
  for (const [size, file] of Object.entries(manifest.icons ?? {})) {
    if (typeof file === 'string') candidates.push(`${size}:${file}`);
  }
  const action = manifest.action?.default_icon;
  if (typeof action === 'string') candidates.push(`0:${action}`);
  else if (action) for (const [size, file] of Object.entries(action)) if (typeof file === 'string') candidates.push(`${size}:${file}`);

  candidates.sort((a, b) => Number(b.split(':')[0]) - Number(a.split(':')[0]));
  for (const candidate of candidates) {
    const file = candidate.split(':').slice(1).join(':');
    const full = path.join(folder, file);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    } catch {
      /* keep looking */
    }
  }
  return '';
}

/**
 * The store id, recovered from the `key` in the manifest.
 *
 * Chrome derives an extension's id from the first 128 bits of the SHA-256 of its public key,
 * mapping each nibble to a-p. That is how a folder can be matched to its store listing without
 * a lookup, and it is what the original did.
 */
function storeIdOf(manifest: Manifest | null): string {
  if (!manifest?.key) return '';
  try {
    const der = Buffer.from(manifest.key, 'base64');
    const hash = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);
    return hash.replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ installers */

function freshFolderName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'extension';
  const taken = new Set(
    (() => {
      try {
        return fs.readdirSync(IMPORTED_ROOT());
      } catch {
        return [] as string[];
      }
    })(),
  );
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}-${n++}`;
  return candidate;
}

/** Copy an unpacked folder into the library, so the source folder can move or be deleted. */
export function addFromFolder(sourceFolder: string): ExtensionItem {
  const resolved = path.resolve(sourceFolder);
  if (!fs.existsSync(path.join(resolved, 'manifest.json'))) {
    throw new Error('That folder is not an unpacked extension: it has no manifest.json.');
  }
  const manifest = readManifest(resolved);
  const name = (manifest?.name ?? path.basename(resolved)).slice(0, 120);
  const folderName = freshFolderName(name);
  const target = path.join(IMPORTED_ROOT(), folderName);

  fs.mkdirSync(IMPORTED_ROOT(), { recursive: true });
  copyTree(resolved, target);

  const item: LibraryRow = {
    id: crypto.randomUUID(),
    name,
    version: manifest?.version ?? '',
    description: (manifest?.description ?? 'Unpacked extension').slice(0, 240),
    folder: target,
    folderName,
    enabled: true,
    source: 'folder',
    storeUrl: '',
    iconPath: iconOf(target, manifest),
    storeId: storeIdOf(manifest),
    shipped: false,
    removed: false,
  };

  const shape = load();
  shape.items.push(item);
  persist(shape);
  return item;
}

function copyTree(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

/**
 * Install from a `.crx` or `.zip`.
 *
 * A CRX is a ZIP with a 16-byte-or-so header. The header length is in the first four bytes, so
 * the archive starts at that offset; stripping it and handing the rest to a zip reader is the
 * whole trick. The ZIP reader below is deliberately tiny: an extension is small, it holds no
 * entries with unusual flags, and pulling a dependency for this would be more surface than the
 * feature is worth.
 */
export function addFromCrxFile(file: string): ExtensionItem {
  const data = fs.readFileSync(file);
  const zip = crxPayload(data);
  if (!zip) throw new Error('That file is not a Chrome extension package (.crx) or a .zip.');

  const folderName = freshFolderName(path.basename(file).replace(/\.(crx|zip)$/i, ''));
  const target = path.join(IMPORTED_ROOT(), folderName);
  unzip(zip, target);

  const manifest = readManifest(target);
  if (!manifest) {
    fs.rmSync(target, { recursive: true, force: true });
    throw new Error('The package has no manifest.json, so the browser would refuse it.');
  }

  const name = (manifest.name ?? path.basename(file)).slice(0, 120);
  const item: LibraryRow = {
    id: crypto.randomUUID(),
    name,
    version: manifest.version ?? '',
    description: (manifest.description ?? 'Imported extension').slice(0, 240),
    folder: target,
    folderName,
    enabled: true,
    source: 'file',
    storeUrl: '',
    iconPath: iconOf(target, manifest),
    storeId: storeIdOf(manifest),
    shipped: false,
    removed: false,
  };

  const shape = load();
  shape.items.push(item);
  persist(shape);
  return item;
}

function crxPayload(data: Buffer): Buffer | null {
  if (data.length > 4 && data.subarray(0, 4).toString('latin1') === 'Cr24') {
    const version = data.readUInt32LE(4);
    let offset: number;
    if (version === 3) {
      // v3: magic(4) version(4) header_length(4) then the header, then the zip.
      const headerLength = data.readUInt32LE(8);
      offset = 12 + headerLength;
    } else {
      // v2: magic(4) version(4) pubkey_length(4) sig_length(4) then key, sig, zip.
      const publicKeyLength = data.readUInt32LE(8);
      const signatureLength = data.readUInt32LE(12);
      offset = 16 + publicKeyLength + signatureLength;
    }
    if (offset >= data.length) return null;
    return data.subarray(offset);
  }
  // A plain zip starts with PK\x03\x04.
  if (data.length > 4 && data.readUInt32LE(0) === 0x04034b50) return data;
  return null;
}

/** The smallest ZIP reader that matters: stored and deflated entries, central directory. */
function unzip(buffer: Buffer, target: string): void {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66000; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('The package is not a readable ZIP archive.');

  const entries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > buffer.length) break;
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const rawName = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;

    // Zip-slip: an entry whose name escapes the target folder is refused outright.
    const name = rawName.replace(/\\/g, '/');
    if (name.startsWith('/') || name.split('/').includes('..')) continue;
    if (name.endsWith('/')) continue;

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let content: Buffer;
    try {
      content = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    } catch {
      continue;
    }
    if (uncompressedSize && content.length !== uncompressedSize) {
      /* a truncated entry is skipped rather than written half-way */
      continue;
    }

    const destination = path.join(target, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
}

export function deleteExtension(id: string): void {
  const shape = load();
  const item = shape.items.find((row) => row.id === id);
  if (!item) return;
  try {
    fs.rmSync(item.folder, { recursive: true, force: true });
  } catch {
    /* a folder a running browser holds stays on disk; the row is gone either way */
  }
  shape.items = shape.items.filter((row) => row.id !== id);
  persist(shape);
}

export function setEnabled(id: string, enabled: boolean): ExtensionItem {
  const shape = load();
  const item = shape.items.find((row) => row.id === id);
  if (!item) throw new Error('That extension is no longer in the library.');
  item.enabled = enabled;
  persist(shape);
  return item;
}

/* ------------------------------------------------------------------ shipped pair */

/**
 * The two extensions that ship included. They are written by the app itself on every launch, so
 * they exist on a machine with no network and behind a proxy that blocks the store.
 */
export function ensureShipped(): void {
  const root = SHIPPED_ROOT();
  fs.mkdirSync(root, { recursive: true });

  writeIfChanged(path.join(root, SHIPPED_IDS.tracker), {
    'manifest.json': JSON.stringify(
      {
        manifest_version: 3,
        name: 'HTTP Tracker Plus',
        version: '1.0.0',
        description: 'See the redirect chain, status and hosts of the requests this tab makes.',
        permissions: ['webRequest', 'storage', 'tabs'],
        host_permissions: ['<all_urls>'],
        background: { service_worker: 'service-worker.js' },
        action: { default_title: 'HTTP Tracker Plus', default_popup: 'popup.html' },
      },
      null,
      2,
    ),
    'service-worker.js': TRACKER_WORKER,
    'popup.html': TRACKER_POPUP_HTML,
    'popup.js': TRACKER_POPUP_JS,
  });

  writeIfChanged(path.join(root, SHIPPED_IDS.rightClick), {
    'manifest.json': JSON.stringify(
      {
        manifest_version: 3,
        name: 'Absolute Enable Right Click and Copy',
        version: '1.3.0',
        description: 'Restores the right-click menu, text selection and copy on sites that block them.',
        permissions: ['storage', 'activeTab', 'scripting', 'tabs'],
        background: { service_worker: 'service-worker.js' },
        action: { default_title: 'Absolute Enable Right Click and Copy' },
        content_scripts: [
          { matches: ['<all_urls>'], js: ['content.js'], run_at: 'document_start', all_frames: true },
        ],
      },
      null,
      2,
    ),
    'service-worker.js': RIGHT_CLICK_WORKER,
    'content.js': RIGHT_CLICK_CONTENT,
  });
}

function writeIfChanged(folder: string, files: Record<string, string>): void {
  try {
    fs.mkdirSync(folder, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      const target = path.join(folder, name);
      let current = '';
      try {
        current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
      } catch {
        current = '';
      }
      if (current !== body) fs.writeFileSync(target, body, 'utf8');
    }
  } catch {
    /* a locked folder leaves that extension out; the app still starts */
  }
}

export function removeShipped(id: string): void {
  const shape = load();
  if (!shape.removedShipped.includes(id)) shape.removedShipped.push(id);
  persist(shape);
  try {
    fs.rmSync(path.join(SHIPPED_ROOT(), id), { recursive: true, force: true });
  } catch {
    /* the row is recorded as removed even when the folder refuses to go */
  }
}

export function restoreShipped(id: string): void {
  const shape = load();
  shape.removedShipped = shape.removedShipped.filter((entry) => entry !== id);
  persist(shape);
  ensureShipped();
}

export function shippedState(): { id: string; name: string; description: string; present: boolean; removed: boolean }[] {
  const shape = load();
  return SHIPPED_DEFINITIONS.map((definition) => {
    const folder = path.join(SHIPPED_ROOT(), definition.id);
    return {
      ...definition,
      present: fs.existsSync(path.join(folder, 'manifest.json')) && !shape.removedShipped.includes(definition.id),
      removed: shape.removedShipped.includes(definition.id),
    };
  });
}

/* ------------------------------------------------------------------ the report */

export function libraryReport(masterEnabled: boolean, customExtensionsEnabled: boolean): ExtensionReport {
  ensureShipped();
  const shape = load();

  const library: ExtensionItem[] = shape.items
    .filter((item) => fs.existsSync(path.join(item.folder, 'manifest.json')))
    .map((item) => ({
      ...item,
      iconPath: fs.existsSync(item.iconPath) ? item.iconPath : '',
    }));

  return {
    masterEnabled,
    customExtensionsEnabled,
    firstParty: INSTALLED_DEFINITIONS.map((definition) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      enabled: masterEnabled,
    })),
    library,
    shipped: shippedState(),
    recommended: RECOMMENDED.map((entry) => ({
      name: entry.name,
      description: entry.description,
      url: storeSearchUrl(entry.query),
      icon: entry.icon,
    })),
  };
}

/**
 * Every folder this profile should load.
 *
 * The master switch off means nothing loads. `customExtensionsEnabled` off means only the app's
 * own tools and the shipped pair load, which is what the original's two settings meant.
 */
export function profileExtensionFolders(
  profile: Profile,
  masterEnabled: boolean,
  customEnabled: boolean,
): string[] {
  if (!masterEnabled) return [];

  const firstParty = ensureFirstPartyExtensions().map((extension) => extension.dir);
  const shape = load();
  const removed = new Set(shape.removedShipped);

  const shipped = customEnabled
    ? SHIPPED_DEFINITIONS.filter((definition) => !removed.has(definition.id))
        .map((definition) => path.join(SHIPPED_ROOT(), definition.id))
        .filter((folder) => fs.existsSync(path.join(folder, 'manifest.json')))
    : [];

  const library = customEnabled
    ? shape.items
        .filter((item) => item.enabled)
        .map((item) => item.folder)
        .filter((folder) => fs.existsSync(path.join(folder, 'manifest.json')))
    : [];

  const manual = profile.tools.customExtensions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .filter((line) => {
      try {
        return fs.existsSync(path.join(line, 'manifest.json'));
      } catch {
        return false;
      }
    });

  // A folder on a command line that contains a comma splits the list, so anything imported is
  // loaded from the app's own root where no path has one.
  return dedupe([...firstParty, ...shipped, ...library, ...manual]);
}

function dedupe(folders: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const folder of folders) {
    const key = path.resolve(folder).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(folder);
  }
  return out;
}

/** The Chromium switches that load a list of folders. */
export function loadArgs(folders: string[]): string[] {
  if (folders.length === 0) return [];
  const safe = folders.filter((folder) => !folder.includes(','));
  if (safe.length === 0) return firstPartyArgs(folders.slice(0, 1));
  const joined = safe.join(',');
  return [`--load-extension=${joined}`, `--disable-extensions-except=${joined}`];
}

/** Open the folder in the OS file manager, without importing Electron into the core. */
export function revealFolder(folder: string): Promise<void> {
  return new Promise((resolve) => {
    const target = folder || Paths.extensions;
    fs.mkdirSync(target, { recursive: true });
    if (process.platform === 'win32') execFile('explorer.exe', [target], () => resolve());
    else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], () => resolve());
  });
}

/** Fetch a URL's bytes. Used for a direct .crx link, never for the store front page. */
export function download(url: string, timeoutMs = 30000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { 'user-agent': 'Mozilla/5.0 JoeBrowser/2.0' }, timeout: timeoutMs },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(download(new URL(response.headers.location, url).toString(), timeoutMs));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`The download answered ${response.statusCode}.`));
          return;
        }
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    request.on('timeout', () => request.destroy(new Error('The download timed out.')));
    request.on('error', reject);
  });
}

/**
 * Add an extension from a URL.
 *
 * A store *search* or listing page is not something the app can unpack, so it is opened in the
 * user's own browser and the app says so. A direct CRX URL works.
 */
export async function addFromUrl(url: string): Promise<{ item: ExtensionItem | null; opened: boolean; message: string }> {
  const clean = url.trim();
  if (!/^https:\/\//i.test(clean)) throw new Error('That is not an https address.');

  const isStorePage = /chromewebstore\.google\.com/i.test(clean);
  const isCrx = /\.crx($|\?)/i.test(clean) || /clients2\.google\.com\/service\/update2\/crx/i.test(clean);

  if (isCrx) {
    const data = await download(clean);
    const temp = path.join(Paths.root, `download-${Date.now()}.crx`);
    fs.writeFileSync(temp, data);
    try {
      const item = addFromCrxFile(temp);
      return { item, opened: false, message: `${item.name} was added to the library.` };
    } finally {
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        /* the temp file is cleaned on the next run */
      }
    }
  }

  if (isStorePage) {
    return {
      item: null,
      opened: true,
      message:
        'A store page cannot be unpacked automatically. The listing is open in your browser - use “Add unpacked folder” on the downloaded copy, or paste a direct .crx link.',
    };
  }

  return {
    item: null,
    opened: true,
    message: 'That link is not a .crx package, so it has been opened in your browser instead.',
  };
}

/* ------------------------------------------------------------------ sources */

const TRACKER_WORKER = `/* HTTP Tracker Plus - the included edition. No network of its own. */
const MAX = 300;
const byTab = new Map();

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const list = byTab.get(details.tabId) || [];
    const host = (() => { try { return new URL(details.url).host; } catch (e) { return ''; } })();
    list.push({ url: details.url, host, status: details.statusCode, type: details.type, at: Date.now() });
    if (list.length > MAX) list.splice(0, list.length - MAX);
    byTab.set(details.tabId, list);
    const trackers = list.filter((entry) => isTracker(entry.host)).length;
    chrome.action.setBadgeText({ tabId: details.tabId, text: String(trackers) });
    chrome.action.setBadgeBackgroundColor({ tabId: details.tabId, color: '#5B9BF7' });
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const list = byTab.get(details.tabId) || [];
    list.push({ url: details.redirectUrl || details.url, host: (() => { try { return new URL(details.redirectUrl || details.url).host; } catch (e) { return ''; } })(), status: details.statusCode, type: 'redirect', at: Date.now() });
    byTab.set(details.tabId, list);
  },
  { urls: ['<all_urls>'] }
);

const TRACKERS = ['doubleclick.net','googlesyndication.com','google-analytics.com','googletagmanager.com','facebook.net','connect.facebook.net','scorecardresearch.com','hotjar.com','mixpanel.com','segment.io','criteo.com','taboola.com','outbrain.com','adnxs.com','quantserve.com'];
function isTracker(host) { return !!host && TRACKERS.some((needle) => host === needle || host.endsWith('.' + needle)); }

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (!message || message.type !== 'joe-tracker') return false;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    respond({ requests: (tab && byTab.get(tab.id)) || [] });
  });
  return true;
});`;

const TRACKER_POPUP_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
body{font:13px/1.45 -apple-system,Segoe UI,system-ui,sans-serif;margin:0;background:#171a21;color:#e8edf5;width:380px}
h1{font-size:13px;font-weight:650;margin:0;padding:12px 14px;border-bottom:1px solid #262c37;display:flex;justify-content:space-between}
h1 span{color:#7c8899;font-weight:500}
ul{list-style:none;margin:0;padding:0;max-height:420px;overflow:auto}
li{display:grid;grid-template-columns:34px 1fr;gap:8px;padding:7px 14px;border-bottom:1px solid #1e242e;font-size:12px}
li b{color:#5B9BF7;font-weight:600}
li i{display:block;color:#7c8899;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}
.t{color:#ffb454}
.empty{padding:26px 14px;color:#7c8899;text-align:center}
</style></head><body>
<h1>HTTP Tracker Plus <span id="count"></span></h1>
<ul id="list"></ul>
<script src="popup.js"></script>
</body></html>`;

const TRACKER_POPUP_JS = `const list = document.getElementById('list');
const count = document.getElementById('count');
chrome.runtime.sendMessage({ type: 'joe-tracker' }, (response) => {
  const requests = (response && response.requests) || [];
  count.textContent = requests.length + ' requests';
  if (requests.length === 0) {
    list.innerHTML = '<li class="empty" style="display:block">Nothing recorded on this tab yet.</li>';
    return;
  }
  list.innerHTML = requests.slice().reverse().map((entry) => {
    const tracker = /doubleclick|googlesyndication|google-analytics|googletagmanager|facebook|hotjar|mixpanel|segment|criteo|taboola|outbrain|adnxs|quantserve/.test(entry.host || '');
    return '<li><b class="' + (tracker ? 't' : '') + '">' + (entry.status || entry.type) + '</b><div><span class="' + (tracker ? 't' : '') + '">' + String(entry.host) + '</span><i title="' + String(entry.url) + '">' + String(entry.url) + '</i></div></li>';
  }).join('');
});`;

const RIGHT_CLICK_WORKER = `/* Absolute Enable Right Click and Copy - the included edition. */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ enabled: true }, (values) => {
    chrome.action.setBadgeText({ text: values.enabled ? '' : 'off' });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message && message.type === 'joe-rc-state') {
    chrome.storage.local.get({ enabled: true }, (values) => respond({ enabled: values.enabled }));
    return true;
  }
  return false;
});`;

const RIGHT_CLICK_CONTENT = `(function () {
  'use strict';
  if (window.__joeRightClickPlus) return;
  window.__joeRightClickPlus = true;

  var blocked = ['contextmenu', 'copy', 'cut', 'selectstart', 'dragstart', 'mousedown', 'mouseup', 'keydown', 'keyup', 'paste'];
  function stop(event) {
    var key = event.type;
    if (key === 'keydown' || key === 'keyup') {
      /* Only the keys a page uses to block copy and dev tools, never ordinary typing. */
      if (event.key !== 'F12' && !(event.ctrlKey && ['c', 'v', 'x', 'a', 's', 'u', 'p'].indexOf(String(event.key).toLowerCase()) >= 0)) return;
    }
    event.stopPropagation();
  }
  blocked.forEach(function (type) { window.addEventListener(type, stop, true); });

  var style = document.createElement('style');
  style.textContent = '*{user-select:text !important;-webkit-user-select:text !important;-moz-user-select:text !important;}' +
    'html,body{overflow:auto !important}';
  var attach = function () {
    if (document.head) document.head.appendChild(style);
    else if (document.documentElement) document.documentElement.appendChild(style);
    else document.addEventListener('DOMContentLoaded', attach, { once: true });
  };
  attach();
})();`;
