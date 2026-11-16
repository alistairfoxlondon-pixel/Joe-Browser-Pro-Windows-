import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppInfo, AppSettings, ProfileSummary, SessionInfo } from '../shared/types';
import { bridge, isDesktop, onEvent } from './bridge';
import { Toasts, type ToastItem } from './components/UI';
import { ProfilesPage } from './pages/ProfilesPage';
import { messageOf } from './util';
import { BrowsersPage } from './pages/BrowsersPage';
import { ProxiesPage } from './pages/ProxiesPage';
import { SettingsPage } from './pages/SettingsPage';

export type Page = 'profiles' | 'browsers' | 'proxies' | 'settings';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'profiles', label: 'Profiles', icon: '▦' },
  { id: 'browsers', label: 'Browsers', icon: '◎' },
  { id: 'proxies', label: 'Proxies', icon: '⇄' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function App() {
  const [page, setPage] = useState<Page>('profiles');
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionInfo>>({});
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(1);

  const toast = useCallback((kind: ToastItem['kind'], title: string, detail?: string) => {
    const id = toastId.current++;
    setToasts((current) => [...current, { id, kind, title, detail }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, kind === 'error' ? 9000 : 4500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [list, live, appInfo, currentSettings] = await Promise.all([
        bridge().listProfiles(),
        bridge().listSessions(),
        bridge().getAppInfo(),
        bridge().getSettings(),
      ]);
      setProfiles(list);
      setSessions(Object.fromEntries(live.map((session) => [session.profileId, session])));
      setInfo(appInfo);
      setSettings(currentSettings);
      document.documentElement.dataset['theme'] = currentSettings.theme;
    } catch (error) {
      toast('error', 'Could not read the profile store', messageOf(error));
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const offChanged = onEvent('session:changed', (payload) => {
      const session = payload as SessionInfo;
      setSessions((current) => ({ ...current, [session.profileId]: session }));
      if (session.state === 'failed' && session.lastError) {
        toast('error', `${session.profileName} failed to start`, session.lastError);
      }
      void refresh();
    });

    const offRemoved = onEvent('session:removed', (payload) => {
      const { profileId } = payload as { profileId: string };
      setSessions((current) => {
        const next = { ...current };
        delete next[profileId];
        return next;
      });
      void refresh();
    });

    const offToast = onEvent('toast', (payload) => {
      const item = payload as { kind?: ToastItem['kind']; message?: string; detail?: string };
      toast(item.kind ?? 'info', item.message ?? 'Notice', item.detail);
    });

    return () => {
      offChanged();
      offRemoved();
      offToast();
    };
  }, [refresh, toast]);

  const runningCount = useMemo(() => Object.keys(sessions).length, [sessions]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">JB</div>
          <div>
            <div className="brand-name">Joe Browser</div>
            <div className="brand-sub">Anti-detect workspace</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((entry) => (
            <button
              key={entry.id}
              className="nav-item"
              aria-current={page === entry.id ? 'page' : undefined}
              onClick={() => setPage(entry.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {entry.icon}
              </span>
              {entry.label}
              {entry.id === 'profiles' && profiles.length > 0 ? (
                <span className="nav-badge">{profiles.length}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div>
            <strong>{runningCount}</strong> running · <strong>{profiles.length}</strong> profiles
          </div>
          <div style={{ marginTop: 4 }}>
            v{info?.version ?? '2.0.0'} · local only
            {isDesktop ? '' : ' · preview'}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="titlebar">
          <span className="dot" aria-hidden="true" />
          {page === 'profiles'
            ? 'Profile workspace'
            : page === 'browsers'
              ? 'Browser builds'
              : page === 'proxies'
                ? 'Proxy tools'
                : 'Settings'}
        </div>

        {page === 'profiles' ? (
          <ProfilesPage
            profiles={profiles}
            sessions={sessions}
            toast={toast}
            refresh={refresh}
          />
        ) : null}

        {page === 'browsers' ? <BrowsersPage toast={toast} /> : null}

        {page === 'proxies' ? <ProxiesPage profiles={profiles} toast={toast} /> : null}

        {page === 'settings' ? (
          <SettingsPage
            settings={settings}
            info={info}
            toast={toast}
            onSaved={(next) => {
              setSettings(next);
              document.documentElement.dataset['theme'] = next.theme;
            }}
          />
        ) : null}
      </main>

      <Toasts
        items={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((t) => t.id !== id))}
      />
    </div>
  );
}
