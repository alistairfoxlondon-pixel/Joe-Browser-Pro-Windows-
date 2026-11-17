import fs from 'node:fs';
import path from 'node:path';
import { Paths } from './paths';

/**
 * A rolling log file.
 *
 * The original wrote logs because "report a problem" is not actionable without them, and the port
 * had none: a user whose profile would not open could report only that it would not open. Every
 * failure path now writes one line here, the report dialog carries the tail, and Settings can
 * open the folder.
 *
 * No secret ever goes in: proxy passwords, cookie values and page content are excluded by the
 * caller, and the tail reader redacts anything that looks like a credential anyway.
 */

const MAX_BYTES = 512 * 1024;
const KEEP_FILES = 3;

function fileFor(index = 0): string {
  return path.join(Paths.logs, index === 0 ? 'joe-browser.log' : `joe-browser.${index}.log`);
}

function rotate(): void {
  try {
    for (let index = KEEP_FILES; index >= 1; index--) {
      const from = index === 1 ? fileFor(0) : fileFor(index - 1);
      const to = fileFor(index);
      if (!fs.existsSync(from)) continue;
      if (fs.existsSync(to)) fs.rmSync(to, { force: true });
      fs.renameSync(from, to);
    }
  } catch {
    /* a log that cannot rotate must not take the app down */
  }
}

function write(level: string, message: string, error?: unknown): void {
  const stamp = new Date().toISOString();
  let line = `${stamp} ${level.padEnd(5)} ${message}`;
  if (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    line += ` :: ${detail}`;
    if (error instanceof Error && error.stack) {
      line += `\n${error.stack.split('\n').slice(1, 4).join('\n')}`;
    }
  }

  try {
    fs.mkdirSync(Paths.logs, { recursive: true });
    if (fs.existsSync(fileFor(0)) && fs.statSync(fileFor(0)).size > MAX_BYTES) rotate();
    fs.appendFileSync(fileFor(0), `${line}\n`, 'utf8');
  } catch {
    /* the log is a convenience; losing a line is better than failing the operation */
  }
}

export const log = {
  info: (message: string): void => write('INFO', message),
  warn: (message: string, error?: unknown): void => write('WARN', message, error),
  error: (message: string, error?: unknown): void => write('ERROR', message, error),
  file: (): string => fileFor(0),
};

/** The last N lines, with anything that looks like a credential removed. */
export function tail(lines = 200): string {
  try {
    const text = fs.existsSync(fileFor(0)) ? fs.readFileSync(fileFor(0), 'utf8') : '';
    if (!text) return '';
    return text
      .split('\n')
      .slice(-lines)
      .map(redact)
      .join('\n');
  } catch {
    return '';
  }
}

export function logSize(): number {
  let total = 0;
  for (let index = 0; index <= KEEP_FILES; index++) {
    try {
      total += fs.statSync(fileFor(index)).size;
    } catch {
      /* not written yet */
    }
  }
  return total;
}

export function clearLogs(): void {
  for (let index = 0; index <= KEEP_FILES; index++) {
    try {
      fs.rmSync(fileFor(index), { force: true });
    } catch {
      /* nothing more can be done */
    }
  }
}

function redact(line: string): string {
  return line
    // A proxy password in a URL: scheme://user:secret@host
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:@/\s]+:)([^@/\s]+)(@)/gi, '$1***$3')
    // A proxy password on a command line, or in a JSON field
    .replace(/(("?(?:password|passwordEnc|pass)"?\s*[:=]\s*)("?))[^",}\s]+/gi, '$1***')
    // A cookie value
    .replace(/(\b(?:cookie|set-cookie|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1***');
}
