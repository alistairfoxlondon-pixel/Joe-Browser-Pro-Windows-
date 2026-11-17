import crypto from 'node:crypto';

/** Extract a Chrome Web Store extension ID from an official listing URL only. */
export function storeListingId(input: string): string | null {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'chromewebstore.google.com' && host !== 'chrome.google.com') return null;
  const match = /^\/(?:webstore\/)?detail\/(?:[^/]+\/)?([a-p]{32})\/?$/.exec(url.pathname);
  return match?.[1] ?? null;
}

export function extensionId(publicKey: Buffer): string {
  return crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
}

// The CRX3 header is a small protobuf. Ignore unknown fields, but reject malformed input.
function fields(data: Buffer): Map<number, Buffer[]> {
  const result = new Map<number, Buffer[]>();
  let offset = 0;
  function varint(): number {
    let value = 0;
    let factor = 1;
    for (let i = 0; i < 8; i++) {
      if (offset >= data.length) throw new Error('Malformed CRX header.');
      const b = data[offset++]!;
      value += (b & 127) * factor;
      if (!Number.isSafeInteger(value)) throw new Error('Malformed CRX header.');
      if (!(b & 128)) return value;
      factor *= 128;
    }
    throw new Error('Malformed CRX header.');
  }
  while (offset < data.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (!field) throw new Error('Malformed CRX header.');
    if (wire === 0) { varint(); continue; }
    if (wire === 1 || wire === 5) {
      offset += wire === 1 ? 8 : 4;
      if (offset > data.length) throw new Error('Malformed CRX header.');
      continue;
    }
    if (wire !== 2) throw new Error('Malformed CRX header.');
    const length = varint();
    if (length > data.length - offset) throw new Error('Malformed CRX header.');
    const values = result.get(field) ?? [];
    values.push(data.subarray(offset, offset + length));
    result.set(field, values);
    offset += length;
  }
  return result;
}

/** Verify a CRX3 publisher signature and bind it to the requested Web Store ID. */
export function verifyStoreCrx(data: Buffer, expectedId: string): Buffer {
  if (!/^[a-p]{32}$/.test(expectedId) || data.length < 13 || data.toString('ascii', 0, 4) !== 'Cr24' || data.readUInt32LE(4) !== 3) {
    throw new Error('The store did not return a valid CRX3 package.');
  }
  const headerSize = data.readUInt32LE(8);
  if (headerSize > 1024 * 1024 || 12 + headerSize >= data.length) throw new Error('Malformed CRX header.');
  const header = fields(data.subarray(12, 12 + headerSize));
  const signedHeaders = header.get(10000);
  if (!signedHeaders || signedHeaders.length !== 1) throw new Error('Missing CRX signed header.');
  const signedHeader = signedHeaders[0]!;
  const ids = fields(signedHeader).get(1);
  if (!ids || ids.length !== 1 || ids[0]!.length !== 16) throw new Error('Invalid CRX identity.');
  const encodedId = ids[0]!.toString('hex').replace(/[0-9a-f]/g, (d) => String.fromCharCode(97 + parseInt(d, 16)));
  if (encodedId !== expectedId) throw new Error('The package identity does not match the listing.');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(signedHeader.length);
  const signed = Buffer.concat([Buffer.from('CRX3 SignedData\0'), length, signedHeader, data.subarray(12 + headerSize)]);
  for (const proof of [...(header.get(2) ?? []), ...(header.get(3) ?? [])]) {
    const parsed = fields(proof);
    const keys = parsed.get(1);
    const signatures = parsed.get(2);
    if (!keys || keys.length !== 1 || !signatures || signatures.length !== 1) continue;
    const key = keys[0]!;
    if (extensionId(key) !== expectedId) continue;
    try {
      const publicKey = crypto.createPublicKey({ key, format: 'der', type: 'spki' });
      if (crypto.verify('sha256', signed, publicKey, signatures[0]!)) return key;
    } catch { /* try another proof */ }
  }
  throw new Error('The extension signature could not be verified.');
}
