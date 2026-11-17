import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { AccountSummary, LockState } from '../../shared/types';
import { bridge } from '../bridge';
import { useI18n } from '../i18n';
import { Icon } from '../components/Icon';
import { Banner, Button, Field, Segmented } from '../components/UI';
import { messageOf } from '../util';

/**
 * The way in.
 *
 * Two screens share one frame, because they are the same question asked twice: who are you, and
 * prove it. `gate` is first-run registration and sign-in - there is no account yet, so there is
 * nothing behind this window to protect. `locked` is the app lock: the session marker already
 * names someone, and a PIN or a six-digit code stands between them and the profile list.
 *
 * The gate is deliberately not a wall. `Skip` is offered when no account exists, because the
 * original's account was always local and never protected anything a Windows user could not
 * already read - making it mandatory would be theatre. It becomes mandatory the moment a PIN or
 * a second factor is set, which is the point at which it protects something real.
 */

export function AccountGate({
  onDone,
}: {
  onDone: (account: AccountSummary | null) => void | Promise<void>;
}): ReactNode {
  const { t } = useI18n();
  const [mode, setMode] = useState<'signin' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const firstField = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void bridge()
      .listAccounts()
      .then((list) => {
        setAccounts(list);
        if (list.length > 0) setMode('signin');
        const last = list[0];
        if (last) setEmail(last.email);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    firstField.current?.focus();
  }, [mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const account =
        mode === 'register'
          ? await bridge().registerAccount({ email, password, displayName: name })
          : await bridge().signIn({ email, password, code: needsCode ? code : undefined });
      await onDone(account);
    } catch (failure) {
      const text = messageOf(failure);
      if (/six-digit code/i.test(text)) {
        setNeedsCode(true);
        setError(t('gate.code.hint'));
      } else {
        setError(text);
      }
    } finally {
      setBusy(false);
    }
  };

  const registerable = email.trim().length > 0 && password.length >= 6 && mode === 'register';

  return (
    <div className="gate">
      <div className="gate-art">
        <div className="gate-art-inner">
          <div className="gate-brand">
            <div className="brand-mark lg">J</div>
            <div>
              <div className="gate-brand-name">{t('app.title')}</div>
              <div className="gate-brand-sub">{t('app.tagline')}</div>
            </div>
          </div>


        </div>
      </div>

      <div className="gate-form">
        <div className="gate-form-inner">
          <h1 className="gate-title">
            {mode === 'register' ? t('gate.welcome') : t('gate.again')}
          </h1>
          <p className="gate-sub">{t('gate.sub')}</p>

          {accounts.length > 1 ? (
            <div className="gate-accounts">
              {accounts.slice(0, 4).map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="gate-account"
                  aria-selected={email === account.email}
                  onClick={() => {
                    setEmail(account.email);
                    setMode('signin');
                  }}
                >
                  <span className="avatar sm">{(account.displayName || account.email).slice(0, 1).toUpperCase()}</span>
                  <span className="grow truncate">
                    <b>{account.displayName}</b>
                    <span>{account.email}</span>
                  </span>
                  {account.pinEnabled || account.twoFactorEnabled ? (
                    <Icon name={account.pinEnabled ? 'lock' : 'shield'} size={13} />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <form className="stack" onSubmit={submit}>
            <div className="segmented gate-mode">
              <Segmented
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setError('');
                  setNeedsCode(false);
                }}
                options={[
                  { id: 'register' as const, label: t('gate.register') },
                  { id: 'signin' as const, label: t('gate.signin') },
                ]}
              />
            </div>

            <Field label={t('gate.email')}>
              <input
                ref={firstField}
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                spellCheck={false}
                required
              />
            </Field>

            {mode === 'register' ? (
              <Field label={t('gate.name')}>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Joe"
                  autoComplete="nickname"
                />
              </Field>
            ) : null}

            <Field label={t('gate.password')} hint={mode === 'register' ? t('gate.password.hint') : undefined}>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={mode === 'register' ? 6 : undefined}
                required
              />
            </Field>

            {needsCode ? (
              <Field label={t('sec.totp')} hint={t('sec.totp.hint')}>
                <input
                  className="input mono num"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  autoFocus
                />
              </Field>
            ) : null}

            {error ? (
              <Banner tone="err" icon="warning">
                {error}
              </Banner>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              busy={busy}
              disabled={mode === 'register' ? !registerable : !email || !password}
            >
              {mode === 'register' ? t('gate.create') : t('gate.enter')}
            </Button>
          </form>

          <div className="gate-skip">
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => { void Promise.resolve(onDone(null)).catch((failure) => setError(messageOf(failure))); }}
              title={t('gate.skip.hint')}
            >
              {t('gate.skip')}
            </button>
          </div>

          <p className="gate-legal">{t('gate.local')}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The lock.
 *
 * Reached only when the session marker names someone and a PIN or a second factor is set. It
 * takes both when both exist: a PIN typed at launch is a lock against the person at the desk,
 * and the code is what makes it a lock against someone who knows the PIN.
 */
export function LockScreen({
  lock,
  onUnlocked,
  onSignOut,
}: {
  lock: LockState;
  onUnlocked: () => void;
  onSignOut: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const pinRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    pinRef.current?.focus();
  }, []);

  const unlock = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await bridge().unlock({ pin, code });
      onUnlocked();
    } catch (failure) {
      setAttempts((value) => value + 1);
      setError(messageOf(failure));
      setCode('');
      if (!lock.totp) setPin('');
    } finally {
      setBusy(false);
    }
  };

  // A four-digit PIN has 10,000 combinations and only 600 guesses a minute at this pace once a
  // delay is applied. The lock is against a passer-by, not a botnet, but a free retry loop is
  // still the wrong shape.
  useEffect(() => {
    if (attempts < 3) return;
    const timer = setTimeout(() => setAttempts(0), Math.min(30_000, (attempts - 2) * 3_000));
    return () => clearTimeout(timer);
  }, [attempts]);

  const throttled = attempts >= 3;
  const name = lock.account?.displayName ?? '';

  return (
    <div className="lock">
      <form className="lock-card" onSubmit={unlock}>
        <div className="lock-avatar">
          <span className="avatar lg">{(name || 'J').slice(0, 1).toUpperCase()}</span>
        </div>

        <h1 className="lock-name">{name}</h1>
        <p className="lock-email">{lock.account?.email}</p>

        <div className="stack" style={{ marginTop: 18, textAlign: 'left' }}>
          {lock.pin ? (
            <Field label={t('sec.pin')}>
              <input
                ref={pinRef}
                className="input mono lock-input"
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                inputMode="numeric"
                autoComplete="current-password"
                placeholder="••••"
              />
            </Field>
          ) : null}

          {lock.totp ? (
            <Field label={t('sec.totp')}>
              <input
                className="input mono num lock-input"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                autoFocus={!lock.pin}
              />
            </Field>
          ) : null}

          {error ? (
            <Banner tone="err" icon="warning">
              {error}
            </Banner>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            icon="unlock"
            busy={busy}
            disabled={throttled || (lock.pin && pin.length < 4) || (lock.totp && code.length !== 6)}
          >
            {throttled ? t('lock.wait') : t('btn.unlock')}
          </Button>
        </div>

        <div className="lock-foot">
          <button type="button" className="link" onClick={onSignOut}>
            {t('gate.switch')}
          </button>
        </div>
      </form>
    </div>
  );
}
