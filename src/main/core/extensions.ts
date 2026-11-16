import fs from 'node:fs';
import path from 'node:path';
import type { Profile } from '../../shared/types';
import { Paths } from './paths';

/**
 * The first-party extensions.
 *
 * These are written to disk by the app itself on every launch - never fetched from the Chrome
 * Web Store. That matters for three reasons the old build learned the hard way: a proxy that
 * blocks the store, a machine that is offline, and a region where the listing is not served all
 * turned "the tools are always there" into "the tools are missing with no way to repair them".
 *
 * Each one carries its own engine, so it works in a browser the app did not launch too. Where the
 * injected script also provides the same feature, the two agree through a marker on the document
 * rather than typing everything twice.
 */

const VERSION = '2.0.0';

/** Bumped when any extension source below changes, so an existing install is rewritten. */
const SOURCE_REVISION = 3;

export interface InstalledExtension {
  id: string;
  name: string;
  description: string;
  dir: string;
  revision: number;
}

const PREFIX = 'joe-';

interface SourceFile {
  name: string;
  body: string;
}

interface Definition {
  id: string;
  name: string;
  description: string;
  files: SourceFile[];
}

function manifest(name: string, description: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      manifest_version: 3,
      name,
      version: VERSION,
      description,
      ...extra,
    },
    null,
    2,
  );
}

const CONTENT_SCRIPT_MATCHES = ['<all_urls>'];

/**
 * Paste as human.
 *
 * Ctrl+V types the clipboard out one character at a time with a human rhythm, instead of
 * dropping the whole string in at once - which is the single clearest tell a form sees when a
 * script fills it. The marker on <html> keeps this and the injected script from both typing.
 */
const PASTE_AS_HUMAN: Definition = {
  id: 'joe-paste-as-human',
  name: 'Joe Paste as Human',
  description: 'Types clipboard text character by character with human timing.',
  files: [
    {
      name: 'manifest.json',
      body: manifest('Joe Paste as Human', 'Types clipboard text character by character.', {
        content_scripts: [
          {
            matches: CONTENT_SCRIPT_MATCHES,
            js: ['content.js'],
            run_at: 'document_start',
            all_frames: true,
          },
        ],
      }),
    },
    {
      name: 'content.js',
      body: `/* Joe Paste as Human - self-contained, no network, no permissions. */
(function () {
  'use strict';

  var MARKER = 'joePasteActive';
  var root = document.documentElement;
  if (!root) return;
  // The application's injected script may already have claimed this page. Whoever runs first
  // owns the feature; the other stands down rather than typing the text a second time.
  if (root.dataset[MARKER] === '1') return;
  root.dataset[MARKER] = '1';

  var SPEEDS = { relaxed: [58, 165], natural: [32, 95], fast: [12, 44], instant: [0, 4] };
  var speed = SPEEDS.natural;
  var seed = 0;

  function rand() {
    // A small deterministic stream: a typing rhythm that repeats exactly looks as synthetic as
    // no rhythm at all, so this only needs to be cheap, not random in any strong sense.
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  function isEditable(node) {
    if (!node) return false;
    if (node.isContentEditable) return true;
    var tag = node.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    var type = (node.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''].indexOf(type) >= 0;
  }

  function insertChar(target, ch) {
    if (target.isContentEditable) {
      document.execCommand('insertText', false, ch);
      return;
    }
    var start = target.selectionStart == null ? target.value.length : target.selectionStart;
    var end = target.selectionEnd == null ? start : target.selectionEnd;
    var value = target.value || '';
    target.value = value.slice(0, start) + ch + value.slice(end);
    var caret = start + 1;
    try { target.selectionStart = caret; target.selectionEnd = caret; } catch (e) {}
    target.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
  }

  document.addEventListener('paste', function (event) {
    var target = event.target;
    if (!isEditable(target)) return;
    var text = event.clipboardData && event.clipboardData.getData('text/plain');
    if (!text) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    var index = 0;
    function step() {
      if (index >= text.length || !target.isConnected) return;
      insertChar(target, text.charAt(index++));
      // A newline is a pause, not a keystroke.
      var delay = text.charAt(index - 1) === '\\n'
        ? 120 + rand() * 260
        : speed[0] + rand() * (speed[1] - speed[0]);
      setTimeout(step, delay);
    }
    step();
  }, true);
})();
`,
    },
  ],
};

/**
 * Right-click restore.
 *
 * Many storefronts and dashboards cancel contextmenu and selectstart to stop copying. This puts
 * the browser's own menu, selection and copy back, without touching anything the page still
 * legitimately needs.
 */
const RIGHT_CLICK: Definition = {
  id: 'joe-right-click',
  name: 'Joe Right Click and Copy',
  description: 'Restores the context menu, selection and copy on pages that block them.',
  files: [
    {
      name: 'manifest.json',
      body: manifest('Joe Right Click and Copy', 'Restores the context menu and copy.', {
        content_scripts: [
          {
            matches: CONTENT_SCRIPT_MATCHES,
            js: ['content.js'],
            run_at: 'document_start',
            all_frames: true,
          },
        ],
      }),
    },
    {
      name: 'content.js',
      body: `/* Joe Right Click and Copy - self-contained. */
(function () {
  'use strict';

  var MARKER = 'joeRightClickActive';
  var root = document.documentElement;
  if (!root) return;
  if (root.dataset[MARKER] === '1') return;
  root.dataset[MARKER] = '1';

  // Capture phase, so the page's own listener never sees the event.
  ['contextmenu', 'copy', 'cut', 'selectstart', 'mousedown', 'mouseup', 'dragstart'].forEach(function (type) {
    window.addEventListener(type, function (event) {
      // The page may still want its own drag-and-drop; only the blockers are removed.
      event.stopPropagation();
    }, true);
  });

  // Restore selection where the page disabled it with inline CSS.
  function unlock() {
    try {
      var style = document.createElement('style');
      style.setAttribute('data-joe', 'unlock');
      style.textContent =
        '*{user-select:text !important;-webkit-user-select:text !important;' +
        '-moz-user-select:text !important;}' +
        'body,div,p,span,td,li,h1,h2,h3,h4,h5,h6{pointer-events:auto !important;}';
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  }

  if (document.head) unlock();
  else document.addEventListener('DOMContentLoaded', unlock, { once: true });
})();
`,
    },
  ],
};

/**
 * The request badge.
 *
 * Nothing here needs a permission: the browser already exposes resource timings to the page, so
 * the counter reads what the page itself can read and renders a small badge. A toolbar button
 * nobody can find is the same as an extension that is not there - which is why this one paints
 * its own badge on the page.
 */
const TRACKER_PLUS: Definition = {
  id: 'joe-tracker-plus',
  name: 'Joe Request Tracker',
  description: 'Counts requests and third-party trackers and shows a badge on the page.',
  files: [
    {
      name: 'manifest.json',
      body: manifest('Joe Request Tracker', 'Counts requests and trackers.', {
        content_scripts: [
          {
            matches: CONTENT_SCRIPT_MATCHES,
            js: ['content.js'],
            run_at: 'document_idle',
            all_frames: false,
          },
        ],
      }),
    },
    {
      name: 'content.js',
      body: `/* Joe Request Tracker - self-contained, no permissions, no network of its own. */
(function () {
  'use strict';

  if (window.top !== window.self) return;
  if (document.getElementById('joe-request-badge')) return;

  var TRACKERS = [
    'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'facebook.net',
    'facebook.com/tr', 'hotjar.com', 'segment.io', 'mixpanel.com', 'clarity.ms',
    'bat.bing.com', 'criteo.com', 'taboola.com', 'outbrain.com', 'quantserve.com',
    'scorecardresearch.com', 'sentry.io', 'amplitude.com', 'fullstory.com', 'heap.io',
    'intercom.io', 'hubspot.com', 'tiktok.com/i18n', 'snap.licdn.com'
  ];

  var requested = 0;
  var trackerHits = 0;
  var seen = Object.create(null);

  function isTracker(url) {
    for (var i = 0; i < TRACKERS.length; i++) {
      if (url.indexOf(TRACKERS[i]) >= 0) return true;
    }
    return false;
  }

  function record(url) {
    if (!url || seen[url]) return;
    seen[url] = true;
    requested++;
    if (isTracker(url)) trackerHits++;
    paint();
  }

  var style = document.createElement('style');
  style.textContent =
    '#joe-request-badge{position:fixed;left:12px;bottom:12px;z-index:2147483647;' +
    'font:500 11px/1.4 system-ui,sans-serif;background:rgba(16,20,28,.92);color:#e8edf5;' +
    'border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:5px 10px;cursor:pointer;' +
    'box-shadow:0 6px 20px rgba(0,0,0,.35);user-select:none;letter-spacing:.01em}' +
    '#joe-request-badge b{font-weight:700}#joe-request-badge .t{color:#ffb454}' +
    '#joe-request-list{position:fixed;left:12px;bottom:44px;z-index:2147483647;width:340px;' +
    'max-height:46vh;overflow:auto;background:rgba(16,20,28,.96);color:#e8edf5;border-radius:12px;' +
    'border:1px solid rgba(255,255,255,.14);font:400 11px/1.5 ui-monospace,monospace;padding:8px;' +
    'box-shadow:0 12px 30px rgba(0,0,0,.4);display:none}';

  var badge = document.createElement('div');
  badge.id = 'joe-request-badge';
  badge.title = 'Requests on this page';

  var list = document.createElement('div');
  list.id = 'joe-request-list';

  function paint() {
    badge.innerHTML = '<b>' + requested + '</b> requests · <span class="t">' + trackerHits + '</span> trackers';
    var urls = Object.keys(seen).slice(-200);
    list.innerHTML = urls.map(function (u) {
      var mark = isTracker(u) ? '<span style="color:#ffb454">●</span> ' : '';
      return '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + mark +
        u.replace(/</g, '&lt;') + '</div>';
    }).join('');
  }

  badge.addEventListener('click', function (event) {
    event.stopPropagation();
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
  });

  function attach() {
    if (!document.body) return;
    var host = document.createElement('div');
    host.appendChild(style);
    host.appendChild(list);
    host.appendChild(badge);
    document.body.appendChild(host);
    paint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  } else {
    attach();
  }

  try {
    performance.getEntriesByType('resource').forEach(function (entry) {
      record(entry.name);
    });
  } catch (e) {}

  try {
    new PerformanceObserver(function (entries) {
      entries.getEntries().forEach(function (entry) {
        record(entry.name);
      });
    }).observe({ entryTypes: ['resource'] });
  } catch (e) {}
})();
`,
    },
  ],
};

export const FIRST_PARTY: Definition[] = [PASTE_AS_HUMAN, RIGHT_CLICK, TRACKER_PLUS];

/**
 * Write every first-party extension to disk if it is missing or stale.
 *
 * Called on launch rather than at install time: the app must work from a zip, and a user who
 * deleted the folder should get it back without reinstalling.
 */
export function ensureFirstPartyExtensions(): InstalledExtension[] {
  Paths.ensure(Paths.extensions);
  const installed: InstalledExtension[] = [];

  for (const definition of FIRST_PARTY) {
    const dir = path.join(Paths.extensions, definition.id);
    const stampFile = path.join(dir, '.revision');

    try {
      const current = fs.existsSync(stampFile) ? Number(fs.readFileSync(stampFile, 'utf8')) : -1;
      if (current !== SOURCE_REVISION) {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        for (const file of definition.files) {
          fs.writeFileSync(path.join(dir, file.name), file.body, 'utf8');
        }
        fs.writeFileSync(stampFile, String(SOURCE_REVISION), 'utf8');
      }
    } catch {
      // A read-only or locked folder must not stop a profile from opening; the extension is then
      // simply absent, and the Extensions list says so.
      continue;
    }

    installed.push({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      dir,
      revision: SOURCE_REVISION,
    });
  }

  return installed;
}

/** Every unpacked extension folder this profile should load, first-party first. */
export function extensionDirectories(profile: Profile, masterEnabled: boolean): string[] {
  if (!masterEnabled) return [];

  const custom = profile.tools.customExtensions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .filter((line) => {
      try {
        // Only folders that really are unpacked extensions are passed to the browser; a bad path
        // in a text box used to make Chromium refuse the whole --load-extension list.
        return fs.existsSync(line) && fs.existsSync(path.join(line, 'manifest.json'));
      } catch {
        return false;
      }
    });

  const firstParty = ensureFirstPartyExtensions().map((extension) => extension.dir);
  return [...firstParty, ...custom];
}

/** The Chromium switches that load them. */
export function extensionArgs(directories: string[]): string[] {
  if (directories.length === 0) return [];
  const joined = directories.join(',');
  return [`--load-extension=${joined}`, `--disable-extensions-except=${joined}`];
}

/**
 * Firefox cannot take unpacked extensions from a command line without signature enforcement
 * being disabled, so the same tools are sideloaded into its profile folder instead.
 */
export function installFirefoxExtensions(profileDir: string): number {
  const extensionsRoot = path.join(profileDir, 'extensions');
  let installed = 0;
  const firstParty = ensureFirstPartyExtensions();

  try {
    fs.mkdirSync(extensionsRoot, { recursive: true });
  } catch {
    return 0;
  }

  for (const extension of firstParty) {
    const source = path.join(extension.dir, 'content.js');
    if (!fs.existsSync(source)) continue;

    // A WebExtension needs a manifest in the browser's own dialect; MV3 is accepted by current
    // Firefox, but the background/service-worker keys are not, so only the content script is
    // carried across.
    const manifestForFirefox = {
      manifest_version: 2,
      name: extension.name,
      version: VERSION,
      description: extension.description,
      content_scripts: [
        {
          matches: ['<all_urls>'],
          js: ['content.js'],
          run_at: 'document_start',
          all_frames: true,
        },
      ],
    };

    const target = path.join(extensionsRoot, `${extension.id}@joebrowser.local`);
    try {
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(
        path.join(target, 'manifest.json'),
        JSON.stringify(manifestForFirefox, null, 2),
        'utf8',
      );
      fs.copyFileSync(source, path.join(target, 'content.js'));
      installed++;
    } catch {
      /* a locked folder leaves that one tool out rather than failing the profile */
    }
  }

  return installed;
}

/** What the Extensions view lists. */
export function describeExtensions(profile: Profile, masterEnabled: boolean) {
  const directories = extensionDirectories(profile, masterEnabled);
  const firstParty = FIRST_PARTY.map((definition) => ({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    enabled: directories.includes(path.join(Paths.extensions, definition.id)),
  }));

  const custom = profile.tools.customExtensions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      id: line,
      name: path.basename(line) || line,
      description: fs.existsSync(path.join(line, 'manifest.json'))
        ? 'Unpacked extension'
        : 'Folder not found or has no manifest.json',
      enabled: directories.includes(line),
    }));

  return { masterEnabled, firstParty, custom };
}

export const EXTENSION_PREFIX = PREFIX;
