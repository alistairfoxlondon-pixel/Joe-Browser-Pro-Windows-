import net from 'node:net';
import { openTunnel, type Upstream } from './proxy';

/**
 * The local proxy relay.
 *
 * Chromium takes a proxy on the command line but cannot take a password with it, and anything
 * on a command line is readable by every process the user owns. The relay solves both halves:
 * it listens on loopback on a random port, speaks SOCKS5 and HTTP CONNECT to the browser, and
 * holds the credential itself in memory. The browser is told `socks5://127.0.0.1:49152` and
 * nothing more.
 *
 * One port, two dialects: the first byte of a connection tells them apart (0x05 is a SOCKS
 * greeting, anything else is a method token), so a Chromium profile and a Firefox profile can
 * share the same relay.
 */

export interface RelayHandle {
  port: number;
  close(): Promise<void>;
  /** Re-point a live relay at a new upstream without closing the browser. */
  setUpstream(upstream: Upstream): void;
  stats(): { connections: number; active: number; lastError: string };
}

export async function startRelay(upstream: Upstream): Promise<RelayHandle> {
  let current = upstream;
  let connections = 0;
  let active = 0;
  let lastError = '';
  const sockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    client.setNoDelay(true);
    sockets.add(client);
    connections++;
    active++;

    client.once('close', () => {
      sockets.delete(client);
      active--;
    });
    client.on('error', () => client.destroy());

    client.once('data', (first: Buffer) => {
      if ((first[0] ?? 0) === 0x05) {
        handleSocks(client, first);
      } else {
        handleHttp(client, first);
      }
    });
  });

  const fail = (client: net.Socket, message: string) => {
    lastError = message;
    client.destroy();
  };

  function handleSocks(client: net.Socket, first: Buffer) {
    let buffer = first;
    let stage: 'greeting' | 'request' = 'greeting';
    let target: { host: string; port: number } | null = null;

    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (stage === 'greeting') {
        if (buffer.length < 2) return;
        const methods = buffer[1] ?? 0;
        if (buffer.length < 2 + methods) return;
        buffer = buffer.subarray(2 + methods);
        stage = 'request';
        client.write(Buffer.from([0x05, 0x00])); // no authentication offered to the browser
      }

      if (stage === 'request') {
        if (buffer.length < 5) return;
        const command = buffer[1];
        if (command !== 0x01) {
          client.end(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          return;
        }
        const atyp = buffer[3] ?? 0;
        let host = '';
        let offset = 4;

        if (atyp === 0x01) {
          if (buffer.length < 10) return;
          host = `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`;
          offset = 8;
        } else if (atyp === 0x03) {
          const length = buffer[4] ?? 0;
          if (buffer.length < 5 + length + 2) return;
          host = buffer.subarray(5, 5 + length).toString('utf8');
          offset = 5 + length;
        } else if (atyp === 0x04) {
          if (buffer.length < 4 + 16 + 2) return;
          const groups: string[] = [];
          for (let i = 0; i < 8; i++) {
            const base = 4 + i * 2;
            groups.push(((buffer[base] ?? 0) << 8 | (buffer[base + 1] ?? 0)).toString(16));
          }
          host = groups.join(':');
          offset = 4 + 16;
        } else {
          client.end(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          return;
        }

        const port = ((buffer[offset] ?? 0) << 8) | (buffer[offset + 1] ?? 0);
        target = { host, port };
        client.removeListener('data', onData);
        client.pause();

        if (buffer.length > offset + 2) client.unshift(buffer.subarray(offset + 2));
        void bridge(client, target);
      }
    };

    client.on('data', onData);
    client.once('close', () => client.removeListener('data', onData));
  }

  function handleHttp(client: net.Socket, first: Buffer) {
    let buffer = first.toString('latin1');

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('latin1');
      if (!buffer.includes('\r\n\r\n')) {
        if (buffer.length > 16384) fail(client, 'The browser sent an oversized request header.');
        return;
      }
      client.removeListener('data', onData);

      const head = buffer.slice(0, buffer.indexOf('\r\n\r\n'));
      const requestLine = head.split('\r\n')[0] ?? '';
      const match = /^CONNECT\s+(\S+):(\d+)\s+HTTP\/1\.[01]/i.exec(requestLine);

      if (!match) {
        // A plain HTTP proxy request (absolute URL) is out of scope for the relay: the browser
        // is configured for tunnelling, so anything else is a misconfiguration worth saying.
        client.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n', 'latin1');
        return;
      }

      const host = match[1]!;
      const port = Number(match[2]);
      const leftover = buffer.slice(buffer.indexOf('\r\n\r\n') + 4);
      client.pause();
      if (leftover.length > 0) client.unshift(Buffer.from(leftover, 'latin1'));
      void bridge(client, { host, port }, true);
    };

    client.on('data', onData);
  }

  async function bridge(
    client: net.Socket,
    target: { host: string; port: number },
    httpConnect = false,
  ) {
    let upstreamSocket: net.Socket | null = null;
    try {
      upstreamSocket = await openTunnel(current, target.host, target.port);

      if (httpConnect) {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n', 'latin1');
      } else {
        client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      }

      client.pipe(upstreamSocket);
      upstreamSocket.pipe(client);
      client.resume();

      const close = () => {
        client.destroy();
        upstreamSocket?.destroy();
      };
      client.once('close', close);
      client.once('error', close);
      upstreamSocket.once('close', close);
      upstreamSocket.once('error', () => {
        lastError = `The upstream proxy dropped the connection to ${target.host}:${target.port}.`;
        close();
      });

      client.setTimeout(0);
      upstreamSocket.setTimeout(0);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (httpConnect) {
        client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n', 'latin1');
      } else {
        client.end(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      }
      upstreamSocket?.destroy();
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Port 0 asks the OS for a free loopback port, so two open profiles never collide.
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The relay could not obtain a loopback port.');
  }

  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        sockets.clear();
        server.close(() => resolve());
      }),
    setUpstream(next: Upstream) {
      current = next;
    },
    stats: () => ({ connections, active, lastError }),
  };
}
