import { spawn } from 'node:child_process';
import { createServer } from 'vite';

/**
 * Development loop: a Vite server for the renderer, Electron pointed at it.
 *
 * The renderer reloads on save; the main process is rebuilt and restarted by hand, because
 * silently restarting the window under a user mid-edit is worse than asking them to press a key.
 */

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5183/';
console.log(`renderer at ${url}`);

const buildMain = spawn(process.execPath, ['scripts/build-main.mjs'], { stdio: 'inherit' });
await new Promise((resolve) => buildMain.once('exit', resolve));

const electron = spawn(
  process.platform === 'win32' ? 'node_modules\\.bin\\electron.cmd' : 'node_modules/.bin/electron',
  ['.'],
  { stdio: 'inherit', env: { ...process.env, JOE_DEV_SERVER: url } },
);

electron.once('exit', async () => {
  await server.close();
  process.exit(0);
});
