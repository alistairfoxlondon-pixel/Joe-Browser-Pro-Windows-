import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';

/**
 * Runs the test suite.
 *
 * The tests import TypeScript from TypeScript, and Node's own type stripping does not resolve
 * extensionless imports, so each suite is bundled with esbuild first. Bundling has a second
 * benefit: it proves the core modules bundle without Electron present, which is how the app
 * imports them.
 */

rmSync('.test-build', { recursive: true, force: true });

const files = readdirSync('test')
  .filter((name) => name.endsWith('.test.ts') || name.endsWith('.test.tsx'))
  .sort();

if (files.length === 0) {
  console.error('No test files found in test/.');
  process.exit(1);
}

const bundles = [];

for (const file of files) {
  const outfile = `.test-build/${file.replace(/\.tsx?$/, '')}.mjs`;
  await build({
    entryPoints: [`test/${file}`],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    jsx: 'automatic',
    // MUI pulls in CJS chunks whose `require('react')` cannot be shimmed in ESM output, so every
    // package stays external and Node resolves it at runtime: ESM imports CJS react-transition-
    // group through the standard interop, which keeps exactly one copy of React alive.
    packages: 'external',
    define: { 'process.env.NODE_ENV': '"test"' },
    logLevel: 'warning',
  });
  bundles.push(outfile);
}

let failed = false;

for (const bundle of bundles) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [bundle], { stdio: 'inherit' });
    child.once('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
