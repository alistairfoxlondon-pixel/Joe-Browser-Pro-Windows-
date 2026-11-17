import { _electron as electron } from 'playwright-core';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

/** Test the packaged installer and account gate without bypassing authentication. */

if (process.platform !== 'win32') throw new Error('Run this packaged installer test on Windows.');
const root = await mkdtemp(path.join(tmpdir(), 'joe-installer-test-'));
const destination = path.join(root, 'Custom install folder');
const data = path.join(root, 'workspace');
const executablePath = path.join(destination, 'Joe Browser.exe');
let app;
const errors = [];
async function launch() {
  app = await electron.launch({ executablePath, env: { ...process.env, JOE_BROWSER_DATA_DIR: data }, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForLoadState('domcontentloaded');
  return page;
}
async function accountGate(page) {
  await page.locator('.gate input[type=email]').waitFor();
  assert.equal(await page.locator('.gate-skip').count(), 0, 'Account sign-in must be required');
  assert.equal(await page.locator('.recovery').count(), 0, `Renderer recovery: ${await page.locator('body').innerText()}; errors: ${errors.join(' | ')}`);
}

try {
  console.log('Installing to', destination);
  // NSIS /D must be the final argument and must not be quoted, even with spaces.
  execFileSync(path.resolve('release/JoeBrowserSetup.exe'), ['/S', '/allusers', `/D=${destination}`], { timeout: 120000 });
  await access(executablePath);
  console.log('Launching installed application');
  let page = await launch();
  await accountGate(page);
  // Legacy local-mode choice must not bypass the account gate after upgrading.
  await page.evaluate(() => localStorage.setItem('joe-local-mode', '1'));
  await app.close(); app = null;
  page = await launch();
  await accountGate(page);
  assert.deepEqual(errors, []);
  await app.close(); app = null;
  const uninstaller = path.join(destination, 'Uninstall Joe Browser.exe');
  await access(uninstaller);
  // _?= runs the uninstaller in place so the process waits for uninstall to finish.
  execFileSync(uninstaller, ['/S', `_?=${destination}`], { timeout: 120000 });
  // Uninstall must preserve user data.
  await access(data);
  await access(path.join(data, 'profiles'));
  console.log('PASS: custom-directory install, account gate, restart, and uninstall.');
} catch (error) {
  const detail = String(error?.stack || error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::error title=Windows installed smoke test::${detail}`);
  throw error;
} finally {
  if (app) await app.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
}
