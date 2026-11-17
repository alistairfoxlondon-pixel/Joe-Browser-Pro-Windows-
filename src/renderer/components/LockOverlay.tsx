import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { LockState } from '../../shared/types';
import { bridge, onEvent } from '../bridge';
import { Logo } from './Brand';
import { Icon } from './Icon';
import { Banner, Button } from './UI';
import { messageOf } from '../util';

/**
 * The idle lock.
 *
 * The main process only emits `lock:idle` after the configured minutes of no keyboard or pointer
 * input, and only when the local identity actually has a PIN or a second factor - so reaching
 * this component always means "the desk was away". The overlay is not dismissible: the only way
 * through is the local PIN and (if configured) the authenticator code, which is what makes it a
 * lock and not a reminder.
 */

export function LockOverlay(): ReactNode {
  const [lock, setLock] = useState<LockState | null>(null);
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const off = onEvent('lock:idle', () => {
      void (async () => {
        try {
          const next = await bridge().lockState();
          if (next.state === 'locked' && next.account) {
            setLock(next);
            setPin('');
            setCode('');
            setError('');
          }
        } catch {
          /* the workspace stays usable if the lock state cannot be read */
        }
      })();
    });
    return off;
  }, []);

  if (!lock?.account) return null;

  const account = lock.account;
  const needsPin = lock.pin;
  const needsCode = lock.totp;
  const ready = (!needsPin || /^\d{4,12}$/.test(pin)) && (!needsCode || /^\d{6}$/.test(code));

  const unlock = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      await bridge().unlock({ pin, code });
      setLock(null);
    } catch (failure) {
      setError(messageOf(failure));
      setPin('');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-overlay" role="alertdialog" aria-modal="true" aria-label="Locked">
      <form className="lock-card" onSubmit={(event) => void unlock(event)}>
        <Logo size={64} className="lock-logo" />
        <h2>Joe Browser is locked</h2>
        <p>
          {account.displayName ? <><strong>{account.displayName}</strong> · </> : null}
          {account.email}
        </p>

        {error ? <Banner tone="err" icon="info">{error}</Banner> : null}

        {needsPin ? (
          <label className="lock-field">
            <span className="field-label">PIN</span>
            <input
              className="input mono num"
              type="password"
              inputMode="numeric"
              autoFocus
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="••••"
              aria-label="PIN"
            />
          </label>
        ) : null}

        {needsCode ? (
          <label className="lock-field">
            <span className="field-label">Authenticator code</span>
            <input
              className="input mono num"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus={!needsPin}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              aria-label="Authenticator code"
            />
          </label>
        ) : null}

        <Button type="submit" variant="primary" size="lg" disabled={!ready} busy={busy} icon="unlock">
          Unlock
        </Button>
        <div className="lock-hint">
          <Icon name="lock" size={12} /> The window locked after a period of inactivity.
        </div>
      </form>
    </div>
  );
}
