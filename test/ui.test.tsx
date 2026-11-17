import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

/**
 * The interface, rendered.
 *
 * A typecheck proves a component compiles; it does not prove it survives its first render.
 * Every page here is mounted for real in a DOM, with the same mock bridge the browser preview
 * uses, and any React warning is treated as a failure - because the warnings that appear here
 * (a missing key, an invalid prop, a state update after unmount) are exactly the ones that
 * show up as a flicker or a broken list in the packaged app.
 *
 * The last test is the one that keeps the interface honest as it grows: every key a page asks
 * for has to exist in the English table, or a user in another language falls back to a raw dotted
 * identifier in the middle of a sentence.
 */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const win = dom.window as unknown as Window & typeof globalThis;

/**
 * Node 22 exposes some of these as getter-only globals, so they are redefined rather than
 * assigned. React reads them off the global object, not off `window`.
 */
function install(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

install('window', win);
install('document', win.document);
install('navigator', win.navigator);
install('HTMLElement', win.HTMLElement);
install('HTMLCanvasElement', win.HTMLCanvasElement);
install('HTMLInputElement', win.HTMLInputElement);
install('Element', win.Element);
install('Node', win.Node);
install('Event', win.Event);
install('CustomEvent', win.CustomEvent);
install('MouseEvent', win.MouseEvent);
install('KeyboardEvent', win.KeyboardEvent);
install('getComputedStyle', win.getComputedStyle.bind(win));
install('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0));
install('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
install('IS_REACT_ACT_ENVIRONMENT', true);

const React = await import('react');
const { createRoot } = await import('react-dom/client');

// React 18.3 exports act from the package itself; react-dom/test-utils' copy is deprecated and
// logs a warning that this suite would rightly treat as a failure.
const act = (React as unknown as { act: typeof import('react')['act'] }).act;

const { App } = await import('../src/renderer/App');
const { ProfilesPage } = await import('../src/renderer/pages/ProfilesPage');
const { ProfileEditor } = await import('../src/renderer/pages/ProfileEditor');
const { HistoryPage } = await import('../src/renderer/pages/HistoryPage');
const { ProxiesPage } = await import('../src/renderer/pages/ProxiesPage');
const { ExtensionsPage } = await import('../src/renderer/pages/ExtensionsPage');
const { BrowsersPage } = await import('../src/renderer/pages/BrowsersPage');
const { ToolsPage } = await import('../src/renderer/pages/ToolsPage');
const { SettingsPage } = await import('../src/renderer/pages/SettingsPage');
const { AboutPage } = await import('../src/renderer/pages/AboutPage');
const { LeakModal } = await import('../src/renderer/pages/LeakModal');
const { BatchCreateModal } = await import('../src/renderer/pages/BatchCreateModal');
const { mockBridge } = await import('../src/renderer/bridge');
const { I18nProvider } = await import('../src/renderer/i18n');
const { ToastProvider } = await import('../src/renderer/components/UI');
const { ENGLISH_TABLE, allKeys, coverageOf } = await import('../src/shared/i18n');
const { encodeQr, qrPath } = await import('../src/shared/qr');
const { AccountGate, LockScreen } = await import('../src/renderer/pages/AccountGate');
const { SecurityPanel } = await import('../src/renderer/pages/SecurityPanel');

// The bridge the renderer expects, installed before any component looks for it.
(win as unknown as { joe: unknown }).joe = mockBridge;

const problems: string[] = [];
const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args: unknown[]) => {
  problems.push(String(args[0]));
};
console.warn = (...args: unknown[]) => {
  const first = String(args[0]);
  // React's dev build warns about act() around an async effect; that is the harness, not the app.
  if (first.includes('not wrapped in act')) return;
  problems.push(first);
};

const container = win.document.getElementById('root')!;
let liveRoot: ReturnType<typeof createRoot> | null = null;

/** Mount and keep it mounted: what a user sees is the tree on screen, not a torn-down one. */
/**
 * A page on its own still needs the two providers the shell supplies: the language table and the
 * toast queue. Mounting without them is not a test of the page, it is a test of the harness.
 */
function hosted(element: React.ReactElement): React.ReactElement {
  return React.createElement(
    I18nProvider,
    { language: 'en' },
    React.createElement(ToastProvider, null, element),
  );
}

async function render(element: React.ReactElement): Promise<void> {
  if (liveRoot) {
    await act(async () => {
      liveRoot!.unmount();
    });
    liveRoot = null;
  }
  container.innerHTML = '';
  liveRoot = createRoot(container);

  await act(async () => {
    liveRoot!.render(element);
    await Promise.resolve();
  });
  // Let the pages' own data loads settle before anything is asserted.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 45));
  });
}

async function teardown(): Promise<void> {
  if (!liveRoot) return;
  const root = liveRoot;
  liveRoot = null;
  await act(async () => {
    root.unmount();
  });
}

function text(): string {
  return container.textContent ?? '';
}

function reset(): void {
  problems.length = 0;
}

test.after(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

/* ------------------------------------------------------------------ the shell */

test('the window mounts and paints the profile list', async () => {
  reset();
  await render(React.createElement(App));

  const body = text();
  assert.ok(body.includes('Joe Browser'), 'the brand is missing');
  assert.ok(body.includes('Profiles'), 'the profile page heading is missing');
  assert.ok(body.includes('Shop UK'), 'the sample profiles did not render');

  // Eight destinations: five workspace, three system. A page that loses its entry is a page
  // nobody can reach.
  const navButtons = [...container.querySelectorAll('.nav-item')];
  assert.equal(navButtons.length, 8, `expected 8 nav entries, found ${navButtons.length}`);

  const labels = navButtons.map((button) => (button.textContent ?? '').trim());
  for (const expected of ['Profiles', 'History', 'Proxies', 'Extensions', 'Tools', 'Browsers', 'Settings', 'About']) {
    assert.ok(
      labels.some((label) => label.includes(expected)),
      `the rail is missing ${expected}`,
    );
  }

  // The empty-state action and the header action both exist; the header one is always there.
  assert.ok(
    container.querySelector('.header-actions') !== null,
    'the header carries no actions',
  );

  assert.deepEqual(problems, [], `React reported problems: ${problems.join(' | ')}`);

  await teardown();
});

test('the rail can be collapsed without losing a destination', async () => {
  reset();
  await render(React.createElement(App));

  const toggle = [...container.querySelectorAll('.rail-foot button')].find((button) =>
    (button.getAttribute('title') ?? '').toLowerCase().includes('collapse'),
  );
  assert.ok(toggle, 'the rail has no collapse control');

  await act(async () => {
    toggle!.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  });

  assert.ok(container.querySelector('.shell.narrow') !== null, 'the rail did not collapse');
  assert.equal(container.querySelectorAll('.nav-item').length, 8, 'a destination vanished with the rail');
  assert.deepEqual(problems, [], `rail: ${problems.join(' | ')}`);

  await teardown();
});

test('every nav entry navigates to a page that renders', async () => {
  for (const [index, expected] of [
    [1, 'History'],
    [2, 'Proxies'],
    [3, 'Extensions'],
    [4, 'Tools'],
    [5, 'Browsers'],
    [6, 'Settings'],
    [7, 'About'],
  ] as [number, string][]) {
    reset();
    await render(React.createElement(App));

    const button = container.querySelectorAll('.nav-item')[index];
    assert.ok(button, `nav entry ${index} is missing`);

    await act(async () => {
      button.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 45));
    });

    assert.ok(text().includes(expected), `the ${expected} page did not render`);
    assert.deepEqual(problems, [], `${expected}: ${problems.join(' | ')}`);
  }

  await teardown();
});

/* ------------------------------------------------------------------ the pages */

test('every page renders on its own', async () => {
  const profiles = await mockBridge.listProfiles();
  const settings = await mockBridge.getSettings();
  const info = await mockBridge.getAppInfo();
  const noop = () => undefined;
  const running = new Map();
  const refresh = async () => undefined;

  const cases: [string, React.ReactElement, string][] = [
    [
      'ProfilesPage',
      React.createElement(ProfilesPage, { profiles, runningById: running, settings, saveSettings: async () => settings, refresh, toast: { toast: noop } as never }),
      'Profiles',
    ],
    ['HistoryPage', React.createElement(HistoryPage, { profiles }), 'History'],
    ['ProxiesPage', React.createElement(ProxiesPage, { profiles, refreshProfiles: refresh }), 'Proxies'],
    [
      'ExtensionsPage',
      React.createElement(ExtensionsPage, { settings, saveSettings: async () => settings }),
      'Extensions',
    ],
    ['BrowsersPage', React.createElement(BrowsersPage, { settings, saveSettings: async () => settings }), 'Browsers'],
    [
      'ToolsPage',
      React.createElement(ToolsPage, { profiles, refreshProfiles: refresh, onNavigate: noop }),
      'Tools',
    ],
    [
      'SettingsPage',
      React.createElement(SettingsPage, { settings, info, saveSettings: async () => settings, refreshProfiles: refresh }),
      'Settings',
    ],
    ['AboutPage', React.createElement(AboutPage, { info, profiles }), 'About'],
  ];

  for (const [name, element, expected] of cases) {
    reset();
    await render(hosted(element));
    assert.ok(text().toLowerCase().includes(expected.toLowerCase()), `${name} did not render`);
    assert.deepEqual(problems, [], `${name}: ${problems.join(' | ')}`);
  }

  await teardown();
});

test('the dialogs open with a profile behind them', async () => {
  const profiles = await mockBridge.listProfiles();
  const settings = await mockBridge.getSettings();
  const first = profiles[0]!;

  reset();
  await render(hosted(React.createElement(LeakModal, { profile: first, onClose: () => undefined })));
  // Either the report or its loading state has to be on screen; a blank dialog is a bug.
  assert.ok(text().length > 40, 'the fingerprint dialog rendered nothing');
  assert.deepEqual(problems, [], `LeakModal: ${problems.join(' | ')}`);

  reset();
  await render(hosted(React.createElement(BatchCreateModal, { settings, onClose: () => undefined, onCreated: () => undefined })));
  assert.ok(text().includes('Batch'), 'the batch dialog did not render');
  assert.deepEqual(problems, [], `BatchCreateModal: ${problems.join(' | ')}`);

  // The editor takes a full profile, not the summary the list carries.
  const full = (await mockBridge.getProfile(first.id))!;

  reset();
  await render(hosted(
    React.createElement(ProfileEditor, {
      profile: full,
      onClose: () => undefined,
      onSaved: () => undefined,
      settings,
      existing: profiles,
      toast: { toast: () => undefined } as never,
    }),
  ));
  assert.ok(text().includes('General'), 'the editor tabs are missing');
  assert.ok(text().includes('Fingerprint'), 'the fingerprint tab is missing');

  await teardown();
});

test('an empty store shows the empty state rather than a blank page', async () => {
  reset();
  const settings = await mockBridge.getSettings();
  await render(hosted(
    React.createElement(ProfilesPage, {
      profiles: [],
      runningById: new Map(),
      settings,
      saveSettings: async () => settings,
      refresh: async () => undefined,
      toast: { toast: () => undefined } as never,
    }),
  ));
  assert.deepEqual(problems, [], `empty state: ${problems.join(' | ')}`);

  // Whatever the copy says, an empty store has to offer a way out of itself.
  const buttons = [...container.querySelectorAll('button')].map((button) => (button.textContent ?? '').toLowerCase());
  assert.ok(
    buttons.some((label) => label.includes('new profile') || label.includes('create')),
    'the empty state has no create action',
  );

  await teardown();
});

test('every interactive control carries a name a person can hear', async () => {
  const profiles = await mockBridge.listProfiles();
  const settings = await mockBridge.getSettings();
  await render(hosted(
    React.createElement(ProfilesPage, {
      profiles,
      runningById: new Map(),
      settings,
      saveSettings: async () => settings,
      refresh: async () => undefined,
      toast: { toast: () => undefined } as never,
    }),
  ));

  const buttons = [...container.querySelectorAll('button')];
  assert.ok(buttons.length > 0, 'no buttons rendered');

  // A button whose only content is an icon still needs a name, or it is silent to a screen
  // reader and unguessable to a keyboard user.
  const unnamed = buttons.filter((button) => {
    const label = (button.textContent ?? '').trim();
    const aria = button.getAttribute('aria-label') ?? button.getAttribute('title') ?? '';
    return label.length === 0 && aria.trim().length === 0;
  });

  assert.deepEqual(
    unnamed.map((b) => b.outerHTML.slice(0, 120)),
    [],
    'these buttons have no accessible name',
  );
});

/* ------------------------------------------------------------------ the gate */

test('the gate and the lock both render and can be dismissed', async () => {
  const settings = await mockBridge.getSettings();

  reset();
  await render(hosted(React.createElement(AccountGate, { onDone: () => undefined })));
  const body = text();
  assert.ok(body.includes('Joe Browser'), 'the gate does not name the product');
  assert.ok(
    body.toLowerCase().includes('create an account') || body.toLowerCase().includes('sign in'),
    'the gate offers no way in',
  );
  // The gate has to be escapable: a first-run window with no way past it is a hostage.
  assert.ok(
    body.toLowerCase().includes('without an account'),
    'the gate offers no way to skip it',
  );
  assert.deepEqual(problems, [], `AccountGate: ${problems.join(' | ')}`);

  reset();
  const lock = {
    state: 'locked' as const,
    account: {
      email: 'joe@example.com',
      displayName: 'Joe',
      created: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      pinEnabled: true,
      twoFactorEnabled: true,
    },
    pin: true,
    totp: true,
  };
  await render(
    hosted(React.createElement(LockScreen, { lock, onUnlocked: () => undefined, onSignOut: () => undefined })),
  );
  const lockBody = text();
  assert.ok(lockBody.includes('Joe'), 'the lock screen does not name the account');
  assert.ok(lockBody.toLowerCase().includes('unlock'), 'the lock screen has no unlock action');
  assert.deepEqual(problems, [], `LockScreen: ${problems.join(' | ')}`);

  reset();
  await render(
    hosted(
      React.createElement(SecurityPanel, {
        settings,
        saveSettings: async () => settings,
        account: lock.account,
        onAccountChanged: () => undefined,
      }),
    ),
  );
  const security = text();
  assert.ok(security.includes('Security'), 'the security panel has no heading');
  assert.ok(security.includes('2FA') || security.includes('Two-factor'), 'the second factor is missing');
  assert.deepEqual(problems, [], `SecurityPanel: ${problems.join(' | ')}`);

  await teardown();
});

/* ------------------------------------------------------------------ the second factor */

test('the QR encoder produces a symbol for an otpauth URI', () => {
  const uri =
    'otpauth://totp/Joe%20Browser:me%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Joe%20Browser';
  const code = encodeQr(uri);
  assert.ok(code, 'the URI did not fit any version');
  assert.equal(code.size, code.version * 4 + 17);

  // Every finder pattern corner has to be the right shape, or no scanner will locate the symbol.
  const dark = (x: number, y: number): boolean => code.modules[y]![x]!;
  for (const [ox, oy] of [
    [0, 0],
    [code.size - 7, 0],
    [0, code.size - 7],
  ] as [number, number][]) {
    assert.equal(dark(ox, oy), true, `finder corner at ${ox},${oy} is not dark`);
    assert.equal(dark(ox + 3, oy + 3), true, 'the finder centre is not dark');
    assert.equal(dark(ox + 1, oy + 1), false, 'the finder ring is not light');
  }

  // The always-dark module, which the original wrote into the wrong corner.
  assert.equal(dark(8, code.size - 8), true, 'the dark module is missing');

  const path = qrPath(code);
  assert.ok(path.startsWith('M'), 'the path is empty');
  assert.ok(path.includes('h1v1h-1z'), 'the path is not made of modules');

  // Too much text for version 9 must be refused rather than silently truncated into a code
  // that scans as something else.
  assert.equal(encodeQr('x'.repeat(400)), null);
});

/* ------------------------------------------------------------------ the language table */

test('every key the interface asks for exists in the English table', () => {
  const known = new Set(allKeys());

  // The pages are read from source rather than from the bundle, so this catches a key that was
  // typed into a component the render tests above never happened to exercise.
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) files.push(full);
    }
  };
  walk('src/renderer');
  assert.ok(files.length > 8, `only ${files.length} renderer sources were found`);

  const used = new Map<string, string>();
  for (const file of files) {
    const body = readFileSync(file, 'utf8');
    for (const match of body.matchAll(/\bt\(\s*'([^']+)'/g)) {
      if (!used.has(match[1]!)) used.set(match[1]!, file);
    }
  }

  assert.ok(used.size > 250, `only ${used.size} literal keys were found; the scan is broken`);

  const missing = [...used].filter(([key]) => !known.has(key));
  assert.deepEqual(
    missing.map(([key, file]) => `${key} (${path.basename(file)})`),
    [],
    'these keys have no English string',
  );
});

test('the coverage figures are the real thing and never claim more than exists', () => {
  const english = Object.keys(ENGLISH_TABLE).length;
  assert.ok(english > 500, `the English table looks truncated at ${english} keys`);

  for (const language of ['de', 'ru', 'es', 'fr', 'pt', 'it', 'nl', 'pl', 'tr', 'uk', 'ar', 'zh', 'ja', 'ko']) {
    const coverage = coverageOf(language);
    assert.ok(coverage > 0, `${language} has no coverage`);
    assert.ok(coverage < 100, `${language} claims a complete table; it is a partial one`);
  }

  // English is the contract and is complete by definition.
  assert.equal(coverageOf('en'), 100);
});
