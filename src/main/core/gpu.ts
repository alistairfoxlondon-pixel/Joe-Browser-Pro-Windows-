import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CdpClient, delay } from './cdp';
import { installedKernels, resolveKernelExe } from './catalog';
import { log } from './log';
import { freePort } from './net';

/**
 * Learn the graphics card this PC really has.
 *
 * The original read the adapter out of a browser it launched (BrowserSession.cs), and the editor
 * offered "Use this PC's graphics card". That is the single cheapest improvement to an identity:
 * a machine answering with the card it actually owns needs no spoof at all on the one surface
 * that is hardest to fake, and a card it does not own is a scanner's cheapest tell.
 *
 * This launches a browser the app already knows about, on a throwaway profile directory, asks
 * WebGL who it is, and closes it. Nothing is installed and nothing is left behind.
 */

const PROBE = `(() => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return JSON.stringify({ vendor: '', renderer: '' });
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return JSON.stringify({
      vendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR) || ''),
      renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER) || '')
    });
  } catch (error) {
    return JSON.stringify({ vendor: '', renderer: '', error: String(error) });
  }
})()`;

export async function learnMachineGpu(): Promise<{ vendor: string; renderer: string }> {
  const candidate = installedKernels().find((browser) => browser.engine !== 'firefox');
  const executable = candidate ? resolveKernelExe(candidate.id) : null;
  if (!executable) {
    throw new Error('Install an app-managed Chromium browser build before reading the graphics adapter.');
  }

  const sandbox = path.join(os.tmpdir(), `joe-gpu-${Date.now()}`);
  const port = await freePort();
  fs.mkdirSync(sandbox, { recursive: true });

  const args = [
    `--user-data-dir=${sandbox}`,
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--disable-gpu-sandbox',
    '--use-angle=default',
    'about:blank',
  ];

  let child;
  try {
    child = spawn(executable, args, { stdio: 'ignore', windowsHide: true, detached: false });
  } catch (error) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    log.error('the GPU probe could not start a browser', error);
    throw new Error(`The graphics card could not be read: ${(error as Error).message}`);
  }

  let client: CdpClient | null = null;
  try {
    client = await CdpClient.connect(port, 25000);
    await delay(600);

    const targets = await client.send<{ targetInfos?: { targetId: string; type: string }[] }>('Target.getTargets');
    const page = (targets.targetInfos ?? []).find((target) => target.type === 'page');
    if (!page) throw new Error('The probe browser opened without a page.');

    const attached = await client.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId: page.targetId,
      flatten: true,
    });
    await client.send('Runtime.enable', {}, attached.sessionId).catch(() => undefined);

    const answer = await client.send<{ result?: { value?: string } }>(
      'Runtime.evaluate',
      { expression: PROBE, returnByValue: true },
      attached.sessionId,
    );

    const parsed = JSON.parse(answer.result?.value ?? '{}') as { vendor?: string; renderer?: string };
    // A headless run on a machine with no adapter answers SwiftShader, which is not the card.
    const renderer = parsed.renderer ?? '';
    if (!renderer || /swiftshader|llvmpipe|software/i.test(renderer)) {
      throw new Error(
        'This PC reported a software renderer rather than a graphics card. A headful browser would report the real adapter.',
      );
    }

    log.info(`learned the machine adapter: ${renderer}`);
    return { vendor: parsed.vendor ?? '', renderer };
  } finally {
    try {
      await client?.send('Browser.close').catch(() => undefined);
      client?.close();
    } catch {
      /* the browser is closing anyway */
    }
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    await delay(300);
    try {
      fs.rmSync(sandbox, { recursive: true, force: true });
    } catch {
      /* a locked file is left for the OS to clean at next boot */
    }
  }
}
