import { useState, type ReactNode } from 'react';
import { KeyOutlined, LoginOutlined, LogoutOutlined } from '@mui/icons-material';
import { cloud, daysLeft } from '../cloud/client';
import { useSubscription } from '../cloud/subscription';
import { ActivateDialog } from './ActivateDialog';
import { Button } from './UI';

/**
 * The subscription card.
 *
 * One row: what this account is (free, trial, premium, administrator), until when, and the two
 * actions that matter. No prose beyond that.
 */

export function SubscriptionCard({ onSignedOut }: { onSignedOut: () => void | Promise<void> }): ReactNode {
  const subscription = useSubscription();
  const [activateOpen, setActivateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { user, entitlement, tier } = subscription;
  const days = daysLeft(entitlement);
  const until = entitlement?.expiresAt ? new Date(entitlement.expiresAt) : null;
  const isAdmin = entitlement?.isAdmin === true;

  const title = !user
    ? 'Local mode'
    : tier === 'premium'
      ? isAdmin
        ? 'Administrator'
        : 'Premium'
      : tier === 'trial'
        ? 'Free trial'
        : 'Free plan';

  const meta = !user
    ? 'One profile. Sign in to activate a license and sync your plan.'
    : tier === 'free'
      ? 'One profile included. A license unlocks unlimited profiles.'
      : until
        ? `Valid until ${until.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}${tier === 'trial' ? ` — ${days} day${days === 1 ? '' : 's'} left` : ''}`
        : '';

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await cloud().signOut();
      await onSignedOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`sub-card${tier === 'premium' ? ' premium' : ''}`}>
        <div className="sub-icon" aria-hidden="true">
          <KeyOutlined sx={{ fontSize: 24 }} />
        </div>
        <div className="sub-body">
          <div className="sub-title">
            {title}
            {isAdmin ? <span className="tier-chip premium" style={{ marginLeft: 8, verticalAlign: 2 }}>Admin</span> : null}
          </div>
          <div className="sub-meta">
            {user?.email ? <><b>{user.email}</b><br /></> : null}
            {meta}
          </div>
        </div>
        <div className="sub-actions">
          {user ? (
            <>
              <Button variant="primary" size="sm" icon="key" onClick={() => setActivateOpen(true)}>
                Activate license
              </Button>
              <Button variant="ghost" size="sm" icon="logout" busy={busy} onClick={() => void signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" icon="key" onClick={onSignedOut}>
              <LoginOutlined sx={{ fontSize: 17, verticalAlign: -4, mr: 0.5 }} />
              Sign in
            </Button>
          )}
        </div>
      </div>
      {!user ? null : (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-3)' }}>
          <LogoutOutlined sx={{ fontSize: 14 }} />
          Signing out returns you to the sign-in screen. Profiles stay on this PC either way.
        </div>
      )}
      <ActivateDialog open={activateOpen} onClose={() => setActivateOpen(false)} onActivated={() => void subscription.refresh()} />
    </>
  );
}
