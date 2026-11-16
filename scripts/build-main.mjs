import { build } from 'esbuild';
import { rmSync } from 'node:fs';

/**
 * Bundles the main process and the preload script.
 *
 * Two separate bundles, both CommonJS, because Electron loads the preload in a context where
 * ESM is not available and the main process is started by `require`. `electron` and Node's own
 * modules stay external: they exist at runtime and must not be bundled.
 */

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  // Only electron is external. `ws` is bundled so the packaged app carries no node_modules
  // it could fail to find inside the asar. Its optional native accelerators are left external
  // because ws requires them inside a try/catch and works without them.
  external: ['electron', 'bufferutil', 'utf-8-validate'],
};

rmSync('dist/main', { recursive: true, force: true });
rmSync('dist/preload', { recursive: true, force: true });

await build({ ...shared, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.js' });
await build({ ...shared, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.js' });

console.log('main and preload built');
