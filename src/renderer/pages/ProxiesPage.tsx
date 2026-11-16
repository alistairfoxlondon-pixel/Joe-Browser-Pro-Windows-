import { useMemo, useState } from 'react';
import type { ProfileSummary, ProxyCheckResult } from '../../shared/types';
import { bridge } from '../bridge';
import { Empty, Spinner } from '../components/UI';
import { messageOf } from '../util';

/**
 * The proxy view.
 *
 * Profiles own their proxies, so this page is a cross-section of them: what each profile goes
 * out through, whether that exit answers, and where it says it is. The "direct" check is here
 * because "is the proxy working" is only answerable next to "what does my own connection look
 * like".
 */
export function ProxiesPage({
  profiles,
  toast,
}: {
  profiles: ProfileSummary[];
  toast(kind: 'info' | 'success' | 'warn' | 'error', title: string, detail?: string): void;
}) {
  const [results, setResults] = useState<Record<string, ProxyCheckResult | 'checking'>>({});
  const [direct, setDirect] = useState<ProxyCheckResult | null>(null);
  const [checkingDirect, setCheckingDirect] = useState(false);

  const withProxy = useMemo(
    () => profiles.filter((profile) => profile.proxyLabel !== 'Direct'),
    [profiles],
  );

  async function check(profile: ProfileSummary) {
    setResults((current) => ({ ...current, [profile.id]: 'checking' }));
    try {
      const full = await bridge().getProfile(profile.id);
      if (!full) throw new Error('That profile no longer exists.');
      const result = await bridge().checkProxy(full.proxy);
      setResults((current) => ({ ...current, [profile.id]: result }));
      if (result.ok) {
        await bridge().updateProfile(profile.id, {
          proxy: {
            ...full.proxy,
            lastIp: result.ip,
            lastCountry: result.country,
            lastCountryCode: result.countryCode,
            lastCity: result.city,
            lastTimezone: result.timezone,
          },
        });
      }
    } catch (error) {
      toast('error', `Could not test ${profile.name}`, messageOf(error));
      setResults((current) => {
        const next = { ...current };
        delete next[profile.id];
        return next;
      });
    }
  }

  async function checkAll() {
    for (const profile of withProxy) await check(profile);
  }

  async function checkDirect() {
    setCheckingDirect(true);
    try {
      setDirect(
        await bridge().checkProxy({
          type: 'none',
          host: '',
          port: 0,
          user: '',
          passwordEnc: '',
          lastIp: '',
          lastCountry: '',
          lastCountryCode: '',
          lastTimezone: '',
          lastCity: '',
          fallbackDirect: true,
        }),
      );
    } catch (error) {
      toast('error', 'Could not check the direct connection', messageOf(error));
    } finally {
      setCheckingDirect(false);
    }
  }

  return (
    <>
      <div className="main-head">
        <div>
          <h1 className="main-title">Proxies</h1>
          <p className="main-sub">
            Each profile owns its proxy. Passwords are held by the local relay, so they never
            appear in a browser command line.
          </p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={checkDirect} disabled={checkingDirect}>
            {checkingDirect ? <Spinner /> : null} Check direct connection
          </button>
          <button className="btn btn-primary" onClick={checkAll} disabled={withProxy.length === 0}>
            Test every proxy
          </button>
        </div>
      </div>

      <div className="main-body">
        {direct ? (
          <div className="list" style={{ marginBottom: 16 }}>
            <div className="list-row">
              <div className="list-main">
                <div className="list-title">This machine, directly</div>
                <div className="list-sub mono">
                  {direct.ok
                    ? `${direct.ip} · ${direct.city || direct.country} · ${direct.timezone || 'time zone unknown'}`
                    : direct.error}
                </div>
              </div>
              <span className={`chip ${direct.ok ? 'ok' : 'warn'}`}>
                {direct.ok ? `${direct.latencyMs} ms` : 'failed'}
              </span>
            </div>
          </div>
        ) : null}

        {withProxy.length === 0 ? (
          <Empty
            icon="⇄"
            title="No profile has a proxy"
            body="Open a profile’s editor and choose a proxy type. The profile’s clock and language will follow the exit country once it answers."
          />
        ) : (
          <div className="list">
            {withProxy.map((profile) => {
              const result = results[profile.id];
              const busy = result === 'checking';

              return (
                <div className="list-row" key={profile.id}>
                  <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="list-main">
                    <div className="list-title">{profile.name}</div>
                    <div className="list-sub mono">
                      {profile.proxyDetail}
                      {result && result !== 'checking'
                        ? ` · ${result.ok ? `${result.ip} · ${result.city || result.country}` : result.error}`
                        : ''}
                    </div>
                  </div>

                  {result && result !== 'checking' ? (
                    <span className={`chip ${result.ok ? 'ok' : 'warn'}`}>
                      {result.ok ? `${result.latencyMs} ms` : 'failed'}
                    </span>
                  ) : null}

                  {profile.running ? (
                    <button
                      className="btn btn-sm"
                      title="Apply the edited proxy to the running session without closing its tabs"
                      onClick={async () => {
                        try {
                          await bridge().applyProxyToSession(profile.id);
                          toast('success', 'Proxy applied to the running session');
                        } catch (error) {
                          toast('warn', 'Could not swap the proxy', messageOf(error));
                        }
                      }}
                    >
                      Swap now
                    </button>
                  ) : null}

                  <button className="btn btn-sm" onClick={() => void check(profile)} disabled={busy}>
                    {busy ? <Spinner /> : null}
                    {busy ? 'Testing' : 'Test'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
