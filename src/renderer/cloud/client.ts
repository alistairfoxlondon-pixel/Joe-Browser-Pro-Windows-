import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The cloud account layer.
 *
 * Every person who uses the app has one Joe Browser account, held in Supabase. Registration and
 * sign-in are email + password; a registration is usable immediately because the project does
 * not require email confirmation. Licensing is enforced by the project itself - the app asks,
 * the project answers, the app obeys - so a modified client cannot mint itself an entitlement.
 *
 * The publishable key ships with the app on purpose: it is the public key for this desktop
 * client and is safe to embed. The secret keys never leave the project.
 */

export const SUPABASE_URL = 'https://djlmbsaltjqsqpwqdvsg.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CRVBySmRYTGEVkoio1Z3Dg_rT6LI-tr';

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'joe-cloud-session',
      },
    });
  }
  return client;
}

export interface CloudUser {
  id: string;
  email: string;
}

export interface CloudEntitlement {
  /** ISO timestamp at which the entitlement ends, or null when there is none. */
  expiresAt: string | null;
  /** The server's clock at the moment this was read - never the device's. */
  serverTime: string;
  isAdmin: boolean;
  isBlocked: boolean;
  plan: 'trial' | 'premium' | null;
  /** 'server' when the project answered, 'cache' when the device was offline. */
  source: 'server' | 'cache';
}

export type Tier = 'premium' | 'trial' | 'free';

/** The one profile a free account is allowed to keep. Premium and trial are unlimited. */
export const FREE_PROFILE_LIMIT = 1;
/** Trial length granted on sign-up. */
export const TRIAL_DAYS = 7;
/** License durations offered in the admin panel. */
export const PLAN_MONTHLY_SECONDS = 2678400; // 31 days
export const PLAN_YEARLY_SECONDS = 31536000; // 365 days

export function tierOf(entitlement: CloudEntitlement | null): Tier {
  if (!entitlement) return 'free';
  if (entitlement.isAdmin) return 'premium';
  if (entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() > new Date(entitlement.serverTime).getTime()) {
    return entitlement.plan === 'trial' ? 'trial' : 'premium';
  }
  return 'free';
}

export function daysLeft(entitlement: CloudEntitlement | null): number {
  if (!entitlement?.expiresAt) return 0;
  const ms = new Date(entitlement.expiresAt).getTime() - new Date(entitlement.serverTime).getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

interface EntitlementCache {
  expiresAt: string | null;
  serverTime: string;
  isAdmin: boolean;
  plan: 'trial' | 'premium' | null;
  savedAt: number;
}

const CACHE_KEY = 'joe-entitlement-cache';

function readCache(): CloudEntitlement | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EntitlementCache;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      expiresAt: parsed.expiresAt ?? null,
      serverTime: new Date(Math.max(Date.parse(parsed.serverTime || '') || 0, Date.now())).toISOString(),
      isAdmin: Boolean(parsed.isAdmin),
      isBlocked: false,
      plan: parsed.plan ?? null,
      source: 'cache',
    };
  } catch {
    return null;
  }
}

function writeCache(entry: CloudEntitlement): void {
  try {
    const payload: EntitlementCache = {
      expiresAt: entry.expiresAt,
      serverTime: entry.serverTime,
      isAdmin: entry.isAdmin,
      plan: entry.plan,
      savedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* a full or unavailable store must not break the gate */
  }
}

export interface AdminUser {
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string | null;
  isBlocked: boolean;
  plan: string | null;
}

export interface AdminCode {
  id: string;
  kind: string;
  durationSeconds: number;
  createdAt: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
  revokedAt: string | null;
}

export interface AdminTrialClaim {
  userId: string;
  email: string;
  claimedAt: string;
}

export interface CreatedCode {
  code: string;
  id: string;
  createdAt: string;
}

/** The seam the test-suite substitutes; the real implementation is the Supabase project. */
export interface CloudApi {
  signInWithPassword(email: string, password: string): Promise<CloudUser>;
  signUp(email: string, password: string): Promise<CloudUser>;
  signOut(): Promise<void>;
  currentUser(): Promise<CloudUser | null>;
  myEntitlement(): Promise<CloudEntitlement>;
  startTrial(): Promise<CloudEntitlement & { started: boolean }>;
  redeemCode(code: string): Promise<{ expiresAt: string | null; serverTime: string }>;
  adminListUsers(): Promise<AdminUser[]>;
  adminListCodes(): Promise<AdminCode[]>;
  adminListTrialClaims(): Promise<AdminTrialClaim[]>;
  adminCreateCodes(kind: 'premium' | 'trial', durationSeconds: number, count: number): Promise<CreatedCode[]>;
  adminRevokeCode(id: string): Promise<void>;
  adminSetBlocked(userId: string, blocked: boolean): Promise<void>;
  adminSetExpiry(userId: string, expiresAt: string): Promise<void>;
}

function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

function describe(message: string | undefined, fallback: string): string {
  const text = (message ?? '').trim();
  if (!text) return fallback;
  // Postgres raises short, plain messages ('Invalid or unavailable code'); use them as they are.
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

const realApi: CloudApi = {
  async signInWithPassword(email, password) {
    const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(describe(error.message, 'Could not sign in. Check the email and password.'));
    const user = data.user;
    if (!user?.email) throw new Error('The account did not come back from the server. Try again.');
    return { id: user.id, email: user.email };
  },

  async signUp(email, password) {
    const { data, error } = await supabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { product: 'joe-browser' } },
    });
    if (error) throw new Error(describe(error.message, 'Could not create the account. Try again.'));
    const user = data.user;
    if (!user?.email) throw new Error('The account did not come back from the server. Try again.');
    // Registrations confirm themselves (the project's mailer auto-confirms), so a session exists
    // immediately; when it does not, resend once and report honestly.
    if (!data.session) {
      const { error: retryError } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (retryError) throw new Error('Account created. Sign in with the same details.');
    }
    return { id: user.id, email: user.email };
  },

  async signOut() {
    await supabase().auth.signOut();
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* nothing to clean */
    }
  },

  async currentUser() {
    const { data, error } = await supabase().auth.getSession();
    if (error) throw new Error(describe(error.message, 'Could not read the session.'));
    const user = data.session?.user;
    return user?.email ? { id: user.id, email: user.email } : null;
  },

  async myEntitlement() {
    const { data, error } = await supabase().rpc('msap_my_entitlement');
    if (error) {
      const cached = readCache();
      if (cached) return cached;
      throw new Error(`Could not reach the licensing service. ${describe(error.message, '')}`.trim());
    }
    const row = Array.isArray(data) ? data[0] : data;
    const entitlement: CloudEntitlement = {
      expiresAt: row?.expires_at ?? null,
      serverTime: row?.server_time ?? new Date().toISOString(),
      isAdmin: Boolean(row?.is_admin),
      isBlocked: Boolean(row?.is_blocked),
      plan: row?.plan === 'trial' ? 'trial' : row?.plan === 'premium' ? 'premium' : row?.expires_at ? 'premium' : null,
      source: 'server',
    };
    writeCache(entitlement);
    return entitlement;
  },

  async startTrial() {
    const { data, error } = await supabase().rpc('msap_start_trial');
    if (error) throw new Error(describe(error.message, 'Could not start the trial.'));
    const row = Array.isArray(data) ? data[0] : data;
    const entitlement: CloudEntitlement & { started: boolean } = {
      expiresAt: row?.expires_at ?? null,
      serverTime: row?.server_time ?? new Date().toISOString(),
      isAdmin: Boolean(row?.is_admin),
      isBlocked: Boolean(row?.is_blocked),
      plan: row?.plan === 'premium' ? 'premium' : 'trial',
      source: 'server',
      started: Boolean(row?.started),
    };
    writeCache(entitlement);
    return entitlement;
  },

  async redeemCode(code) {
    const normalized = normalizeCode(code);
    if (normalized.length !== 40) throw new Error('A license key is 40 characters - check it and try again.');
    const { data, error } = await supabase().rpc('msap_redeem_code', { p_code: normalized });
    if (error) throw new Error(describe(error.message, 'That license key was not accepted.'));
    const row = Array.isArray(data) ? data[0] : data;
    const result = { expiresAt: row?.expires_at ?? null, serverTime: row?.server_time ?? new Date().toISOString() };
    // Fold the fresh expiry into the cache so the gate lifts immediately.
    try {
      const current = await realApi.myEntitlement();
      writeCache({ ...current, expiresAt: result.expiresAt, serverTime: result.serverTime });
    } catch {
      /* the next refresh will read it anyway */
    }
    return result;
  },

  async adminListUsers() {
    const { data, error } = await supabase().rpc('msap_admin_users');
    if (error) throw new Error(describe(error.message, 'Could not load the user list.'));
    return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
      userId: String(row.user_id),
      email: String(row.email),
      createdAt: String(row.created_at),
      expiresAt: (row.expires_at as string | null) ?? null,
      isBlocked: Boolean(row.is_blocked),
      plan: (row.plan as string | null) ?? null,
    }));
  },

  async adminListCodes() {
    const { data, error } = await supabase().rpc('msap_admin_codes');
    if (error) throw new Error(describe(error.message, 'Could not load the license keys.'));
    return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      kind: String(row.kind),
      durationSeconds: Number(row.duration_seconds),
      createdAt: String(row.created_at),
      redeemedAt: (row.redeemed_at as string | null) ?? null,
      redeemedBy: (row.redeemed_by as string | null) ?? null,
      revokedAt: (row.revoked_at as string | null) ?? null,
    }));
  },

  async adminListTrialClaims() {
    const { data, error } = await supabase().rpc('msap_admin_trial_claims');
    if (error) return [];
    return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
      userId: String(row.user_id),
      email: String(row.email),
      claimedAt: String(row.claimed_at),
    }));
  },

  async adminCreateCodes(kind, durationSeconds, count) {
    const created: CreatedCode[] = [];
    for (let index = 0; index < count; index += 1) {
      const { data, error } = await supabase().rpc('msap_create_code', {
        p_duration_seconds: durationSeconds,
        p_kind: kind,
      });
      if (error) throw new Error(describe(error.message, 'Could not generate a license key.'));
      const row = Array.isArray(data) ? data[0] : data;
      created.push({ code: String(row?.code), id: String(row?.id), createdAt: String(row?.created_at) });
    }
    return created;
  },

  async adminRevokeCode(id) {
    const { error } = await supabase().rpc('msap_admin_revoke_code', { p_id: id });
    if (error) throw new Error(describe(error.message, 'Could not revoke that key.'));
  },

  async adminSetBlocked(userId, blocked) {
    const { error } = await supabase().rpc('msap_admin_set_blocked', { p_user_id: userId, p_blocked: blocked });
    if (error) throw new Error(describe(error.message, 'Could not update the account.'));
  },

  async adminSetExpiry(userId, expiresAt) {
    const { error } = await supabase().rpc('msap_admin_set_expiry', { p_user_id: userId, p_expires_at: expiresAt });
    if (error) throw new Error(describe(error.message, 'Could not update the expiry.'));
  },
};

/** The API the app actually calls - the test-suite can substitute `globalThis.__joeCloud`. */
export function cloud(): CloudApi {
  const override = (globalThis as { __joeCloud?: CloudApi }).__joeCloud;
  return override ?? realApi;
}
