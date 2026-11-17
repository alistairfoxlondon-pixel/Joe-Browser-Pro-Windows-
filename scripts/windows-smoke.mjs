import { _electron as electron } from 'playwright-core';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

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
async function workspace(page) {
  await page.locator('.shell .nav-item').first().waitFor();
  assert.equal(await page.locator('.nav-item').count(), 8);
  assert.equal(await page.locator('.recovery').count(), 0);
}
try {
  console.log('Installing to', destination);
  // NSIS /D must be the final argument and must not be quoted, even with spaces.
  execFileSync(path.resolve('release/JoeBrowserSetup.exe'), ['/S', '/allusers', `/D=${destination}`], { timeout: 120000 });
  await access(executablePath);
  console.log('Launching installed application');
  let page = await launch();
  console.log('Registering local account');
  await page.locator('.gate input[type=email]').fill('smoke@example.com');
  await page.locator('.gate input[type=password]').fill('test-password-123');
  await page.locator('.gate button[type=submit]').click();
  await workspace(page);
  const session = JSON.parse(await readFile(path.join(data, 'session.json'), 'utf8'));
  assert.equal(session.email, 'smoke@example.com');
  await app.close(); app = null;
  page = await launch();
  await workspace(page);
  // Visit every destination with an empty, real on-disk workspace (not sample data).
  for (let i = 0; i < 8; i++) {
    await page.locator('.nav-item').nth(i).click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.recovery').count(), 0);
  }
  assert.deepEqual(errors, []);
  await app.close(); app = null;
  const uninstaller = path.join(destination, 'Uninstall Joe Browser.exe');
  await access(uninstaller);
  // _?= runs the uninstaller in place so the process waits for uninstall to finish.
  execFileSync(uninstaller, ['/S', `_?=${destination}`], { timeout: 120000 });
  await access(path.join(data, 'session.json')); // uninstall must preserve user data
  console.log('PASS: custom-directory install, registration without verification, restart, all pages, uninstall.');
} catch (error) {
  const detail = String(error?.stack || error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::error title=Windows installed smoke test::${detail}`);
  throw error;
} finally {
  if (app) await app.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
}
