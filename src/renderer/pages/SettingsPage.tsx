import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AppInfo, AppSettings, KernelBuild, LanguageInfo, StoreStats } from '../../shared/types';
import { bridge } from '../bridge';
import { useI18n } from '../i18n';
import { Icon } from '../components/Icon';
import { CountryFlag } from '../components/CountryFlag';
import { SubscriptionCard } from '../components/SubscriptionCard';
import {
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


  return (
    <>
      <header className="header">
        <div className="header-titles">
          <h1>{t('header.settings')}</h1>
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
        <div className="content-inner settings-content">
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
            <div className="lang-grid">
              {languages.map((language) => (
                <button
                  key={language.key}
                  className="lang"
                  aria-pressed={settings.language === language.key}
                  onClick={() => void save({ language: language.key })}
                  type="button"
                >
                  <span className="flag">
                    <CountryFlag code={language.flag} size={22} />
                  </span>
                  <span className="name">
                    {language.native}
                    {language.native !== language.english ? (
                      <span className="faint" style={{ marginLeft: 5, fontSize: 11 }}>
                        {language.english}
                      </span>
                    ) : null}
                  </span>
                  {language.coverage < 100 ? <span className="cov" title="Translation coverage">{language.coverage}%</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="section-label">{t('set.general')}</div>
          <div className="panel">
            <div className="form-grid">
              <Field label={t('set.browser')}>
                <select className="select" value={settings.defaultEngine} onChange={(event) => void save({ defaultEngine: event.target.value })}>
                  <option value="auto">{t('ed.engine.system')}</option>
                  {['chrome', 'chromium', 'edge', 'brave', 'firefox'].map((engine) => (
                    <option key={engine} value={engine}>
                      {t(`br.engine.${engine}`, engine)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('set.kernel')}>
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

              <Field label={t('set.start')}>
                <input
                  className="input mono"
                  value={settings.startPage}
                  onChange={(event) => void save({ startPage: event.target.value })}
                  spellCheck={false}
                />
              </Field>

              <Field label={t('set.group')}>
                <input
                  className="input"
                  value={settings.defaultGroup}
                  onChange={(event) => void save({ defaultGroup: event.target.value })}
                  spellCheck={false}
                />
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
              />
              <Toggle
                checked={settings.clearCacheOnExit}
                onChange={(clearCacheOnExit) => void save({ clearCacheOnExit })}
                label={t('set.clearonExit')}
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

          {confirm.dialog}
        </div>
      </div>
    </>
  );
}
