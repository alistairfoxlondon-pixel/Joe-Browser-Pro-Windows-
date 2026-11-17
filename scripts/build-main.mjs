import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';

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

await build({ ...shared, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.js' });

/*
 * Embed the tray icon into the main bundle.
 *
 * The tray icon used to be a path on disk. In a packaged app that path is inside the asar, and
 * `files:` in electron-builder.yml did not ship it - so the release built, launched, and had no
 * tray at all, with only a line in the log to say so. Embedding it as a data URL removes the
 * file from the equation: it is in the JavaScript or it is not there at all, and the build fails
 * if it is not.
 *
 * The source PNG is 1.5 MB at 1024x1024, which is right for an installer icon and absurd for a
 * 16 px tray. It is resized here with a plain PNG re-encode is not worth a native dependency, so
 * Electron's own `nativeImage.resize` does it at runtime from the embedded original. 1.5 MB in
 * the main bundle costs nothing next to the 700 KB already there.
 */
const icon = readFileSync('build/icon.png');
await build({
  ...shared,
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/main/index.js',
  define: {
    __TRAY_ICON__: JSON.stringify(`data:image/png;base64,${icon.toString('base64')}`),
  },
});

console.log('main and preload built');
