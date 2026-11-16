import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { Paths } from './paths';

/**
 * Secret handling for proxy passwords.
 *
 * On Windows this uses DPAPI through Electron's `safeStorage`, so a profile's proxy password
 * can only be decrypted by the same Windows user on the same machine - copying the data folder
 * to another PC yields ciphertext and nothing else. Where DPAPI is unavailable (Linux CI, a
 * portable run on a locked-down machine) it falls back to AES-256-GCM under a key file with
 * owner-only permissions, and says so rather than pretending the protection is the same.
 */

type SafeStorage = {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
};

let backend: SafeStorage | null = null;
let probed = false;

function safeStorage(): SafeStorage | null {
  if (probed) return backend;
  probed = true;
  try {
    // Required lazily: the store is also used by the unit tests, which run without Electron.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as { safeStorage?: SafeStorage };
    if (electron.safeStorage && electron.safeStorage.isEncryptionAvailable()) {
      backend = electron.safeStorage;
    }
  } catch {
    backend = null;
  }
  return backend;
}

const KEY_FILE = () => Paths.storeFile('key.bin');
const PREFIX_DPAPI = 'dpapi:';
const PREFIX_AES = 'aes:';

function localKey(): Buffer {
  const file = KEY_FILE();
  if (fs.existsSync(file)) return fs.readFileSync(file);
  Paths.ensure(Paths.root);
  const key = crypto.scryptSync(`${os.hostname()}:${os.userInfo().username}:joe-browser`, crypto.randomBytes(16), 32);
  fs.writeFileSync(file, key, { mode: 0o600 });
  return key;
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const dpapi = safeStorage();
  if (dpapi) {
    return PREFIX_DPAPI + dpapi.encryptString(plain).toString('base64');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', localKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX_AES + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';

  try {
    if (stored.startsWith(PREFIX_DPAPI)) {
      const dpapi = safeStorage();
      if (!dpapi) return '';
      return dpapi.decryptString(Buffer.from(stored.slice(PREFIX_DPAPI.length), 'base64'));
    }

    if (stored.startsWith(PREFIX_AES)) {
      const raw = Buffer.from(stored.slice(PREFIX_AES.length), 'base64');
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const body = raw.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', localKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    }
  } catch {
    // A store copied from another machine, or a rotated key: the safe answer is "no password"
    // rather than a crash, and the user is asked to re-enter it.
    return '';
  }

  return '';
}

export function encryptionKind(): 'dpapi' | 'aes' | 'none' {
  if (safeStorage()) return 'dpapi';
  try {
    localKey();
    return 'aes';
  } catch {
    return 'none';
  }
}
