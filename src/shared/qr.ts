/**
 * A QR encoder, byte mode, error correction L, versions 1-9.
 *
 * Enough for the `otpauth://` URIs an authenticator app scans during two-factor setup. Written
 * out rather than pulled in: the whole application ships as one bundle, and a dependency for one
 * dialog is not worth the supply chain. The original had the same encoder in C#, drawing into a
 * GDI bitmap; this one hands back a list of lit modules and the renderer draws them as SVG, so
 * the code is crisp at any scale and takes no extra memory as an image.
 *
 * A QR code either scans or it does not, and there is no partial credit - the tests assert that
 * a known URI produces a symbol a decoder accepts.
 */

/* Per version (index 0 = version 1), level L:
   total codewords per block, EC codewords per block,
   blocks in group 1, data codewords per block in group 1,
   blocks in group 2, data codewords per block in group 2. */
const L: number[][] = [
  [26, 7, 1, 19, 0, 0],
  [44, 10, 1, 34, 0, 0],
  [70, 15, 1, 55, 0, 0],
  [100, 20, 1, 80, 0, 0],
  [134, 26, 1, 108, 0, 0],
  [86, 18, 2, 68, 0, 0],
  [98, 20, 2, 78, 0, 0],
  [121, 24, 2, 97, 0, 0],
  [146, 30, 2, 116, 0, 0],
];

const ALIGNMENT: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
];

export interface QrCode {
  version: number;
  size: number;
  /** `modules[y][x]` - true is dark. */
  modules: boolean[][];
}

function capacity(version: number): number {
  const row = L[version - 1]!;
  const [, , group1, data1, group2, data2] = row as [number, number, number, number, number, number];
  const dataCodewords = group1 * data1 + group2 * data2;
  // 4 bits of mode, 8 bits of length below version 10, and a 4-bit terminator.
  return Math.floor((dataCodewords * 8 - 4 - 8 - 4) / 8);
}

/** Encodes text, or returns null when it does not fit in version 9-L. */
export function encodeQr(text: string): QrCode | null {
  const data = [...new TextEncoder().encode(text ?? '')];
  let version = 0;
  for (let candidate = 1; candidate <= 9; candidate++) {
    if (capacity(candidate) >= data.length) {
      version = candidate;
      break;
    }
  }
  if (version === 0) return null;

  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  drawFunctionPatterns(modules, isFunction, size, version);

  const row = L[version - 1]! as [number, number, number, number, number, number];
  const [, ecPerBlock, group1, data1, group2, data2] = row;
  const dataCodewords = group1 * data1 + group2 * data2;

  const bits: boolean[] = [];
  appendBits(bits, 4, 4); // byte mode
  appendBits(bits, data.length, 8);
  for (const byte of data) appendBits(bits, byte, 8);

  const capacityBits = dataCodewords * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0 && bits.length < capacityBits) bits.push(false);

  const padBytes = [236, 17];
  let padIndex = 0;
  while (bits.length < capacityBits) {
    appendBits(bits, padBytes[padIndex % 2]!, 8);
    padIndex++;
  }

  const message = bitsToBytes(bits);

  const blocks: number[][] = [];
  let offset = 0;
  for (let index = 0; index < group1; index++, offset += data1) blocks.push(message.slice(offset, offset + data1));
  for (let index = 0; index < group2; index++, offset += data2) blocks.push(message.slice(offset, offset + data2));

  const eccs = blocks.map((block) => reedSolomon(block, ecPerBlock));

  const final: number[] = [];
  const longest = Math.max(data1, data2);
  for (let index = 0; index < longest; index++) {
    for (const block of blocks) if (index < block.length) final.push(block[index]!);
  }
  for (let index = 0; index < ecPerBlock; index++) {
    for (const ecc of eccs) final.push(ecc[index]!);
  }

  // Data, interleaved into the symbol from the bottom right upward, with mask 0 applied.
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = upward ? size - 1 - vertical : vertical;
        if (!isFunction[y]![x] && bitIndex < final.length * 8) {
          let dark = ((final[bitIndex >> 3]! >> (7 - (bitIndex & 7))) & 1) !== 0;
          if (((x + y) & 1) === 0) dark = !dark; // mask 0
          modules[y]![x] = dark;
          bitIndex++;
        }
      }
    }
    upward = !upward;
  }

  drawFormatBits(modules, size, 0);
  return { version, size, modules };
}

function appendBits(bits: boolean[], value: number, count: number): void {
  for (let i = count - 1; i >= 0; i--) bits.push(((value >> i) & 1) !== 0);
}

function bitsToBytes(bits: boolean[]): number[] {
  const result = new Array<number>(Math.floor(bits.length / 8)).fill(0);
  for (let i = 0; i < result.length; i++) {
    for (let b = 0; b < 8; b++) {
      if (bits[i * 8 + b]) result[i] = result[i]! | (1 << (7 - b));
    }
  }
  return result;
}

/* ---------------------------------------------------------------- Reed-Solomon */

function gMul(a: number, b: number): number {
  let result = 0;
  for (let i = 7; i >= 0; i--) {
    result = (result << 1) ^ ((result >> 7) * 0x11d);
    result ^= ((b >> i) & 1) * a;
  }
  return result & 0xff;
}

function reedSolomon(data: number[], degree: number): number[] {
  const divisor = new Array<number>(degree).fill(0);
  divisor[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      divisor[j] = gMul(divisor[j]!, root);
      if (j + 1 < degree) divisor[j] = divisor[j]! ^ divisor[j + 1]!;
    }
    root = gMul(root, 2);
  }

  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0]!;
    for (let j = 0; j < degree - 1; j++) result[j] = result[j + 1]!;
    result[degree - 1] = 0;
    for (let j = 0; j < degree; j++) result[j] = result[j]! ^ gMul(factor, divisor[j]!);
  }
  return result;
}

/* ---------------------------------------------------------------- patterns */

function drawFunctionPatterns(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  version: number,
): void {
  const set = (x: number, y: number): void => {
    isFunction[y]![x] = true;
  };

  for (let i = 0; i < size; i++) {
    const dark = (i & 1) === 0;
    modules[i]![6] = dark;
    set(6, i);
    modules[6]![i] = dark;
    set(i, 6);
  }

  const finder = (cx: number, cy: number): void => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const distance = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        modules[y]![x] = distance !== 2 && distance !== 4;
        set(x, y);
      }
    }
  };

  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);

  const centres = ALIGNMENT[version - 1] ?? [];
  const last = centres[centres.length - 1];
  for (const cy of centres) {
    for (const cx of centres) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === last) || (cx === last && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || x >= size || y < 0 || y >= size || isFunction[y]![x]) continue;
          modules[y]![x] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
          set(x, y);
        }
      }
    }
  }

  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      set(8, i);
      set(i, 8);
    }
  }
  set(8, 8);
  for (let i = 0; i < 8; i++) {
    set(size - 1 - i, 8);
    set(8, size - 1 - i);
  }

  if (version >= 7) {
    let remainder = version;
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >> 11) * 0x1f25);
    const bits = (version << 12) | remainder;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      modules[b]![a] = dark;
      modules[a]![b] = dark;
      set(b, a);
      set(a, b);
    }
  }
}

function drawFormatBits(modules: boolean[][], size: number, mask: number): void {
  const data = (0x01 << 3) | mask; // error correction L, then the mask
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (index: number): boolean => ((bits >> index) & 1) !== 0;

  for (let i = 0; i <= 5; i++) modules[i]![8] = bit(i);
  modules[7]![8] = bit(6);
  modules[8]![8] = bit(7);
  modules[8]![7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8]![14 - i] = bit(i);

  for (let i = 0; i < 8; i++) modules[8]![size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i]![8] = bit(i);

  // The always-dark module. The original wrote this into the top right corner and stomped a
  // format bit; scanners then refused every code. It belongs at row size-8, column 8.
  modules[size - 8]![8] = true;
}

/**
 * The symbol as one SVG path, in module units, with the quiet zone already included.
 *
 * One path rather than a rect per lit module: a version 9 symbol has over 2,000 of them, and a
 * thousand DOM nodes in a dialog is a visible stall.
 */
export function qrPath(code: QrCode, quietZone = 4): string {
  const offset = quietZone;
  const parts: string[] = [];
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.modules[y]![x]) parts.push(`M${x + offset} ${y + offset}h1v1h-1z`);
    }
  }
  return parts.join('');
}

export function qrViewBox(code: QrCode, quietZone = 4): number {
  return code.size + quietZone * 2;
}
