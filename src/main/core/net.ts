import net from 'node:net';

/**
 * A free loopback port.
 *
 * Used by the GPU probe and by the relay. Reserving and releasing the port rather than picking a
 * constant is what lets several profiles run at once without a collision, and it keeps every
 * listener on loopback rather than a wildcard address.
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a port.'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}
