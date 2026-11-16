import { useEffect, useState } from 'react';
import type { AppInfo, AppSettings, StoreStats } from '../../shared/types';
import { bridge } from '../bridge';
import { Field, Spinner, Toggle, bytes } from '../components/UI';
import { messageOf } from '../util';

export function SettingsPage({
  settings,
  info,
  toast,
  onSaved,
}: {
  settings: AppSettings | null;
  info: AppInfo | null;
  toast(kind: 'info' | 'success' | 'warn' | 'error', title: string, detail?: string): void;
  onSaved(next: AppSettings): void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [stats, setStats] = useState<StoreStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void bridge()
      .getStoreStats()
      .then((value) => {
        if (!cancelled) setStats(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings) {
    return (
      <div className="main-body" style={{ color: 'var(--muted)' }}>
        Reading settings…
      </div>
    );
  }

  async function save(patch: Partial<AppSettings>) {
    try {
      const next = await bridge().saveSettings(patch);
      onSaved(next);
    } catch (error) {
      toast('error', 'Could not save that setting', messageOf(error));
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await bridge().resetEverything();
      toast('success', 'Everything was reset', 'Profiles and settings were cleared.');
      setConfirmReset(false);
    } catch (error) {
      toast('error', 'Could not reset', messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="main-head">
        <div>
          <h1 className="main-title">Settings</h1>
          <p className="main-sub">Everything here is local to this machine.</p>
        </div>
      </div>

      <div className="main-body">
        <div className="list" style={{ marginBottom: 16 }}>
          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Theme</div>
              <div className="list-sub">Applies to the window immediately.</div>
            </div>
            <select
              className="select"
              style={{ width: 160 }}
              value={settings.theme}
              onChange={(event) => void save({ theme: event.target.value as 'dark' | 'light' })}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Default engine for new profiles</div>
              <div className="list-sub">A new profile uses this unless you choose otherwise.</div>
            </div>
            <select
              className="select"
              style={{ width: 190 }}
              value={settings.defaultEngine}
              onChange={(event) => void save({ defaultEngine: event.target.value })}
            >
              <option value="chrome">Google Chrome</option>
              <option value="chromium">Chromium</option>
              <option value="edge">Microsoft Edge</option>
              <option value="brave">Brave</option>
              <option value="firefox">Firefox</option>
            </select>
          </div>

          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Extensions and built-in page tools</div>
              <div className="list-sub">The master switch for every profile.</div>
            </div>
            <Toggle
              label=""
              checked={settings.extensionsEnabled}
              onChange={(value) => void save({ extensionsEnabled: value })}
            />
          </div>

          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Start page</div>
              <div className="list-sub">Where a profile opens when it has no page of its own.</div>
            </div>
            <input
              className="input mono"
              style={{ width: 240 }}
              defaultValue={settings.startPage}
              onBlur={(event) => void save({ startPage: event.target.value })}
            />
          </div>
        </div>

        <div className="section-label" style={{ marginBottom: 8 }}>
          Your data
        </div>
        <div className="list" style={{ marginBottom: 16 }}>
          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Profile folder</div>
              <div className="list-sub mono">{info?.dataDir ?? '—'}</div>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => void bridge().openDataDir?.().catch(() => undefined)}
            >
              Open folder
            </button>
          </div>

          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Space used</div>
              <div className="list-sub">
                {stats
                  ? `${bytes(stats.profilesBytes)} of profile data · ${bytes(stats.kernelsBytes)} of browser builds · ${bytes(stats.historyBytes)} of history`
                  : 'Measuring…'}
              </div>
            </div>
            <span className="chip">{stats ? bytes(stats.storeBytes) : '—'}</span>
          </div>

          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Export profiles</div>
              <div className="list-sub">
                One JSON file. Proxy passwords are exported as ciphertext bound to this machine.
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={async () => {
                try {
                  const file = await bridge().exportProfiles();
                  if (file) toast('success', 'Profiles exported', file);
                } catch (error) {
                  toast('error', 'Could not export', messageOf(error));
                }
              }}
            >
              Export
            </button>
          </div>

          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Import profiles</div>
              <div className="list-sub">Adds every profile from an exported file.</div>
            </div>
            <button
              className="btn btn-sm"
              onClick={async () => {
                try {
                  const count = await bridge().importProfiles();
                  if (count > 0) toast('success', `${count} profile${count === 1 ? '' : 's'} imported`);
                } catch (error) {
                  toast('error', 'Could not import', messageOf(error));
                }
              }}
            >
              Import
            </button>
          </div>
        </div>

        <div className="section-label" style={{ marginBottom: 8 }}>
          About
        </div>
        <div className="list" style={{ marginBottom: 16 }}>
          {[
            ['Version', info?.version ?? '—'],
            ['Electron', info?.electron ?? '—'],
            ['Chromium', info?.chrome ?? '—'],
            ['Platform', info?.platform ?? '—'],
            ['Profiles', String(info?.profileCount ?? 0)],
          ].map(([key, value]) => (
            <div className="list-row" key={key}>
              <div className="list-main">
                <div className="list-title">{key}</div>
              </div>
              <span className="mono" style={{ color: 'var(--muted)' }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="section-label" style={{ marginBottom: 8 }}>
          Danger zone
        </div>
        <div className="list">
          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Reset everything</div>
              <div className="list-sub">
                Deletes every profile, its browser data and these settings. Cannot be undone.
              </div>
            </div>
            {confirmReset ? (
              <>
                <button className="btn btn-sm" onClick={() => setConfirmReset(false)} disabled={busy}>
                  Cancel
                </button>
                <button className="btn btn-sm btn-danger" onClick={reset} disabled={busy}>
                  {busy ? <Spinner /> : null} Yes, delete everything
                </button>
              </>
            ) : (
              <button className="btn btn-sm btn-danger" onClick={() => setConfirmReset(true)}>
                Reset
              </button>
            )}
          </div>
        </div>

        <Field label="Note">
          <span className="hint">
            Joe Browser makes no network request of its own while you are not using it: no
            telemetry, no update check, no account. The only outbound traffic is a proxy check you
            ask for, a build you install, or the browser you open.
          </span>
        </Field>
      </div>
    </>
  );
}
