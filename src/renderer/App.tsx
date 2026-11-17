import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AccountSummary, AppInfo, AppSettings, LockState, ProfileSummary, SessionInfo } from '../shared/types';
import { bridge, onEvent } from './bridge';
import { Icon, type IconName } from './components/Icon';
import { I18nProvider, useI18n } from './i18n';
import { ToastProvider, useToast } from './components/UI';
import { messageOf } from './util';
import { ProfilesPage } from './pages/ProfilesPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProxiesPage } from './pages/ProxiesPage';
import { ExtensionsPage } from './pages/ExtensionsPage';
import { BrowsersPage } from './pages/BrowsersPage';
import { ToolsPage } from './pages/ToolsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';
import { AccountGate, LockScreen } from './pages/AccountGate';

/**
 * The application shell.
 *
 * A grouped navigation rail, a header that carries the page and its one line of state, and a
 * content column that scrolls on its own. The shell owns three things so no page has to: the
 * profile list, the session list, and the settings. A page that needs any of them reads the
 * props it was handed; a page that changes one calls the callback, and the shell refreshes.
 *
 * That division is what keeps a launch from being reflected on one page and not another. The
 * original did the same with a single `RefreshAll()` after every action; here it is an effect on
 * a store revision, so a background event (a browser that exited on its own) lands too.
 */

export type Page =
  | 'profiles'
  | 'history'
  | 'proxies'
  | 'extensions'
  | 'browsers'
  | 'tools'
  | 'settings'
  | 'about';

interface NavEntry {
  id: Page;
  icon: IconName;
  group: 'workspace' | 'system';
}

const NAV: NavEntry[] = [
  { id: 'profiles', icon: 'profiles', group: 'workspace' },
  { id: 'history', icon: 'history', group: 'workspace' },
  { id: 'proxies', icon: 'proxy', group: 'workspace' },
  { id: 'extensions', icon: 'extensions', group: 'workspace' },
  { id: 'tools', icon: 'tools', group: 'workspace' },
  { id: 'browsers', icon: 'browsers', group: 'system' },
  { id: 'settings', icon: 'settings', group: 'system' },
  { id: 'about', icon: 'about', group: 'system' },
];

export function App(): ReactNode {
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [page, setPage] = useState<Page>('profiles');
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [narrow, setNarrow] = useState(false);
  const [lock, setLock] = useState<LockState | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  // `entered` separates "the gate was answered" from "a lock state exists": the store must not
  // paint behind a lock the moment the state arrives.
  const [entered, setEntered] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextProfiles, nextSessions] = await Promise.all([
        bridge().listProfiles(),
        bridge().listSessions(),
      ]);
      setProfiles(nextProfiles);
      setSessions(nextSessions);
      setFailure('');
    } catch (error) {
      setFailure(messageOf(error));
    }
  }, []);

  // The first load is the only one that may show a spinner: a refresh after an action must not
  // blank the page the user is looking at.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailure('');
    void (async () => {
      try {
        const [nextSettings, nextInfo, nextLock] = await Promise.all([
          bridge().getSettings(),
          bridge().getAppInfo(),
          bridge().lockState(),
        ]);
        if (!live) return;
        setSettings(nextSettings);
        setInfo(nextInfo);
        setLock(nextLock);
        setAccount(nextLock.account);
        // Nothing behind the gate is read until the gate has been answered. A profile list that
        // flashes under a lock screen is a profile list someone else just saw.
        if (nextLock.state === 'open') setEntered(true);

        const [nextProfiles, nextSessions] = await Promise.all([
          bridge().listProfiles(),
          bridge().listSessions(),
        ]);
        if (!live) return;
        setProfiles(nextProfiles);
        setSessions(nextSessions);
      } catch (error) {
        if (live) setFailure(messageOf(error));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [startupAttempt]);

  // Every main-process change that matters to the list arrives on one of these channels.
  useEffect(() => {
    const offs = [
      onEvent('app:changed', () => void refresh()),
      onEvent('session:changed', () => void refresh()),
      onEvent('session:removed', () => void refresh()),
      onEvent('profiles:changed', () => void refresh()),
      onEvent('lock:idle', () => {
        // The window was idle for as long as the setting allows. Drop back to the lock screen;
        // the workspace state is kept, so unlocking returns to the same page.
        setEntered(false);
        void refreshLock();
      }),
      onEvent('tray:focus', (payload) => {
        const id = (payload as { profileId?: string }).profileId;
        setPage('profiles');
        if (id) window.dispatchEvent(new CustomEvent('joe:focus-profile', { detail: id }));
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [refresh]);

  // The theme is a property of the document, not of any one component.
  useEffect(() => {
    document.documentElement.dataset['theme'] = settings?.theme ?? 'dark';
    if (settings) document.documentElement.dataset['density'] = settings.density;
  }, [settings?.theme, settings?.density]);

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    // Optimistic: a checkbox that waits for a round trip feels broken on a slow disk.
    setSettings((current) => (current ? { ...current, ...patch } : current));
    try {
      const saved = await bridge().saveSettings(patch);
      setSettings(saved);
      if (patch.theme) {
        document.documentElement.dataset['theme'] = saved.theme;
      }
      return saved;
    } catch (error) {
      setSettings((current) => (current ? { ...current } : current));
      throw error;
    }
  }, []);

  const runningById = useMemo(() => {
    const map = new Map<string, SessionInfo>();
    for (const session of sessions) map.set(session.profileId, session);
    return map;
  }, [sessions]);

  const refreshLock = useCallback(async () => {
    const next = await bridge().lockState();
    setLock(next);
    setAccount(next.account);
    return next;
  }, []);

  const toggleShell = useCallback(() => setNarrow((value) => !value), []);

  // Keyboard: the shortcuts in the original's OnKeyDown, plus page jumps.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if (mod && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setPage('profiles');
        window.dispatchEvent(new CustomEvent('joe:new-profile'));
        return;
      }
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('joe:focus-search'));
        return;
      }
      if (mod && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleShell();
        return;
      }
      if (typing) return;
      if (event.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('joe:escape'));
      }
      if (event.key === 'F5') {
        event.preventDefault();
        void refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refresh, toggleShell]);

  const running = sessions.length;

  // The gate and the lock are outside the shell on purpose: no rail, no title bar, no favourite
  // buttons. There is nothing to navigate to until the question has been answered.
  const gateAnswered = !lock || lock.state === 'open' || entered;

  if (settings && lock && !gateAnswered) {
    return (
      <I18nProvider language={settings.language} onChange={(language) => void saveSettings({ language })}>
        <ToastProvider>
          {lock.state === 'gate' ? (
            <AccountGate
              onDone={async (signedIn) => {
                if (signedIn) {
                  const next = await refreshLock();
                  setEntered(next.state === 'open');
                  setAccount(signedIn);
                } else {
                  // Skipped: there is nothing to unlock, and the workspace is reachable.
                  setEntered(true);
                }
              }}
            />
          ) : (
            <LockScreen
              lock={lock}
              onUnlocked={() => setEntered(true)}
              onSignOut={async () => {
                await bridge().signOut();
                setEntered(false);
                setAccount(null);
                await refreshLock();
              }}
            />
          )}
        </ToastProvider>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider
      language={settings?.language ?? 'en'}
      onChange={(language) => void saveSettings({ language })}
    >
      <ToastProvider>
        <div className={`shell${narrow ? ' narrow' : ''}`}>
          <Rail page={page} onNavigate={setPage} running={running} profileCount={profiles.length} narrow={narrow} onToggle={toggleShell} info={info} />

          <main className="main">
            <TitleBar page={page} running={running} />
            {failure ? (
              <div style={{ padding: '12px 26px 0' }}>
                <FailureBanner message={failure} onRetry={() => setStartupAttempt((value) => value + 1)} />
              </div>
            ) : null}
            {failure && !settings ? null : loading || !settings ? (
              <div className="content">
                <div className="empty">
                  <span className="spinner" style={{ width: 22, height: 22, color: 'var(--accent)' }} />
                </div>
              </div>
            ) : (
              <Pages
                page={page}
                profiles={profiles}
                runningById={runningById}
                settings={settings}
                info={info}
                account={account}
                refresh={refresh}
                refreshLock={refreshLock}
                onNavigate={setPage}
                saveSettings={saveSettings}
              />
            )}
          </main>
        </div>
      </ToastProvider>
    </I18nProvider>
  );
}

/* ------------------------------------------------------------------ rail */

function Rail({
  page,
  onNavigate,
  running,
  profileCount,
  narrow,
  onToggle,
  info,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  running: number;
  profileCount: number;
  narrow: boolean;
  onToggle: () => void;
  info: AppInfo | null;
}): ReactNode {
  const { t } = useI18n();

  const item = (entry: NavEntry) => (
    <button
      key={entry.id}
      className="nav-item"
      aria-current={page === entry.id ? 'page' : undefined}
      onClick={() => onNavigate(entry.id)}
      title={narrow ? t(`nav.${entry.id}`) : undefined}
      type="button"
    >
      <span className="nav-icon">
        <Icon name={entry.icon} />
      </span>
      <span className="nav-label">{t(`nav.${entry.id}`)}</span>
      {entry.id === 'profiles' && profileCount > 0 ? <span className="nav-badge">{profileCount}</span> : null}
      {entry.id === 'profiles' && running > 0 ? <span className="nav-badge live">{running}</span> : null}
    </button>
  );

  return (
    <aside className="rail">
      <div className="rail-drag" />
      <div className="brand">
        <div className="brand-mark">J</div>
        <div className="brand-text">
          <div className="brand-name">{t('app.title')}</div>
          <div className="brand-sub">{t('app.tagline')}</div>
        </div>
      </div>

      <div className="rail-scroll">
        <div className="nav-group">{t('nav.workspace')}</div>
        {NAV.filter((entry) => entry.group === 'workspace').map(item)}
        <div className="nav-group">{t('nav.system')}</div>
        {NAV.filter((entry) => entry.group === 'system').map(item)}
      </div>

      <div className="rail-foot">
        <div className="rail-status" title={info?.dataDir}>
          <span className={`dot${running > 0 ? ' on' : ''}`} />
          <span className="grow truncate">
            <strong>
              {running === 1 ? t('shell.running.one') : t('shell.running').replace('{n}', String(running))}
            </strong>
          </span>
        </div>
        <div className="rail-actions">
          <button className="icon-btn" onClick={onToggle} title={narrow ? 'Expand the rail' : 'Collapse the rail'} type="button">
            <Icon name={narrow ? 'chevronRight' : 'chevronLeft'} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ title bar */

function TitleBar({ page, running }: { page: Page; running: number }): ReactNode {
  const { t } = useI18n();
  return (
    <div className="titlebar">
      <div className="crumb">
        <span>{t('app.title')}</span>
        <Icon name="chevronRight" size={11} />
        <b>{t(`header.${page}`)}</b>
      </div>
      <div className="spacer" />
      <div className="live-dot" style={{ marginRight: 130 }}>
        <span className={`dot${running > 0 ? ' on' : ''}`} />
        {running > 0
          ? running === 1
            ? t('footer.browsers.one')
            : t('footer.browsers').replace('{n}', String(running))
          : t('footer.local')}
      </div>
    </div>
  );
}

function FailureBanner({ message, onRetry }: { message: string; onRetry: () => void }): ReactNode {
  const { t } = useI18n();
  return (
    <div className="banner err">
      <Icon name="warning" />
      <div className="grow">
        <b>{t('err.load')}</b>
        <div style={{ marginTop: 2 }}>{message}</div>
      </div>
      <button className="btn btn-sm" onClick={onRetry} type="button">
        {t('err.reload')}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ page switch */

function Pages({
  page,
  profiles,
  runningById,
  settings,
  info,
  account,
  refresh,
  refreshLock,
  onNavigate,
  saveSettings,
}: {
  page: Page;
  profiles: ProfileSummary[];
  runningById: Map<string, SessionInfo>;
  settings: AppSettings;
  info: AppInfo | null;
  account: AccountSummary | null;
  refresh: () => Promise<void>;
  refreshLock: () => Promise<LockState>;
  onNavigate: (page: Page) => void;
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
}): ReactNode {
  const toast = useToast();
  const lastPage = useRef(page);

  useEffect(() => {
    lastPage.current = page;
  }, [page]);

  switch (page) {
    case 'history':
      return <HistoryPage profiles={profiles} />;
    case 'proxies':
      return <ProxiesPage profiles={profiles} refreshProfiles={refresh} />;
    case 'extensions':
      return <ExtensionsPage settings={settings} saveSettings={saveSettings} />;
    case 'browsers':
      return <BrowsersPage settings={settings} saveSettings={saveSettings} />;
    case 'tools':
      return <ToolsPage profiles={profiles} refreshProfiles={refresh} onNavigate={onNavigate} />;
    case 'settings':
      return (
        <SettingsPage
          settings={settings}
          info={info}
          account={account}
          saveSettings={saveSettings}
          refreshProfiles={refresh}
          onAccountChanged={() => void refreshLock()}
        />
      );
    case 'about':
      return <AboutPage info={info} profiles={profiles} />;
    case 'profiles':
    default:
      return (
        <ProfilesPage
          profiles={profiles}
          runningById={runningById}
          settings={settings}
          saveSettings={saveSettings}
          refresh={refresh}
          toast={toast}
        />
      );
  }
}
