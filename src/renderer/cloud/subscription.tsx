import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  cloud,
  tierOf,
  type CloudEntitlement,
  type CloudUser,
  type Tier,
} from './client';

/**
 * One subscription state, shared by the whole window.
 *
 * The gate reads it to decide access, the profiles page reads it to enforce the free tier, the
 * settings page shows it, and the admin panel is only offered when the project says this account
 * is an administrator. It refreshes on mount, on demand, and when the window regains focus.
 */

export interface SubscriptionState {
  /** null while the first read is in flight */
  user: CloudUser | null;
  entitlement: CloudEntitlement | null;
  tier: Tier;
  loading: boolean;
  /** True when the session could not be verified and nothing is cached: activation is required. */
  unreachable: boolean;
  refresh(): Promise<CloudEntitlement | null>;
  signOut(): Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState | null>(null);

export function SubscriptionProvider({ user, children }: { user: CloudUser | null; children: ReactNode }): ReactNode {
  const [entitlement, setEntitlement] = useState<CloudEntitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    // A window with no account has nothing to ask the server about: local mode is the free plan,
    // and an RPC with no JWT would only spend a round trip to be told so.
    if (!user) {
      setEntitlement(null);
      setUnreachable(false);
      setLoading(false);
      return null;
    }
    try {
      const next = await cloud().myEntitlement();
      if (sequence !== requestSequence.current) return null;
      setEntitlement(next);
      setUnreachable(false);
      return next;
    } catch {
      if (sequence !== requestSequence.current) return null;
      setEntitlement(null);
      setUnreachable(true);
      return null;
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    return () => { requestSequence.current += 1; };
  }, [refresh, user?.id]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
  }, [refresh]);

  const signOut = useCallback(async () => {
    requestSequence.current += 1;
    await cloud().signOut();
    setEntitlement(null);
  }, []);

  const value = useMemo<SubscriptionState>(
    () => ({
      user,
      entitlement,
      tier: tierOf(entitlement),
      loading,
      unreachable,
      refresh,
      signOut,
    }),
    [user, entitlement, loading, unreachable, refresh, signOut],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionState {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error('useSubscription must be used inside <SubscriptionProvider>.');
  return value;
}

/** For pages that render outside the provider (the gate renders before one exists). */
export function useOptionalSubscription(): SubscriptionState | null {
  return useContext(SubscriptionContext);
}
