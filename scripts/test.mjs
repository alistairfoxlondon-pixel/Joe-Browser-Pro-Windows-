import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

/**
 * Runs the test suite.
 *
 * The tests import TypeScript from TypeScript, and Node's own type stripping does not resolve
 * extensionless imports, so the suite is bundled with esbuild first. That also proves the core
 * modules bundle without Electron present - they are imported by the app the same way.
 */

rmSync('.test-build', { recursive: true, force: true });

await build({
  entryPoints: ['test/core.test.ts'],
  outfile: '.test-build/core.test.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['electron', 'ws'],
  logLevel: 'warning',
});

const child = spawn(process.execPath, ['.test-build/core.test.mjs'], { stdio: 'inherit' });
child.once('exit', (code) => process.exit(code ?? 1));
