import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AppInfo, AppSettings, KernelBuild, LanguageInfo, StoreStats } from '../../shared/types';
import { bridge } from '../bridge';
import { useI18n } from '../i18n';
import { Icon } from '../components/Icon';
import { SubscriptionCard } from '../components/SubscriptionCard';
import {
  Banner,
  Button,
  Field,
  Meter,
  Segmented,
  Stat,
  Toggle,
  useConfirm,
  useToast,
  bytes,
} from '../components/UI';
import { SecurityPanel } from './SecurityPanel';
import { messageOf } from '../util';

/**
 * Settings.
 *
 * Four sections in the order a user changes them: how it looks, where it starts, what it stores,
 * and what it is. The language picker is the honest one - every language is offered with the
 * share of the interface it actually covers, because a table that is 55% done and a table that is
 * finished look identical until you switch to it.
 */

export function SettingsPage({
  settings,
  info,
  saveSettings,
  refreshProfiles,
  onSignedOut,
}: {
  settings: AppSettings;
  info: AppInfo | null;
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  refreshProfiles: () => Promise<void>;
  onSignedOut: () => void;
}): ReactNode {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();

  const [languages, setLanguages] = useState<LanguageInfo[]>([]);
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [kernels, setKernels] = useState<KernelBuild[]>([]);
  const [busy, setBusy] = useState('');
  const [logs, setLogs] = useState('');

  useEffect(() => {
    void (async () => {
      setLanguages(await bridge().listLanguages().catch(() => []));
      setStats(await bridge().getStoreStats().catch(() => null));
      setKernels(await bridge().listKernels().catch(() => []));
    })();
  }, []);

  const save = useCallback(
    async (patch: Partial<AppSettings>) => {
      try {
        await saveSettings(patch);
      } catch (error) {
        toast.error(t('err.save'), messageOf(error));
      }
    },
    [saveSettings, t, toast],
  );

  const current = languages.find((language) => language.key === settings.language);

  return (
    <>
      <header className="header">
        <div className="header-titles">
          <h1>{t('header.settings')}</h1>
          <div className="sub">{t('set.sub')}</div>
        </div>
        <div className="header-actions">
          <Button variant="soft" icon="folder" onClick={() => void bridge().openDataDir()}>
            {t('set.data.open')}
          </Button>
          <Button variant="soft" icon="terminal" onClick={() => void bridge().openLogsDir()}>
            {t('set.logs.open')}
          </Button>
        </div>
      </header>

      <div className="content">
        <div className="content-inner">
          <div className="section-label">{t('set.appearance')}</div>
          <div className="panel">
            <div className="spread" style={{ flexWrap: 'wrap', gap: 20 }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <div className="field-label">{t('set.theme')}</div>
                <div style={{ marginTop: 6 }}>
                  <Segmented
                    value={settings.theme}
                    onChange={(theme) => void save({ theme })}
                    options={[
                      { id: 'dark' as const, label: t('theme.night') },
                      { id: 'light' as const, label: t('theme.day') },
                    ]}
                  />
                </div>
              </div>

              <div style={{ minWidth: 220, flex: 1 }}>
                <div className="field-label">{t('set.density')}</div>
                <div style={{ marginTop: 6 }}>
                  <Segmented
                    value={settings.density}
                    onChange={(density) => void save({ density })}
                    options={[
                      { id: 'comfortable' as const, label: t('view.cards') },
                      { id: 'compact' as const, label: t('view.rows') },
                    ]}
                  />
                </div>
                <div className="hint" style={{ marginTop: 5 }}>{t('set.density.hint')}</div>
              </div>

              <div style={{ minWidth: 220, flex: 1 }}>
                <Toggle
                  checked={settings.startMaximized}
                  onChange={(startMaximized) => void save({ startMaximized })}
                  label="Open the window maximised"
                />
              </div>
            </div>
          </div>

          <div className="section-label">{t('set.interface')}</div>
          <div className="panel">
            <div className="spread" style={{ marginBottom: 10 }}>
              <Field label={t('set.interface')} hint={t('set.language.hint')}>
                <div className="faint" style={{ fontSize: 11.8 }}>
                  {current ? `${current.english} · ${current.coverage}%` : settings.language}
                </div>
              </Field>
            </div>

            <div className="lang-grid">
              {languages.map((language) => (
                <button
                  key={language.key}
                  className="lang"
                  aria-selected={settings.language === language.key}
                  onClick={() => void save({ language: language.key })}
                  type="button"
                >
                  <span className="flag">
                    <FlagBadge code={language.flag} />
                  </span>
                  <span className="name">
                    {language.native}
                    {language.native !== language.english ? (
                      <span className="faint" style={{ marginLeft: 5, fontSize: 11 }}>
                        {language.english}
                      </span>
                    ) : null}
                  </span>
                  <span className="cov">{language.coverage}%</span>
                </button>
              ))}
            </div>
          </div>

          <div className="section-label">{t('set.general')}</div>
          <div className="panel">
            <div className="form-grid">
              <Field label={t('set.browser')} hint={t('ed.browser.hint')}>
                <select className="select" value={settings.defaultEngine} onChange={(event) => void save({ defaultEngine: event.target.value })}>
                  <option value="auto">{t('ed.engine.system')}</option>
                  {['chrome', 'chromium', 'edge', 'brave', 'firefox'].map((engine) => (
                    <option key={engine} value={engine}>
                      {t(`br.engine.${engine}`, engine)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('set.kernel')} hint={t('set.kernel.hint')}>
                {/*
                  The workspace default build. This value existed in the settings model and was
                  read by nothing, so a profile always took whatever the spread chose. Choosing a
                  build that has since been removed is harmless: the store ignores an id that is
                  not installed rather than launching a missing binary.
                */}
                <select
                  className="select"
                  value={settings.defaultKernelId}
                  onChange={(event) => void save({ defaultKernelId: event.target.value })}
                >
                  <option value="">{t('set.kernel.spread')}</option>
                  {kernels.filter((kernel) => kernel.installed).map((kernel) => (
                    <option key={kernel.id} value={kernel.id}>
                      {kernel.engine} {kernel.version}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('set.start')} hint={t('set.start.hint')}>
                <input
                  className="input mono"
                  value={settings.startPage}
                  onChange={(event) => void save({ startPage: event.target.value })}
                  spellCheck={false}
                />
              </Field>

              <Field label={t('set.group')} hint={t('set.group.hint')}>
                <input
                  className="input"
                  value={settings.defaultGroup}
                  onChange={(event) => void save({ defaultGroup: event.target.value })}
                  spellCheck={false}
                />
              </Field>

              <Field label={t('proxy.password.hint')}>
                <div className="chip muted" style={{ alignSelf: 'flex-start' }}>
                  <Icon name="lock" size={12} />
                  {info?.encryption ?? 'none'}
                </div>
              </Field>
            </div>

            <div className="divider" />

            <div className="form-grid">
              <Toggle
                checked={settings.extensionsEnabled}
                onChange={(extensionsEnabled) => void save({ extensionsEnabled })}
                label={t('set.ext')}
              />
              <Toggle
                checked={settings.customExtensionsEnabled}
                onChange={(customExtensionsEnabled) => void save({ customExtensionsEnabled })}
                label={t('set.cext')}
              />
              <Toggle
                checked={settings.historyEnabled}
                onChange={(historyEnabled) => void save({ historyEnabled })}
                label={t('set.history')}
              />
              <Toggle
                checked={settings.useTrash}
                onChange={(useTrash) => void save({ useTrash })}
                label={t('set.trash')}
                detail={t('trash.kept.hint')}
              />
              <Toggle
                checked={settings.clearCacheOnExit}
                onChange={(clearCacheOnExit) => void save({ clearCacheOnExit })}
                label={t('set.clearonExit')}
                detail={t('set.clearonExit.hint')}
              />
            </div>
          </div>

          <div className="section-label">{t('set.data')}</div>
          <div className="stat-grid">
            <Stat value={stats ? bytes(stats.storeBytes) : '—'} label={t('set.stat.store')} />
            <Stat value={stats ? bytes(stats.profilesBytes) : '—'} label={t('set.stat.profiles')} />
            <Stat value={stats ? bytes(stats.historyBytes) : '—'} label={t('set.stat.history')} />
            <Stat value={stats ? bytes(stats.trashBytes) : '—'} label={t('set.stat.trash')} />
            <Stat value={stats ? bytes(stats.freeBytes) : '—'} label={t('set.stat.free')} />
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="spread">
              <div className="grow">
                <div className="field-label">{t('set.data')}</div>
                <div className="mono" style={{ fontSize: 11.8, marginTop: 3, overflowWrap: 'anywhere' }}>
                  {stats?.dataDir ?? info?.dataDir ?? '—'}
                </div>
                <div className="hint" style={{ marginTop: 4 }}>{t('set.data.hint')}</div>
              </div>
              <div className="cluster">
                <Button variant="soft" icon="folder" onClick={() => void bridge().openDataDir()}>
                  {t('set.data.open')}
                </Button>
              </div>
            </div>

            {stats ? (
              <div style={{ marginTop: 14 }}>
                <Meter
                  value={Math.min(100, Math.round((100 * stats.storeBytes) / Math.max(1, stats.storeBytes + stats.freeBytes)))}
                  tone="ok"
                />
              </div>
            ) : null}

            <div className="divider" />

            <div className="spread" style={{ flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 580, fontSize: 13 }}>{t('set.clean.now')}</div>
                <div className="hint">{t('set.clean.body')}</div>
              </div>
              <Button
                variant="soft"
                icon="archive"
                busy={busy === 'clean'}
                onClick={async () => {
                  const ok = await confirm.ask({
                    title: t('set.clean.now'),
                    body: t('set.clean.body'),
                    confirmLabel: t('btn.clean'),
                  });
                  if (!ok) return;
                  setBusy('clean');
                  try {
                    const freed = await bridge().clearAllCaches();
                    toast.success(t('tools.freed').replace('{size}', bytes(freed)));
                    setStats(await bridge().getStoreStats());
                  } catch (error) {
                    toast.error(t('err.generic'), messageOf(error));
                  } finally {
                    setBusy('');
                  }
                }}
              >
                {t('set.clean.now')}
              </Button>
            </div>

            <div className="divider" />

            <div className="spread" style={{ flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 580, fontSize: 13, color: 'var(--err)' }}>{t('set.reset')}</div>
                <div className="hint">{t('set.reset.body')}</div>
              </div>
              <Button
                variant="danger"
                icon="trash"
                busy={busy === 'reset'}
                onClick={async () => {
                  const ok = await confirm.ask({
                    title: t('set.reset'),
                    body: t('set.reset.body'),
                    confirmLabel: t('set.reset'),
                    danger: true,
                  });
                  if (!ok) return;
                  setBusy('reset');
                  try {
                    await bridge().resetEverything();
                    await refreshProfiles();
                    toast.success(t('set.reset'));
                  } catch (error) {
                    toast.error(t('err.generic'), messageOf(error));
                  } finally {
                    setBusy('');
                  }
                }}
              >
                {t('set.reset')}
              </Button>
            </div>
          </div>

          <div className="section-label">Subscription</div>
          <SubscriptionCard onSignedOut={onSignedOut} />

          <div className="section-label">{t('sec.title')}</div>
          <SecurityPanel settings={settings} saveSettings={saveSettings} />

          <div className="section-label">{t('tools.logs')}</div>
          <div className="panel">
            <div className="panel-head">
              <Icon name="terminal" size={16} />
              <h3>{t('rep.log')}</h3>
              <div className="grow" />
              <Button size="sm" variant="ghost" icon="refresh" onClick={() => void bridge().readLogTail(200).then(setLogs)}>
                {t('btn.view')}
              </Button>
              <Button size="sm" variant="ghost" icon="folder" onClick={() => void bridge().openLogsDir()}>
                {t('set.logs.open')}
              </Button>
            </div>
            <pre
              className="input mono"
              style={{ height: 170, padding: 10, overflow: 'auto', fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre' }}
            >
              {logs || `${info?.logFile ?? ''}\n\n${t('btn.view')} …`}
            </pre>
          </div>

          {info && info.dataMode === 'portable' ? (
            <Banner tone="ok" icon="check">
              This is a portable build. Everything lives beside the executable, so the drive can be moved between
              PCs without leaving anything behind.
            </Banner>
          ) : null}

          {confirm.dialog}
        </div>
      </div>
    </>
  );
}

/** A flag without a flag font: two letters in a box, coloured by country. */
export function FlagBadge({ code }: { code: string }): ReactNode {
  const palette: Record<string, [string, string]> = {
    GB: ['#012169', '#C8102E'],
    US: ['#3C3B6E', '#B22234'],
    DE: ['#000000', '#DD0000'],
    RU: ['#ffffff', '#0039A6'],
    ES: ['#AA151B', '#F1BF00'],
    FR: ['#0055A4', '#EF4135'],
    PT: ['#046A38', '#DA291C'],
    IT: ['#009246', '#CE2B37'],
    NL: ['#AE1C28', '#21468B'],
    PL: ['#ffffff', '#DC143C'],
    TR: ['#E30A17', '#ffffff'],
    UA: ['#0057B7', '#FFD700'],
    SA: ['#006C35', '#ffffff'],
    CN: ['#DE2910', '#FFDE00'],
    JP: ['#ffffff', '#BC002D'],
    KR: ['#ffffff', '#CD2E3A'],
  };
  const [bg, accent] = palette[code] ?? ['#4a5260', '#8b93a1'];

  return (
    <span
      style={{
        width: 22,
        height: 16,
        borderRadius: 3,
        background: bg,
        border: '1px solid rgba(255,255,255,0.18)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: accent,
        boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
      }}
      title={code}
    >
      {code}
    </span>
  );
}
