import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The Content-Security-Policy is injected at build time only.
 *
 * The packaged app needs it: the renderer loads local files and must not be able to run an
 * injected script or fetch a remote one. The dev server must NOT have it: Vite and React
 * Refresh both inject an inline module in front of the app, and `script-src 'self'` blocks it -
 * which presents as a blank window with no error the user can act on.
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    // The licensing service is the only remote origin the window may reach: account sign-in and
    // entitlement reads go through it. Everything else stays on this PC.
    "connect-src 'self' https://djlmbsaltjqsqpwqdvsg.supabase.co wss://djlmbsaltjqsqpwqdvsg.supabase.co",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  return {
    name: 'joe-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig({
  root: path.join(root, 'src/renderer'),
  base: './',
  // Root is src/renderer, so the assets the HTML references (logo.svg, the PWA icons) live one
  // level up. Without this they are never copied into dist/ and the packaged window shows a
  // broken icon.
  publicDir: path.join(root, 'public'),
  plugins: [react(), contentSecurityPolicy()],
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
