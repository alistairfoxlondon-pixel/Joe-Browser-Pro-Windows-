import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, 'src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.join(root, 'src/shared'),
    },
  },
  build: {
    outDir: path.join(root, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome128',
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5183,
    strictPort: true,
    // The window is served from a proxied host during design work; Vite's host check would
    // otherwise answer "Blocked request" to the preview it is meant to support.
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
});
