import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureHumanPasteExtension } from '../src/main/core/humanPaste';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-paste-'));
process.env.JOE_BROWSER_DATA_DIR = root;

test('paste extension registers an explicit editable context-menu action', () => {
  const folder = ensureHumanPasteExtension('fast');
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  const worker = fs.readFileSync(path.join(folder, 'worker.js'), 'utf8');
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('contextMenus'));
  assert.match(worker, /Paste as Human/);
  assert.match(worker, /contexts: \['editable'\]/);
  assert.match(worker, /12, 44/);
  assert.doesNotMatch(worker, /addEventListener\(['"]paste/);
  assert.ok(fs.existsSync(path.join(folder, 'clipboard.js')));
});

test('unrecognized speed uses natural timings and cannot escape its directory', () => {
  const folder = ensureHumanPasteExtension('../../invalid');
  assert.equal(path.basename(folder), '32-95');
  assert.ok(folder.startsWith(root + path.sep));
});
