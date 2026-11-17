import fs from 'node:fs';
import { Paths } from './paths';
import { log } from './log';

/**
 * Free-space checks.
 *
 * A workspace needs real room: a downloaded build is a few hundred megabytes and every profile
 * keeps its own cache. When the volume fills, Chromium fails with a message no user can act on
 * ("Failed to create network context data directory"), so the check happens first and the
 * problem is stated in plain words.
 *
 * The floor is deliberately not the size of what is about to be written: a disk with 40 MB left
 * will take a 30 MB download and then corrupt the store on the next save. Anything under 512 MB
 * is treated as full for the purposes of a download, and anything under 64 MB as full for the
 * purposes of a launch.
 */

const DOWNLOAD_FLOOR = 512 * 1024 * 1024;
const LAUNCH_FLOOR = 64 * 1024 * 1024;

/** Free bytes on the volume that holds `target`, or -1 when it cannot be determined. */
export function freeBytes(target = Paths.root): number {
  try {
    const stat = fs.statfsSync(target);
    return Number(stat.bavail) * Number(stat.bsize);
  } catch {
    return -1;
  }
}

export function human(bytes: number): string {
  if (bytes < 0) return 'unknown';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${Math.round(bytes / 1_048_576)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export class DiskFullError extends Error {
  readonly free: number;
  readonly needed: number;
  constructor(what: string, needed: number, free: number) {
    super(
      `Not enough free disk space to ${what}. It needs about ${human(needed)} and only ${human(free)} ` +
        'is free on this drive. Free some space, or clear old profile caches from Tools, and try again.',
    );
    this.name = 'DiskFullError';
    this.free = free;
    this.needed = needed;
  }
}

/**
 * Throws a message a user can act on when the target volume cannot hold `neededBytes`.
 *
 * `neededBytes` is what the operation itself will write. The floor is added on top, because a
 * disk that ends the write with zero bytes left is a disk whose next save fails.
 */
export function requireSpace(neededBytes: number, what: string, floor = DOWNLOAD_FLOOR): number {
  const free = freeBytes();
  if (free >= 0 && free < neededBytes + floor) {
    throw new DiskFullError(what, neededBytes + floor, free);
  }
  return free;
}

/** True when the volume cannot hold another launch. Cheap enough to call on every open. */
export function launchSpaceOk(): { ok: boolean; free: number } {
  const free = freeBytes();
  if (free < 0) return { ok: true, free };
  return { ok: free >= LAUNCH_FLOOR, free };
}

/**
 * True when a raw I/O failure is really the disk being full.
 *
 * The codes differ by platform and Node releases: ENOSPC on Windows and Linux, EDQUOT on a
 * quota, and a bare "no space" message when the error came back from Chromium's stderr rather
 * than from `fs`.
 */
export function isDiskFull(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (code === 'ENOSPC' || code === 'EDQUOT') return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  const full = /no space left|disk is full|insufficient (disk|storage)|not enough (free )?(disk )?space/i.test(message);
  if (full) log.error('a write failed because the disk is full', error);
  return full;
}
