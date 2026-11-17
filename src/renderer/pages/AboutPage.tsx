import { useEffect, useState, type ReactNode } from 'react';
import type { AppInfo, ProfileSummary, StoreStats } from '../../shared/types';
import { TELEGRAM_USER } from '../../shared/types';
import { bridge } from '../bridge';
import { useI18n } from '../i18n';
import { Icon, type IconName } from '../components/Icon';
import { Button } from '../components/UI';

/**
 * About.
 *
 * The page a person opens when they want to know what this thing is, whether it phones home,
 * and where to complain. The feature list doubles as a statement of what the app actually does -
 * every line is a capability that exists, not a marketing claim - and the privacy section says
 * plainly that nothing leaves the machine.
 *
 * The workspace block is live, because a static "8 features" page tells a user nothing about
 * whether their install is healthy. The original had the same three counts at the foot of its
 * About page and they were the only thing on it that changed.
 */

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'profiles', title: 'about.f1', body: 'about.f1.body' },
  { icon: 'fingerprint', title: 'about.f2', body: 'about.f2.body' },
  { icon: 'lock', title: 'about.f3', body: 'about.f3.body' },
  { icon: 'proxy', title: 'about.f4', body: 'about.f4.body' },
  { icon: 'phone', title: 'about.f5', body: 'about.f5.body' },
  { icon: 'route', title: 'about.f6', body: 'about.f6.body' },
  { icon: 'extensions', title: 'about.f7', body: 'about.f7.body' },
  { icon: 'shield', title: 'about.f8', body: 'about.f8.body' },
];

export function AboutPage({
  info,
  profiles = [],
}: {
  info: AppInfo | null;
  profiles?: ProfileSummary[];
}): ReactNode {
  const { t } = useI18n();
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [counts, setCounts] = useState<{ proxies: number; extensions: number }>({ proxies: 0, extensions: 0 });

  useEffect(() => {
    void (async () => {
      try {
        const [nextStats, proxies, extensions] = await Promise.all([
          bridge().getStoreStats().catch(() => null),
          bridge().listProxies().catch(() => []),
          bridge().listExtensions().catch(() => null),
        ]);
        setStats(nextStats);
        setCounts({
          proxies: proxies.length,
          extensions: (extensions?.firstParty.length ?? 0) + (extensions?.library.length ?? 0),
        });
      } catch {
        /* The About page is readable without numbers; it must not fail to paint over them. */
      }
    })();
  }, []);

  return (
    <>
      <header className="header">
        <div className="header-titles">
          <h1>{t('header.about')}</h1>
          <div className="sub">{t('app.tagline')}</div>
        </div>
        <div className="header-actions">
          <Button variant="soft" icon="terminal" onClick={() => void bridge().openLogsDir()}>
            {t('about.log')}
          </Button>
          <Button variant="primary" icon="telegram" onClick={() => void bridge().openExternal(`https://t.me/${TELEGRAM_USER}`)}>
            {t('about.support')}
          </Button>
        </div>
      </header>

      <div className="content">
        <div className="content-inner" style={{ maxWidth: 1080 }}>
          <div className="about-hero">
            <div className="mark">J</div>
            <div className="grow">
              <div style={{ fontSize: 20, fontWeight: 680, letterSpacing: '-0.02em' }}>
                {t('app.title')}
                {info ? <span className="faint" style={{ fontSize: 13, fontWeight: 500, marginLeft: 8 }}>v{info.version}</span> : null}
              </div>
              <div className="muted" style={{ marginTop: 3, fontSize: 13 }}>
                {t('about.tagline')}
              </div>
              <div className="cluster" style={{ marginTop: 10 }}>
                {info ? (
                  <>
                    <span className="chip muted">Electron {info.electron}</span>
                    <span className="chip muted">Chromium {info.chrome}</span>
                    <span className="chip muted">{info.platform}</span>
                    <span className="chip accent">
                      {info.dataMode === 'portable' ? t('set.dataMode.portable') : t('set.dataMode.roaming')}
                    </span>
                    <span className="chip muted">
                      <Icon name="lock" size={11} />
                      {info.encryption}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="section-label">{t('about.workspace')}</div>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-value">{profiles.length}</div>
              <div className="stat-label">{t('about.w1')}</div>
            </div>
            <div className="stat">
              <div className="stat-value">{profiles.filter((profile) => profile.running).length}</div>
              <div className="stat-label">{t('nav.profiles')}</div>
            </div>
            <div className="stat">
              <div className="stat-value">{counts.proxies}</div>
              <div className="stat-label">{t('about.w2')}</div>
            </div>
            <div className="stat">
              <div className="stat-value">{counts.extensions}</div>
              <div className="stat-label">{t('about.w3')}</div>
            </div>
            {stats ? (
              <div className="stat">
                <div className="stat-value" style={{ fontSize: 17 }}>
                  {stats.storeBytes > 0 ? `${Math.round(stats.storeBytes / 1_048_576)} MB` : '0 B'}
                </div>
                <div className="stat-label">{t('set.stat.store')}</div>
              </div>
            ) : null}
          </div>

          <div className="section-label">{t('about.features')}</div>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <div className="feature" key={feature.title}>
                <h4>
                  <Icon name={feature.icon} />
                  {t(feature.title)}
                </h4>
                <p>{t(feature.body)}</p>
              </div>
            ))}
          </div>

          <div className="section-label">{t('about.privacy')}</div>
          <div className="panel">
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <Icon name="shield" />
              <div className="grow">
                <div style={{ fontWeight: 590 }}>{t('about.privacy')}</div>
                <div className="hint" style={{ marginTop: 3 }}>{t('about.privacy.body')}</div>
              </div>
            </div>
          </div>

          <div className="section-label">{t('about.support')}</div>
          <div className="rows">
            <div className="row">
              <div className="row-icon">
                <Icon name="folder" />
              </div>
              <div className="row-main">
                <div className="row-title">{t('about.dataFolder')}</div>
                <div className="row-sub mono">{info?.dataDir ?? '—'}</div>
              </div>
              <Button size="sm" variant="ghost" icon="external" onClick={() => void bridge().openDataDir()}>
                {t('btn.view')}
              </Button>
            </div>
            <div className="row">
              <div className="row-icon">
                <Icon name="terminal" />
              </div>
              <div className="row-main">
                <div className="row-title">{t('about.log')}</div>
                <div className="row-sub mono">{info?.logFile ?? '—'}</div>
              </div>
              <Button size="sm" variant="ghost" icon="external" onClick={() => void bridge().openLogsDir()}>
                {t('btn.view')}
              </Button>
            </div>
            <div className="row">
              <div className="row-icon">
                <Icon name="telegram" />
              </div>
              <div className="row-main">
                <div className="row-title">@{TELEGRAM_USER}</div>
                <div className="row-sub">The support channel the Report button points at.</div>
              </div>
              <Button size="sm" variant="ghost" icon="external" onClick={() => void bridge().openExternal(`https://t.me/${TELEGRAM_USER}`)}>
                {t('rep.telegram')}
              </Button>
            </div>
          </div>

          <div className="hint center" style={{ marginTop: 24 }}>
            {t('about.thanks')}
          </div>
        </div>
      </div>
    </>
  );
}
