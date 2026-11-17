import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Paths } from '../src/main/core/paths';
import { listKernels, downloadKernel, resolveKernelExe } from '../src/main/core/catalog';
import { addFromUrl } from '../src/main/core/library';

/** Network-dependent vendor integration check, deliberately separate from offline unit tests. */
async function main(): Promise<void> {
  assert.equal(process.platform, 'win32');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-live-test-'));
  process.env.JOE_BROWSER_DATA_DIR = root;
  try {
    console.log('Installing a signed Chrome Web Store package');
    const url = 'https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh';
    const extension = await addFromUrl(url);
    assert.equal(extension.item?.storeId, 'ddkjiahejlhfcafbddmgiahcphecmpfh');
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
    console.log('PASS: authenticated store install, Chrome download, extraction, and headless launch.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 });
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
