import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Paths } from '../src/main/core/paths';
import { listKernels, downloadKernel, resolveKernelExe } from '../src/main/core/catalog';
import { addFromUrl, ensureShipped, shippedState } from '../src/main/core/library';
import { INCLUDED_EXTENSIONS } from '../src/shared/extensionCatalog';
import { ensureHumanPasteExtension } from '../src/main/core/humanPaste';
import { chromium } from 'playwright-core';

/** Network-dependent vendor integration check, deliberately separate from offline unit tests. */
async function main(): Promise<void> {
  assert.equal(process.platform, 'win32');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-live-test-'));
  process.env.JOE_BROWSER_DATA_DIR = root;
  // Windows Chromium's AppContainer needs read and traverse access to the test binaries.
  // The runner's private temporary directory is not guaranteed to grant that by default.
  execFileSync('icacls', [root, '/grant', '*S-1-15-2-1:(OI)(CI)(RX)'], { windowsHide: true });
  try {
    console.log('Installing the two original default extensions');
    await ensureShipped();
    const defaults = shippedState();
    assert.deepEqual(defaults.map((item) => item.id), INCLUDED_EXTENSIONS.map((item) => item.id));
    for (const item of defaults) {
      assert.equal(item.present, true, item.name);
      const manifest = JSON.parse(fs.readFileSync(path.join(Paths.extensions, 'shipped', item.id, 'manifest.json'), 'utf8'));
      assert.ok(manifest.key, 'The verified publisher key was not preserved');
    }
    console.log('Installing a signed Chrome Web Store package');
    const url = 'https://chromewebstore.google.com/detail/singlefile/mpiodijhokgodhhofbcjdecpffjipkle';
    const extension = await addFromUrl(url);
    assert.equal(extension.item?.storeId, 'mpiodijhokgodhhofbcjdecpffjipkle');
    assert.ok(fs.existsSync(path.join(extension.item!.folder, 'manifest.json')));
    console.log('Downloading an app-managed Chrome for Testing build');
    const builds = await listKernels(true);
    const build = builds.find((entry) => entry.engine === 'chrome' && entry.channel.toLowerCase() === 'stable');
    assert.ok(build, 'The vendor catalog did not contain a stable Chrome build');
    const installed = await downloadKernel(build, () => {});
    const executable = resolveKernelExe(installed.id);
    assert.ok(executable && executable.startsWith(Paths.kernels + path.sep));
    const output = execFileSync(executable, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${path.join(root, 'test-profile')}`, '--dump-dom', 'data:text/html,<title>Joe smoke</title>',
    ], { timeout: 90_000, encoding: 'utf8', windowsHide: true });
    assert.match(output, /Joe smoke/);
    console.log('Downloading and launching a verified app-managed Brave build');
    const brave = builds.find((entry) => entry.engine === 'brave' && entry.channel === 'stable');
    assert.ok(brave?.sha256 && brave.runtimeVersion, 'No verified Brave stable build was found');
    const braveInstall = await downloadKernel(brave, () => {});
    assert.equal(braveInstall.runtimeVersion, brave.runtimeVersion);
    const braveExe = resolveKernelExe(braveInstall.id);
    assert.ok(braveExe && path.basename(braveExe).toLowerCase() === 'brave.exe');
    const braveOutput = execFileSync(braveExe, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${path.join(root, 'brave-profile')}`, '--dump-dom', 'data:text/html,<title>Brave smoke</title>',
    ], { timeout: 90_000, encoding: 'utf8', windowsHide: true });
    assert.match(braveOutput, /Brave smoke/);
    console.log('Checking Paste as Human extension loads in the managed browser');
    const paste = ensureHumanPasteExtension('instant');
    const browser = await chromium.launchPersistentContext(path.join(root, 'extension-profile'), {
      executablePath: executable, headless: true,
      args: [`--disable-extensions-except=${paste}`, `--load-extension=${paste}`],
      timeout: 90_000,
    });
    try {
      const worker = browser.serviceWorkers()[0] ?? await browser.waitForEvent('serviceworker', { timeout: 30_000 });
      assert.match(worker.url(), /^chrome-extension:\/\//);
      assert.equal(await worker.evaluate(() => typeof chrome.contextMenus), 'object');
    } finally { await browser.close(); }

    console.log('PASS: authenticated store install, Chrome and Brave download, extraction, and headless launch.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 });
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
