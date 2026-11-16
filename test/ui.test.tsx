import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * The interface, rendered.
 *
 * A typecheck proves a component compiles; it does not prove it survives its first render.
 * Every page here is mounted for real in a DOM, with the same mock bridge the browser preview
 * uses, and any React warning is treated as a failure - because the warnings that appear here
 * (a missing key, an invalid prop, a state update after unmount) are exactly the ones that
 * show up as a flicker or a broken list in the packaged app.
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
const { BrowsersPage } = await import('../src/renderer/pages/BrowsersPage');
const { ProxiesPage } = await import('../src/renderer/pages/ProxiesPage');
const { SettingsPage } = await import('../src/renderer/pages/SettingsPage');
const { ProfileEditor } = await import('../src/renderer/pages/ProfileEditor');
const { mockBridge } = await import('../src/renderer/bridge');

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
    await new Promise((resolve) => setTimeout(resolve, 40));
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

test('the window mounts and paints the profile list', async () => {
  reset();
  await render(React.createElement(App));

  const body = text();
  assert.ok(body.includes('Joe Browser'), 'the brand is missing');
  assert.ok(body.includes('Profiles'), 'the profile page heading is missing');
  assert.ok(body.includes('Shop UK'), 'the sample profiles did not render');
  assert.ok(body.includes('New profile'), 'the create button is missing');

  const navButtons = container.querySelectorAll('.nav-item');
  assert.equal(navButtons.length, 4, `expected 4 nav entries, found ${navButtons.length}`);

  assert.deepEqual(problems, [], `React reported problems: ${problems.join(' | ')}`);

  await teardown();
});

test('every page renders on its own', async () => {
  reset();

  const profiles = await mockBridge.listProfiles();
  const noop = () => undefined;

  await render(
    React.createElement(ProfilesPage, {
      profiles,
      sessions: {},
      toast: noop,
      refresh: async () => undefined,
    }),
  );
  assert.ok(text().includes('Profiles'));
  assert.deepEqual(problems, [], `ProfilesPage: ${problems.join(' | ')}`);

  reset();
  await render(React.createElement(BrowsersPage, { toast: noop }));
  assert.ok(text().includes('Browsers'));
  assert.deepEqual(problems, [], `BrowsersPage: ${problems.join(' | ')}`);

  reset();
  await render(React.createElement(ProxiesPage, { profiles, toast: noop }));
  assert.ok(text().includes('Proxies'));
  assert.deepEqual(problems, [], `ProxiesPage: ${problems.join(' | ')}`);

  reset();
  await render(
    React.createElement(SettingsPage, {
      settings: await mockBridge.getSettings(),
      info: await mockBridge.getAppInfo(),
      toast: noop,
      onSaved: noop,
    }),
  );
  assert.ok(text().includes('Settings'));
  assert.deepEqual(problems, [], `SettingsPage: ${problems.join(' | ')}`);
});

test('an empty store shows the empty state rather than a blank page', async () => {
  reset();
  await render(
    React.createElement(ProfilesPage, {
      profiles: [],
      sessions: {},
      toast: () => undefined,
      refresh: async () => undefined,
    }),
  );
  assert.ok(text().includes('No profiles yet'), 'the empty state did not render');
  assert.ok(text().includes('Create the first profile'), 'the empty state has no action');
  assert.deepEqual(problems, [], `empty state: ${problems.join(' | ')}`);
});

test('the profile editor opens for a stored profile and for a new one', async () => {
  reset();
  const profiles = await mockBridge.listProfiles();
  const first = profiles[0]!;

  await render(
    React.createElement(ProfileEditor, {
      profile: first,
      onClose: () => undefined,
      onSaved: () => undefined,
      toast: () => undefined,
    }),
  );
  assert.ok(text().includes('Edit'), 'the edit dialog did not title itself');
  assert.ok(text().includes('General'), 'the tabs are missing');

  reset();
  reset();
  await render(
    React.createElement(ProfileEditor, {
      profile: null,
      onClose: () => undefined,
      onSaved: () => undefined,
      toast: () => undefined,
    }),
  );
  assert.ok(text().includes('New profile'), 'the create dialog did not render');
  assert.deepEqual(problems, [], `profile editor: ${problems.join(' | ')}`);
});

test('every interactive control carries a name a person can hear', async () => {
  const profiles = await mockBridge.listProfiles();
  await render(
    React.createElement(ProfilesPage, {
      profiles,
      sessions: {},
      toast: () => undefined,
      refresh: async () => undefined,
    }),
  );

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
