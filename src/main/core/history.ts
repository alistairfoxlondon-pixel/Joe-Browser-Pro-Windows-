import fs from 'node:fs';
import path from 'node:path';
import { Paths } from './paths';

/**
 * Per-profile browsing history.
 *
 * Kept as one JSON Lines file per profile, outside the browser's own user-data-dir: the browser
 * owns that folder and rewrites it on every launch, so anything stored inside it is not ours to
 * keep. A profile's history is therefore isolated by construction - two profiles literally
 * cannot share a file - and clearing it is a delete rather than a scan.
 *
 * Append-only is the right shape here: a navigation is an event, the file only grows forward,
 * and a crash mid-write costs one trailing line rather than the whole record.
 */

export interface HistoryEntry {
  profileId: string;
  /** ISO timestamp. */
  at: string;
  url: string;
  /** Empty until a title is known; the entry is still useful without one. */
  title: string;
  /** link | typed | reload | other */
  how: string;
}

const DIR = () => path.join(Paths.root, 'history');
const FILE = (profileId: string) => path.join(DIR(), `${profileId}.jsonl`);

/** A runaway page must not be able to fill the disk one navigation at a time. */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 5000;

const recent = new Map<string, HistoryEntry[]>();

function normaliseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // The fragment never leaves the browser, so recording it would be a lie about what happened.
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

export function record(profileId: string, rawUrl: string, how = 'link'): void {
  const url = normaliseUrl(rawUrl);
  if (!url || !/^https?:/i.test(url)) return;

  const entry: HistoryEntry = {
    profileId,
    at: new Date().toISOString(),
    url,
    title: '',
    how,
  };

  // Two navigations to the same address in a row are one visit, not two.
  let list = recent.get(profileId);
  if (!list) {
    list = [];
    recent.set(profileId, list);
  }
  if (list.length > 0 && list[list.length - 1]!.url === url) return;

  list.push(entry);
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);

  try {
    Paths.ensure(DIR());
    const file = FILE(profileId);
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');

    // Trim in whole rewrites only when the file has actually grown past its budget.
    const stat = fs.statSync(file);
    if (stat.size > MAX_BYTES) {
      const keep = list.slice(-Math.floor(MAX_ENTRIES / 2));
      fs.writeFileSync(file, keep.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
      recent.set(profileId, keep);
    }
  } catch {
    // A locked or unwritable file loses this entry; the session keeps working.
  }
}

export function attachTitle(profileId: string, url: string, title: string): void {
  const list = recent.get(profileId);
  if (!list || !title) return;
  const target = normaliseUrl(url);
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]!;
    if (item.url === target && !item.title) {
      item.title = title.slice(0, 300);
      break;
    }
  }
}

export function list(profileId: string, limit = 500): HistoryEntry[] {
  // The in-memory list is already newest-last and capped; fall back to disk on a fresh process.
  const memory = recent.get(profileId);
  if (memory && memory.length > 0) {
    return memory.slice(-limit).reverse();
  }

  try {
    const file = FILE(profileId);
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n').filter(Boolean);
    const parsed: HistoryEntry[] = [];
    for (const line of lines.slice(-limit)) {
      try {
        parsed.push(JSON.parse(line) as HistoryEntry);
      } catch {
        /* a torn last line from a crash is skipped, not fatal */
      }
    }
    return parsed.reverse();
  } catch {
    return [];
  }
}

export function clear(profileId: string): number {
  recent.delete(profileId);
  try {
    const file = FILE(profileId);
    if (!fs.existsSync(file)) return 0;
    const size = fs.statSync(file).size;
    fs.rmSync(file, { force: true });
    return size;
  } catch {
    return 0;
  }
}

export function clearAll(): void {
  recent.clear();
  try {
    if (!fs.existsSync(DIR())) return;
    for (const name of fs.readdirSync(DIR())) {
      fs.rmSync(path.join(DIR(), name), { force: true });
    }
  } catch {
    /* nothing more can be done */
  }
}

export function sizeOf(profileId: string): number {
  try {
    return fs.statSync(FILE(profileId)).size;
  } catch {
    return 0;
  }
}
