import fs from 'node:fs';
import path from 'node:path';

/**
 * Whole-file JSON with an atomic replace.
 *
 * The store is rewritten on every mutation, and the app can be closed at any moment - a power
 * cut while Profiles.json is half written is how a user loses every profile at once. Writing a
 * sibling temp file and renaming over the original means the reader sees either the old file
 * or the new one, never a torn one.
 */
export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    if (!text.trim()) return fallback;
    return JSON.parse(text) as T;
  } catch {
    // A corrupt store must not take the app down; the caller gets the fallback and the
    // damaged file is kept beside it for recovery rather than silently overwritten.
    try {
      if (fs.existsSync(file)) fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      /* nothing more can be done here */
    }
    return fallback;
  }
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

export function writeJsonDelayed(file: string, value: unknown, delayMs = 250): void {
  const key = path.resolve(file);
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      try {
        writeJson(file, value);
      } catch {
        /* the next mutation retries */
      }
    }, delayMs),
  );
}

const pending = new Map<string, NodeJS.Timeout>();

export function flushPending(): void {
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
}
