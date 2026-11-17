import fs from 'node:fs';
import path from 'node:path';
import type { Profile, TrashItem } from '../../shared/types';
import { Paths } from './paths';
import { log } from './log';

/**
 * The recycle bin.
 *
 * The original kept a deleted profile's JSON under `trash/` with a timestamp prefix, so deleting
 * the wrong row was reversible, and the profile's browser data was removed only when the trash
 * was emptied. The port deleted outright, which is the one behaviour in this area a user cannot
 * forgive.
 *
 * A profile's folder is NOT removed on delete while `useTrash` is on: it is renamed aside so a
 * restore brings back the logins too. Emptying the bin is what really removes it.
 */

const DIR = () => path.join(Paths.root, 'trash');

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function ensureTrash(): void {
  fs.mkdirSync(DIR(), { recursive: true });
}

/**
 * Move a profile's record, and its browser data, into the bin. Returns the file name the restore
 * path needs.
 */
export function moveToTrash(profile: Profile): string {
  ensureTrash();
  const file = path.join(DIR(), `${stamp()}-${profile.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ profile, deletedAt: new Date().toISOString() }, null, 2), 'utf8');

  const dataDir = Paths.profileData(profile.id);
  if (fs.existsSync(dataDir)) {
    const parked = path.join(DIR(), `${profile.id}.data`);
    try {
      if (fs.existsSync(parked)) fs.rmSync(parked, { recursive: true, force: true });
      fs.renameSync(dataDir, parked);
    } catch (error) {
      // A running browser holds its own folder; leaving the data in place is recoverable, whereas
      // failing the delete outright is not.
      log.warn('the deleted profile’s browser data stays in place', error);
    }
  }

  return path.basename(file);
}

export function listTrash(): TrashItem[] {
  ensureTrash();
  const items: TrashItem[] = [];

  for (const name of fs.readdirSync(DIR())) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(DIR(), name), 'utf8')) as {
        profile?: Profile;
        deletedAt?: string;
      };
      const profile = parsed.profile;
      if (!profile?.id) continue;
      const data = path.join(DIR(), `${profile.id}.data`);
      items.push({
        file: name,
        id: profile.id,
        name: profile.name || 'Untitled profile',
        group: profile.group || '',
        deletedAt: parsed.deletedAt ?? fs.statSync(path.join(DIR(), name)).mtime.toISOString(),
        bytes: exists(data) ? dirSize(data) : 0,
      });
    } catch {
      /* an unreadable trash entry is skipped, never deleted */
    }
  }

  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * Put a profile back. Returns the restored profile's id.
 *
 * The record keeps its own id, so the browser data that was renamed aside lines up with it and
 * the profile comes back with its logins intact.
 */
const restoreCache = new Map<string, Profile>();

export function restore(file: string): string {
  const source = path.join(DIR(), path.basename(file));
  if (!fs.existsSync(source)) throw new Error('That entry is no longer in the bin.');

  const parsed = JSON.parse(fs.readFileSync(source, 'utf8')) as { profile?: Profile };
  const profile = parsed.profile;
  if (!profile?.id) throw new Error('That entry has no profile in it.');

  const parked = path.join(DIR(), `${profile.id}.data`);
  const target = Paths.profileData(profile.id);
  try {
    if (fs.existsSync(parked)) {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(Paths.profiles, { recursive: true });
      fs.renameSync(parked, target);
    }
  } catch (error) {
    log.warn('the restored profile’s browser data could not be moved back', error);
  }

  restoreCache.set(path.basename(file), profile);
  fs.rmSync(source, { force: true });
  return profile.id;
}

/** Read the record out of a trash entry without restoring it. */
export function peek(file: string): Profile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(DIR(), path.basename(file)), 'utf8')) as {
      profile?: Profile;
    };
    return parsed.profile ?? null;
  } catch {
    return null;
  }
}

/** The record inside an entry, after the restore has moved it out - the caller re-creates it. */
export function peekBackup(file: string): Profile | null {
  return restoreCache.get(path.basename(file)) ?? null;
}

export function emptyTrash(): number {
  ensureTrash();
  let freed = 0;
  for (const name of fs.readdirSync(DIR())) {
    const full = path.join(DIR(), name);
    try {
      freed += exists(full) ? sizeOf(full) : 0;
      fs.rmSync(full, { recursive: true, force: true });
    } catch {
      /* a folder a browser still holds is left for the next attempt */
    }
  }
  return freed;
}

export function trashBytes(): number {
  return exists(DIR()) ? dirSize(DIR()) : 0;
}

function exists(target: string): boolean {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

function sizeOf(target: string): number {
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.size;
  return dirSize(target);
}

function dirSize(target: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const full = path.join(target, entry.name);
      total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
    }
  } catch {
    /* one unreadable folder under-counts rather than throwing */
  }
  return total;
}
