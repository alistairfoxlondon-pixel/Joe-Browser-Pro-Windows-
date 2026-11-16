import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppSettings,
  Profile,
  ProfileSummary,
  ProxyConfig,
  ToolConfig,
} from '../../shared/types';
import { Paths } from './paths';
import { readJson, writeJson, writeJsonDelayed, flushPending } from './atomic';
import { normalizeProxy, proxyDetail, proxyLabel, proxyEnabled } from './proxy';
import { decryptSecret, encryptSecret } from './secrets';
import { generateFingerprint, rollUnique } from './fingerprint';
import { Rng } from './rng';

/**
 * The profile store.
 *
 * One JSON document, written atomically, with passwords never leaving it in the clear. The
 * shape is versioned so a future release can migrate rather than guess.
 */

const STORE_VERSION = 2;
const PROFILES_FILE = () => Paths.storeFile('Profiles.json');
const SETTINGS_FILE = () => Paths.storeFile('Settings.json');

interface StoreShape {
  version: number;
  profiles: Profile[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'en',
  defaultEngine: 'chrome',
  defaultKernelId: '',
  startPage: 'about:blank',
  extensionsEnabled: true,
  cacheDir: '',
  clearCacheOnExit: false,
};

const ACCENTS = ['#4f8cff', '#7c5cff', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#a855f7'];

function defaultTools(): ToolConfig {
  return {
    humanPaste: true,
    humanPasteSpeed: 'natural',
    proxyWatch: true,
    proxyWatchInterval: 60,
    enableRightClick: true,
    unlockSelection: true,
    customExtensions: '',
  };
}

let cache: StoreShape | null = null;
const listeners = new Set<() => void>();

function load(): StoreShape {
  if (cache) return cache;
  const raw = readJson<StoreShape>(PROFILES_FILE(), { version: STORE_VERSION, profiles: [] });
  const profiles = Array.isArray(raw.profiles) ? raw.profiles.map(sanitizeProfile) : [];
  cache = { version: STORE_VERSION, profiles };
  return cache;
}

function sanitizeProfile(input: Profile): Profile {
  const proxy = normalizeProxy(input.proxy);
  return {
    id: input.id || crypto.randomUUID(),
    name: (input.name ?? 'Profile').slice(0, 80),
    group: input.group ?? '',
    tags: Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string').slice(0, 12) : [],
    notes: input.notes ?? '',
    status: input.status === 'archived' ? 'archived' : 'idle',
    startUrl: input.startUrl || 'about:blank',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    lastOpenedAt: input.lastOpenedAt ?? '',
    engine: input.engine || 'chrome',
    kernelId: input.kernelId ?? '',
    browserVersion: input.browserVersion || '157.0.8103.41',
    proxy,
    tools: { ...defaultTools(), ...(input.tools ?? {}) },
    fingerprint: { ...generateFingerprint({ seed: input.fingerprint?.seed }), ...(input.fingerprint ?? {}) },
    flags: input.flags ?? {},
  };
}

function persist(immediate = false): void {
  const store = load();
  store.version = STORE_VERSION;
  if (immediate) writeJson(PROFILES_FILE(), store);
  else writeJsonDelayed(PROFILES_FILE(), store, 200);
  for (const listener of listeners) listener();
}

export function onStoreChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function flushStore(): void {
  if (cache) writeJson(PROFILES_FILE(), cache);
  flushPending();
}

export function allProfiles(): Profile[] {
  return load().profiles.slice();
}

export function allFingerprints() {
  return load().profiles.map((p) => p.fingerprint);
}

export function findProfile(id: string): Profile | null {
  return load().profiles.find((p) => p.id === id) ?? null;
}

export function findProfileOrThrow(id: string): Profile {
  const found = findProfile(id);
  if (!found) throw new Error('That profile no longer exists.');
  return found;
}

/** The password is decrypted on demand and never held in the stored object. */
export function proxyPasswordOf(profile: Profile): string {
  return decryptSecret(profile.proxy.passwordEnc);
}

export interface CreateProfileInput extends Partial<Profile> {
  copyFingerprintFrom?: string;
}

export function createProfile(input: CreateProfileInput): Profile {
  const store = load();
  const now = new Date().toISOString();

  const source = input.copyFingerprintFrom ? findProfile(input.copyFingerprintFrom) : null;

  let fingerprint;
  if (source) {
    // A duplicate is meant to be the same machine with different storage, so the identity is
    // copied verbatim rather than rolled again.
    fingerprint = { ...source.fingerprint, seed: source.fingerprint.seed };
  } else {
    const rolled = rollUnique(allFingerprints(), {
      os: input.fingerprint?.os,
      deviceType: input.fingerprint?.deviceType,
      engine: input.engine ?? DEFAULT_SETTINGS.defaultEngine,
      browserVersion: input.browserVersion,
      countryCode: input.proxy?.lastCountryCode,
    });
    fingerprint = rolled.fingerprint;
  }

  const proxy = normalizeProxy(input.proxy);
  if (input.proxy?.password) {
    proxy.passwordEnc = encryptSecret(input.proxy.password);
    proxy.password = '';
  }

  const name = uniqueName(store.profiles, input.name?.trim() || 'New profile');

  const profile = sanitizeProfile({
    ...(input as Profile),
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: '',
    status: 'idle',
    fingerprint,
    proxy,
    tools: { ...defaultTools(), ...(input.tools ?? {}) },
    flags: {},
  });

  store.profiles.push(profile);
  persist(true);
  return profile;
}

function uniqueName(profiles: Profile[], wanted: string): string {
  const taken = new Set(profiles.map((p) => p.name.toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;
  let n = 2;
  while (taken.has(`${wanted} ${n}`.toLowerCase())) n++;
  return `${wanted} ${n}`;
}

export function updateProfile(id: string, patch: Partial<Profile>): Profile {
  const store = load();
  const index = store.profiles.findIndex((p) => p.id === id);
  if (index < 0) throw new Error('That profile no longer exists.');

  const current = store.profiles[index]!;

  let proxy: ProxyConfig = current.proxy;
  if (patch.proxy) {
    proxy = normalizeProxy({ ...current.proxy, ...patch.proxy });
    if (patch.proxy.password !== undefined && patch.proxy.password !== '') {
      proxy.passwordEnc = encryptSecret(patch.proxy.password);
    }
    proxy.password = '';
  }

  const merged: Profile = {
    ...current,
    ...patch,
    // Identity and creation time are not editable through a patch.
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    proxy,
    tools: { ...current.tools, ...(patch.tools ?? {}) },
    fingerprint: { ...current.fingerprint, ...(patch.fingerprint ?? {}) },
  };

  store.profiles[index] = sanitizeProfile(merged);
  persist(true);
  return store.profiles[index]!;
}

export function deleteProfile(id: string): void {
  const store = load();
  const index = store.profiles.findIndex((p) => p.id === id);
  if (index < 0) return;
  store.profiles.splice(index, 1);
  persist(true);

  // The browser's own data goes with it, but only inside the profile store.
  const dir = path.resolve(Paths.profileData(id));
  const guard = path.resolve(Paths.profiles) + path.sep;
  if (dir.startsWith(guard) && fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a locked cookie database can be cleared on the next start instead of failing the delete */
    }
  }
}

export function duplicateProfile(id: string): Profile {
  const source = findProfileOrThrow(id);
  return createProfile({
    ...source,
    name: source.name,
    copyFingerprintFrom: id,
    lastOpenedAt: '',
  } as CreateProfileInput);
}

export function rerollFingerprint(id: string): Profile {
  const profile = findProfileOrThrow(id);
  const others = allProfiles().filter((p) => p.id !== id).map((p) => p.fingerprint);
  const rolled = rollUnique(others, {
    os: profile.fingerprint.os,
    deviceType: profile.fingerprint.deviceType,
    engine: profile.engine,
    browserVersion: profile.browserVersion,
    countryCode: profile.proxy.lastCountryCode || undefined,
  });
  const seed = Rng.seed();
  return updateProfile(id, { fingerprint: { ...rolled.fingerprint, seed } });
}

export function summarise(profile: Profile, running: boolean): ProfileSummary {
  const accent = ACCENTS[Math.abs(hash(profile.id)) % ACCENTS.length]!;
  return {
    id: profile.id,
    name: profile.name,
    group: profile.group,
    tags: profile.tags,
    status: profile.status,
    engine: profile.engine,
    browserVersion: profile.browserVersion,
    proxyLabel: proxyLabel(profile.proxy),
    proxyDetail: proxyDetail(profile.proxy),
    lastOpenedAt: profile.lastOpenedAt,
    running,
    os: profile.fingerprint.os,
    colors: { accent, tint: `${accent}22` },
  };
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

export function proxyIsUsable(profile: Profile): boolean {
  return !proxyEnabled(profile.proxy) || Boolean(decryptSecret(profile.proxy.passwordEnc)) || !profile.proxy.user;
}

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(SETTINGS_FILE(), {}) };
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = { ...getSettings(), ...patch };
  writeJson(SETTINGS_FILE(), merged);
  for (const listener of listeners) listener();
  return merged;
}

export function countProfiles(): number {
  return load().profiles.length;
}

export function clearStore(): void {
  cache = { version: STORE_VERSION, profiles: [] };
  writeJson(PROFILES_FILE(), cache);
  writeJson(SETTINGS_FILE(), DEFAULT_SETTINGS);
  for (const listener of listeners) listener();
}
