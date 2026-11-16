/**
 * A small deterministic PRNG.
 *
 * Every profile carries an integer seed. The whole identity is a pure function of that seed,
 * which is what makes a fingerprint reproducible: reopening a profile next month answers the
 * same canvas hash as it did on the day it was made, so a site sees one stable machine rather
 * than a different one each visit.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Fold to uint32; a zero seed still has to produce a usable stream.
    this.state = (seed >>> 0) || 0x9e3779b9;
    for (let i = 0; i < 4; i++) this.next();
  }

  /** mulberry32 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() from an empty pool');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Pick by weight; weights need not be normalised. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [value, weight] of items) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return items[items.length - 1]![0];
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  shuffle<T>(items: T[]): T[] {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }

  /** A fresh 32-bit seed that is unlikely to collide with an existing one. */
  static seed(): number {
    return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
  }
}

/** Stable 53-bit string hash, used for canvas/audio seeds and uniqueness signatures. */
export function hashString(input: string): number {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
