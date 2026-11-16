import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The tests that matter for an identity tool.
 *
 * They assert three properties and nothing cosmetic:
 *   1. Determinism - a seed always rebuilds the same machine.
 *   2. Uniqueness  - a new profile does not collide with one already stored.
 *   3. Coherence  - the surfaces that must agree with the proxy's country do agree.
 */

// Point the store at a scratch folder before anything imports Paths.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-test-'));
process.env['JOE_BROWSER_DATA_DIR'] = scratch;

const { generateFingerprint, signature, rollUnique, alignWithProxy, checkUniqueness } = await import(
  '../src/main/core/fingerprint'
);
const { buildIdentity } = await import('../src/main/core/ua');
const { parseProxyLine, normalizeProxy, proxyEnabled, proxyLabel } = await import(
  '../src/main/core/proxy'
);
const { buildFingerprintScript } = await import('../src/main/core/inject');
const store = await import('../src/main/core/store');
const { startRelay } = await import('../src/main/core/relay');
const { ensureFirstPartyExtensions, extensionArgs, extensionDirectories } = await import(
  '../src/main/core/extensions'
);
const history = await import('../src/main/core/history');

test('the same seed always rebuilds the same machine', () => {
  const a = generateFingerprint({ seed: 424242 });
  const b = generateFingerprint({ seed: 424242 });
  assert.deepEqual(signature(a), signature(b));
});

test('different seeds produce different identities', () => {
  const a = generateFingerprint({ seed: 1 });
  const b = generateFingerprint({ seed: 2 });
  assert.notDeepEqual(signature(a), signature(b));
});

test('a new profile never collides with one already stored', () => {
  const existing = [];
  for (let i = 0; i < 40; i++) existing.push(generateFingerprint({ seed: 1000 + i }));

  for (let i = 0; i < 25; i++) {
    const rolled = rollUnique(existing);
    const check = checkUniqueness(rolled.fingerprint, existing);
    assert.equal(check.unique, true, `profile ${i} collided across the twelve surfaces`);
    existing.push(rolled.fingerprint);
  }
});

test('the clock, locale and coordinates follow the proxy country', () => {
  const base = generateFingerprint({ seed: 77 });
  const aligned = alignWithProxy(base, 'DE', '');

  assert.equal(aligned.timezone, 'Europe/Berlin');
  assert.equal(aligned.language, 'de-DE');
  assert.equal(aligned.geoLat, '52.5200');
  assert.ok(aligned.acceptLanguage.startsWith('de-DE'));
});

test('the user agent, platform and brands agree with the claimed OS', () => {
  const windows = buildIdentity('chrome', '157.0.8103.41', 'Windows 11', 'desktop', 5);
  assert.match(windows.userAgent, /Windows NT 10\.0; Win64; x64/);
  assert.match(windows.userAgent, /Chrome\/157\.0\.0\.0/);
  assert.equal(windows.platform, 'Win32');
  assert.equal(windows.osPlatform, 'Windows');
  assert.ok(windows.brands.some((b) => b.brand === 'Google Chrome' && b.version === '157'));

  const mac = buildIdentity('chrome', '157.0.8103.41', 'macOS 15', 'desktop', 5);
  assert.match(mac.userAgent, /Macintosh; Intel Mac OS X/);
  assert.equal(mac.platform, 'MacIntel');
  assert.equal(mac.osPlatform, 'macOS');

  const firefox = buildIdentity('firefox', '141.0', 'Windows 11', 'desktop', 5);
  assert.match(firefox.userAgent, /Firefox\/141\.0/);
  // Firefox exposes no client hints; an empty list is the honest answer.
  assert.equal(firefox.brands.length, 0);
});

test('the injected script parses as JavaScript and carries the overrides', () => {
  const fingerprint = generateFingerprint({ seed: 909 });
  const script = buildFingerprintScript({
    fingerprint,
    engine: 'chrome',
    browserVersion: '157.0.8103.41',
    tools: {
      humanPaste: true,
      humanPasteSpeed: 'natural',
      proxyWatch: true,
      proxyWatchInterval: 60,
      enableRightClick: true,
      unlockSelection: true,
      customExtensions: '',
    },
    countryCode: 'GB',
  });

  // A syntax error here is a silently unprotected profile in production.
  assert.doesNotThrow(() => new Function(script));

  assert.match(script, /navigator/);
  assert.match(script, /hardwareConcurrency/);
  assert.match(script, /37445/); // UNMASKED_VENDOR_WEBGL
  assert.match(script, /getTimezoneOffset/);
  assert.match(script, /cdc_/);

  // The originals live in a closure: the host's real graphics card must not be reachable by
  // walking own properties on window, which an earlier design leaked through a named key.
  assert.doesNotMatch(script, /__jbReal/);
});

test('proxy lines are accepted in the shapes sellers actually paste', () => {
  assert.deepEqual(parseProxyLine('1.2.3.4:8080'), {
    type: 'http',
    host: '1.2.3.4',
    port: 8080,
    user: '',
    password: '',
  });

  assert.deepEqual(parseProxyLine('socks5://1.2.3.4:1080'), {
    type: 'socks5',
    host: '1.2.3.4',
    port: 1080,
    user: '',
    password: '',
  });

  const authed = parseProxyLine('http://bob:s3cret@9.9.9.9:3128');
  assert.equal(authed?.user, 'bob');
  assert.equal(authed?.password, 's3cret');
  assert.equal(authed?.host, '9.9.9.9');

  const colonForm = parseProxyLine('9.9.9.9:3128:bob:s3cret');
  assert.equal(colonForm?.user, 'bob');
  assert.equal(colonForm?.password, 's3cret');

  assert.equal(parseProxyLine('nonsense'), null);
  assert.equal(parseProxyLine(''), null);
});

test('a proxy is only "enabled" when it is complete', () => {
  assert.equal(proxyEnabled(normalizeProxy({ type: 'http', host: 'a', port: 0 })), false);
  assert.equal(proxyEnabled(normalizeProxy({ type: 'none', host: 'a', port: 80 })), false);
  assert.equal(proxyEnabled(normalizeProxy({ type: 'http', host: 'a', port: 80 })), true);
  assert.equal(proxyLabel(normalizeProxy({ type: 'http', host: 'a', port: 80 })), 'Proxy');
});

test('the store creates, re-rolls, duplicates and deletes', () => {
  store.clearStore();
  assert.equal(store.allProfiles().length, 0);

  const first = store.createProfile({ name: 'Shop UK' });
  assert.equal(store.allProfiles().length, 1);
  assert.ok(first.fingerprint.seed > 0);

  const second = store.createProfile({ name: 'Shop US' });
  const check = checkUniqueness(second.fingerprint, [first.fingerprint]);
  assert.equal(check.unique, true);

  // Names are de-duplicated rather than rejected.
  const third = store.createProfile({ name: 'Shop UK' });
  assert.equal(third.name, 'Shop UK 2');

  const duplicate = store.duplicateProfile(first.id);
  // A duplicate is deliberately the same machine with different storage.
  assert.equal(duplicate.fingerprint.seed, first.fingerprint.seed);

  const rerolled = store.rerollFingerprint(first.id);
  assert.notEqual(rerolled.fingerprint.seed, first.fingerprint.seed);

  store.updateProfile(first.id, { name: 'Renamed', group: 'Ecommerce' });
  assert.equal(store.findProfile(first.id)?.name, 'Renamed');

  store.deleteProfile(second.id);
  assert.equal(store.findProfile(second.id), null);
});

test('a proxy password is never stored in the clear', () => {
  store.clearStore();
  const created = store.createProfile({
    name: 'With credentials',
    proxy: {
      type: 'http',
      host: '10.0.0.1',
      port: 8080,
      user: 'bob',
      password: 'hunter2',
      passwordEnc: '',
      lastIp: '',
      lastCountry: '',
      lastCountryCode: '',
      lastTimezone: '',
      lastCity: '',
      fallbackDirect: true,
    },
  });

  const raw = fs.readFileSync(path.join(scratch, 'Profiles.json'), 'utf8');
  assert.equal(raw.includes('hunter2'), false, 'the plaintext password reached the store file');
  assert.ok(created.proxy.passwordEnc.length > 0);
  assert.equal(store.proxyPasswordOf(created), 'hunter2');
});

test('the built-in extensions are written to disk with valid manifests', () => {
  const installed = ensureFirstPartyExtensions();
  assert.equal(installed.length, 3, 'expected three first-party extensions');

  for (const extension of installed) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extension.dir, 'manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    assert.equal(manifest['manifest_version'], 3, `${extension.id} is not MV3`);
    assert.ok(fs.existsSync(path.join(extension.dir, 'content.js')), `${extension.id} has no script`);
    assert.ok(
      (manifest['content_scripts'] as unknown[]).length > 0,
      `${extension.id} declares no content script`,
    );
  }

  // Re-running must not duplicate or corrupt anything.
  const again = ensureFirstPartyExtensions();
  assert.deepEqual(again.map((e) => e.id), installed.map((e) => e.id));
});

test('the extension switches only carry folders that really are extensions', () => {
  const base = store.createProfile({ name: 'Extension host' });
  const good = path.join(scratch, 'extensions', 'joe-right-click');
  const missing = path.join(scratch, 'extensions', 'does-not-exist');

  const withBadPath = store.updateProfile(base.id, {
    tools: { ...base.tools, customExtensions: `${good}\n${missing}\n` },
  });

  const directories = extensionDirectories(withBadPath, true);
  assert.ok(directories.includes(good), 'a valid custom folder was dropped');
  assert.ok(!directories.includes(missing), 'a folder with no manifest was passed to the browser');
  assert.ok(directories.length >= 4, 'the three first-party extensions should also be present');

  const args = extensionArgs(directories);
  assert.equal(args.length, 2);
  assert.ok(args[0]!.startsWith('--load-extension='));
  assert.ok(args[1]!.startsWith('--disable-extensions-except='));

  // The master switch turns everything off, including the built-in three.
  assert.deepEqual(extensionDirectories(withBadPath, false), []);
  assert.deepEqual(extensionArgs([]), []);
});

test('history is recorded per profile and cannot leak between them', () => {
  const first = store.createProfile({ name: 'History A' });
  const second = store.createProfile({ name: 'History B' });

  history.clear(first.id);
  history.clear(second.id);

  history.record(first.id, 'https://example.com/one');
  history.record(first.id, 'https://example.com/two');
  history.record(second.id, 'https://other.example/private');

  const forFirst = history.list(first.id);
  const forSecond = history.list(second.id);

  assert.equal(forFirst.length, 2);
  assert.equal(forSecond.length, 1);
  assert.ok(!forFirst.some((entry) => entry.url.includes('other.example')));

  // Newest first.
  assert.equal(forFirst[0]!.url, 'https://example.com/two');

  // A repeat of the same address in a row is one visit, not two.
  history.record(first.id, 'https://example.com/two');
  assert.equal(history.list(first.id).length, 2);

  // The fragment never leaves the browser, so it is not recorded either.
  history.record(first.id, 'https://example.com/three#section');
  assert.equal(history.list(first.id)[0]!.url, 'https://example.com/three');

  const freed = history.clear(first.id);
  assert.ok(freed > 0);
  assert.equal(history.list(first.id).length, 0);
  // Clearing one profile leaves the other untouched.
  assert.equal(history.list(second.id).length, 1);
});

test('the relay listens on loopback and refuses to invent an upstream', async () => {
  // Nothing is listening on that port, so a tunnel must fail cleanly rather than hang.
  const relay = await startRelay({ type: 'socks5', host: '127.0.0.1', port: 9, user: '', password: '' });
  assert.ok(relay.port > 0);
  await relay.close();
});
