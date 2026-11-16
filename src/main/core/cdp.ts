import http from 'node:http';
import WebSocket from 'ws';

/**
 * A Chrome DevTools Protocol client.
 *
 * Small on purpose: the app needs four things from CDP - attach to a page, add a script that
 * runs before any page script, evaluate an expression, and clear storage - and every one of
 * them is a plain request/response. Anything larger would be a framework.
 *
 * `flatten: true` is used throughout so one socket carries the browser session and every page
 * session, distinguished by `sessionId`.
 */

interface PendingCall {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

type EventHandler = (params: Record<string, unknown>, sessionId: string) => void;

export class CdpClient {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private handlers = new Map<string, Set<EventHandler>>();
  private closed = false;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (data: WebSocket.RawData) => this.onMessage(data));
    socket.on('close', () => this.failAll(new Error('The browser closed the DevTools connection.')));
    socket.on('error', () => this.failAll(new Error('The DevTools connection failed.')));
  }

  static async connect(port: number, timeoutMs = 30000): Promise<CdpClient> {
    const deadline = Date.now() + timeoutMs;
    let lastError = 'The browser did not open a DevTools port.';

    while (Date.now() < deadline) {
      try {
        const target = await browserSocket(port);
        const socket = new WebSocket(target, { perMessageDeflate: false, handshakeTimeout: 10000 });
        await new Promise<void>((resolve, reject) => {
          socket.once('open', () => resolve());
          socket.once('error', (error) => reject(error));
        });
        return new CdpClient(socket);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await delay(250);
      }
    }

    throw new Error(`Could not attach to the browser: ${lastError}`);
  }

  private onMessage(data: WebSocket.RawData): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data.toString()) as Record<string, unknown>;
    } catch {
      return;
    }

    const id = typeof message['id'] === 'number' ? message['id'] : 0;
    if (id > 0) {
      const call = this.pending.get(id);
      if (!call) return;
      this.pending.delete(id);
      clearTimeout(call.timer);
      if (message['error']) {
        const error = message['error'] as { message?: string };
        call.reject(new Error(error.message ?? 'The browser refused the request.'));
      } else {
        call.resolve(message['result']);
      }
      return;
    }

    const method = typeof message['method'] === 'string' ? message['method'] : '';
    if (!method) return;
    const sessionId = typeof message['sessionId'] === 'string' ? message['sessionId'] : '';
    const params = (message['params'] as Record<string, unknown>) ?? {};
    for (const handler of this.handlers.get(method) ?? []) {
      try {
        handler(params, sessionId);
      } catch {
        /* a handler must never take the connection down */
      }
    }
  }

  private failAll(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
  }

  on(method: string, handler: EventHandler): () => void {
    let set = this.handlers.get(method);
    if (!set) {
      set = new Set();
      this.handlers.set(method, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The DevTools connection is closed.'));

    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload['sessionId'] = sessionId;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The browser did not answer ${method} in time.`));
      }, 20000);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });

      try {
        this.socket.send(JSON.stringify(payload));
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  close(): void {
    this.closed = true;
    this.failAll(new Error('The DevTools connection was closed by the application.'));
    try {
      this.socket.close();
    } catch {
      /* already gone */
    }
  }
}

function browserSocket(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/json/version', timeout: 5000 },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`The DevTools endpoint answered ${response.statusCode}.`));
          return;
        }
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              webSocketDebuggerUrl?: string;
            };
            if (!parsed.webSocketDebuggerUrl) {
              reject(new Error('The DevTools endpoint did not offer a socket.'));
              return;
            }
            resolve(parsed.webSocketDebuggerUrl);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error('The DevTools endpoint timed out.')));
    request.on('error', reject);
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
