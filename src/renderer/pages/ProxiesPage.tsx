import { parseProxyLine } from '../../shared/parseProxy';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NetworkReport, ProfileSummary, ProxyBatchRow, ProxyConfig, ProxyEntry } from '../../shared/types';
import { PROXY_TYPES } from '../../shared/types';
import { bridge } from '../bridge';
import { useI18n } from '../i18n';
import { Icon } from '../components/Icon';
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  Field,
  Menu,
  Modal,
  SearchInput,
  Segmented,
  Stat,
  useConfirm,
  useToast,
  when,
} from '../components/UI';
import { messageOf } from '../util';
import { useSubscription } from '../cloud/subscription';
import { FREE_PROFILE_LIMIT } from '../cloud/client';
import { ActivateDialog } from '../components/ActivateDialog';

/**
 * The proxy vault.
 *
 * A saved proxy is a reusable asset: it carries where it came from, what it last answered, and
 * which profiles use it. That last column is the one that matters most - two profiles behind one
 * exit address is the easiest link a site can draw, so the page says so out loud.
 *
 * The row actions are the original's: a bolt to test, a plus to make a profile from it, a pencil
 * to edit, a bin to delete. Testing all is one button because "which of these still work" is the
 * question people actually have after a month.
 */

export function ProxiesPage({
  profiles,
  refreshProfiles,
}: {
  profiles: ProfileSummary[];
  refreshProfiles: () => Promise<void>;
}): ReactNode {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const subscription = useSubscription();
  const [activateOpen, setActivateOpen] = useState(false);

  const [entries, setEntries] = useState<ProxyEntry[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ProxyEntry | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [batchTesting, setBatchTesting] = useState(false);
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [testingAll, setTestingAll] = useState(false);
  const [network, setNetwork] = useState<NetworkReport | null>(null);
  const [loadingNetwork, setLoadingNetwork] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setEntries(await bridge().listProxies());
    } catch (error) {
      toast.error(t('err.generic'), messageOf(error));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) =>
      [entry.name, entry.note, entry.config.host, entry.config.type, entry.lastCountry, entry.lastCity]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [entries, query]);

  const test = async (entry: ProxyEntry) => {
    setTesting((current) => new Set(current).add(entry.id));
    try {
      const updated = await bridge().testProxyEntry(entry.id);
      setEntries((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      if (updated.lastStatus === 1) {
        toast.success(
          t('proxy.working'),
          `${updated.lastIp || updated.config.host} · ${updated.lastCountry} · ${updated.lastLatencyMs} ms`,
        );
      } else {
        toast.error(t('proxy.failed'), `${updated.config.host}:${updated.config.port}`);
      }
    } catch (error) {
      toast.error(t('err.generic'), messageOf(error));
    } finally {
      setTesting((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const testAll = async () => {
    setTestingAll(true);
    try {
      const updated = await bridge().testAllProxies();
      setEntries(updated);
      const working = updated.filter((row) => row.lastStatus === 1).length;
      toast.success(t('btn.testall'), `${working}/${updated.length}`);
    } catch (error) {
      toast.error(t('err.generic'), messageOf(error));
    } finally {
      setTestingAll(false);
    }
  };

  const createProfile = async (entry: ProxyEntry) => {
    if (subscription.tier === 'free' && profiles.length >= FREE_PROFILE_LIMIT) { setActivateOpen(true); return; }
    try {
      const created = await bridge().createProfileFromProxy(entry.id);
      await refreshProfiles();
      toast.success(t('proxy.use'), created.name);
    } catch (error) {
      toast.error(t('err.generic'), messageOf(error));
    }
  };

  const remove = async (entry: ProxyEntry) => {
    const ok = await confirm.ask({
      title: t('btn.delete'),
      body: t('proxy.delete.body').replace('{name}', entry.name || `${entry.config.host}:${entry.config.port}`),
      confirmLabel: t('btn.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await bridge().deleteProxy(entry.id);
      await load();
    } catch (error) {
      toast.error(t('err.generic'), messageOf(error));
    }
  };

  const diagnostics = async (entry: ProxyEntry | null) => {
    setLoadingNetwork(true);
    setNetwork(null);
    try {
      setNetwork(await bridge().networkReport(entry?.id));
    } catch (error) {
      toast.error(t('net.title'), messageOf(error));
    } finally {
      setLoadingNetwork(false);
    }
  };

  const working = entries.filter((entry) => entry.lastStatus === 1).length;
  const failing = entries.filter((entry) => entry.lastStatus === -1).length;

  return (
    <>
      <header className="header">
        <div className="header-titles">
          <h1>{t('proxy.title')}</h1>
          <div className="sub">
            {entries.length === 0
              ? t('sub.proxies')
              : `${entries.length} saved · ${working} working${failing ? ` · ${failing} failing` : ''}`}
          </div>
        </div>
        <div className="header-actions">
          <SearchInput value={query} onChange={setQuery} placeholder={t('search.proxies')} />
          <Button variant="soft" icon="speed" onClick={testAll} busy={testingAll}>
            {t('proxy.checkall')}
          </Button>
          <Button variant="soft" icon="wifi" onClick={() => void diagnostics(null)}>
            {t('net.title')}
          </Button>
          <Button variant="soft" icon="speed" onClick={() => setBatchTesting(true)}>
            {t('tools.proxy')}
          </Button>
          <Button variant="soft" icon="upload" onClick={() => setImporting(true)}>
            {t('proxy.import')}
          </Button>
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('proxy.add')}
          </Button>
        </div>
      </header>

      <div className="content">
        <div className="content-inner">
          {network || loadingNetwork ? (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-head">
                <Icon name="wifi" size={16} />
                <h3>{t('net.title')}</h3>
                <div className="grow" />
                {loadingNetwork ? <span className="spinner" style={{ color: 'var(--accent)' }} /> : null}
                <button className="icon-btn sm" onClick={() => setNetwork(null)} type="button" aria-label={t('btn.close')}>
                  <Icon name="close" />
                </button>
              </div>

              {network ? (
                <>
                  <div className="stat-grid" style={{ marginBottom: 12 }}>
                    <Stat value={<span className="mono" style={{ fontSize: 15 }}>{network.ip || '—'}</span>} label={t('net.exit')} />
                    <Stat value={network.country || '—'} label={t('net.country')} />
                    <Stat value={network.city || '—'} label={t('net.city')} />
                    <Stat value={`${network.latencyMs} ms`} label={t('net.latency')} />
                    <Stat value={network.timezone || '—'} label={t('net.tz')} />
                    <Stat value={network.isp || '—'} label={t('net.isp')} />
                  </div>

                  {network.clockSkewSeconds !== null ? (
                    <Banner tone={Math.abs(network.clockSkewSeconds) > 30 ? 'warn' : 'ok'} icon="clock">
                      {t('net.clock')}:{' '}
                      {Math.abs(network.clockSkewSeconds) < 1
                        ? t('net.clock.ok')
                        : t('net.clock.skew').replace('{n}', network.clockSkewSeconds.toFixed(1))}
                    </Banner>
                  ) : null}

                  {network.warnings.map((warning) => (
                    <div key={warning} style={{ marginTop: 8 }}>
                      <Banner tone="warn" icon="info">
                        {warning}
                      </Banner>
                    </div>
                  ))}

                  <div className="hint" style={{ marginTop: 10 }}>
                    {t('net.sources')}: {network.sources.join(', ') || '—'}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {entries.length === 0 && !loading ? (
            <EmptyState
              icon="proxy"
              title={t('proxy.empty')}
              body={t('proxy.empty.body')}
              action={
                <div className="cluster" style={{ justifyContent: 'center' }}>
                  <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
                    {t('proxy.add')}
                  </Button>
                  <Button variant="soft" icon="upload" onClick={() => setImporting(true)}>
                    {t('proxy.import')}
                  </Button>
                </div>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState icon="search" title={t('empty.nomatch')} body={t('empty.nomatch.sub')} />
          ) : (
            <div className="rows">
              {visible.map((entry) => {
                const busy = testing.has(entry.id);
                const status =
                  entry.lastStatus === 1 ? 'ok' : entry.lastStatus === -1 ? 'err' : 'muted';
                return (
                  <div className="row" key={entry.id}>
                    <div
                      className="row-icon"
                      style={
                        status === 'ok'
                          ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
                          : status === 'err'
                            ? { background: 'var(--err-soft)', color: 'var(--err)' }
                            : undefined
                      }
                    >
                      {busy ? <span className="spinner" /> : <Icon name={status === 'ok' ? 'wifi' : status === 'err' ? 'info' : 'proxy'} />}
                    </div>

                    <div className="row-main">
                      <div className="row-title">
                        <span className="truncate">{entry.name || `${entry.config.host}:${entry.config.port}`}</span>
                        <Chip tone="muted">{entry.config.type.toUpperCase()}</Chip>
                        {entry.usedBy > 0 ? (
                          <Chip tone="accent" icon="profiles">
                            {t('proxy.used.n').replace('{n}', String(entry.usedBy))}
                          </Chip>
                        ) : (
                          <Chip tone="muted">{t('proxy.unused')}</Chip>
                        )}
                        {entry.usedBy > 1 ? (
                          <Chip tone="warn" icon="link" title="Two profiles behind one address are easy to link">
                            shared
                          </Chip>
                        ) : null}
                      </div>
                      <div className="row-sub">
                        <span className="mono">
                          {entry.config.type === 'none' ? '—' : `${entry.config.host || '—'}:${entry.config.port || '—'}`}
                        </span>
                        {entry.lastCountry ? ` · ${entry.lastCountry}${entry.lastCity ? `, ${entry.lastCity}` : ''}` : ''}
                        {entry.lastLatencyMs ? ` · ${entry.lastLatencyMs} ms` : ''}
                        {entry.lastChecked ? ` · ${when(entry.lastChecked)}` : ` · ${t('proxy.never')}`}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </div>
                    </div>

                    <div className="row-actions">
                      <Button size="sm" variant="soft" icon="speed" onClick={() => void test(entry)} busy={busy}>
                        {t('btn.test')}
                      </Button>
                      <Button size="sm" variant="ghost" icon="plus" onClick={() => void createProfile(entry)} title={t('proxy.use')} />
                      <Button size="sm" variant="ghost" icon="wifi" onClick={() => void diagnostics(entry)} title={t('net.title')} />
                      <Menu
                        actions={[
                          { label: t('generic.edit'), icon: 'edit', onClick: () => setEditing(entry) },
                          { label: t('proxy.use'), icon: 'plus', onClick: () => void createProfile(entry) },
                          { separator: true, label: '', onClick: () => undefined },
                          {
                            label: t('generic.copy'),
                            icon: 'copy',
                            onClick: () => {
                              const text = `${entry.config.host}:${entry.config.port}${entry.config.user ? `:${entry.config.user}:${entry.password ?? ''}` : ''}`;
                              void navigator.clipboard?.writeText(text);
                              toast.success(t('generic.copied'), text);
                            },
                          },
                          { separator: true, label: '', onClick: () => undefined },
                          { label: t('btn.delete'), icon: 'trash', danger: true, onClick: () => void remove(entry) },
                        ]}
                        trigger={(openMenu) => <button className="icon-btn" onClick={openMenu} type="button" aria-label="More"><Icon name="dotVertical" /></button>}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {profiles.filter((profile) => profile.linked && profile.hasProxy).slice(0, 1).map(() => (
              <Banner key="link" tone="warn" icon="link">
                Two profiles share an exit address. A site comparing them sees one visitor.
              </Banner>
            ))}
          </div>
        </div>
      </div>

      {editing ? (
        <ProxyEditor
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      {importing ? (
        <ImportModal
          onClose={() => setImporting(false)}
          onImported={async () => {
            setImporting(false);
            await load();
          }}
        />
      ) : null}

      {batchTesting ? <BatchTestModal onClose={() => setBatchTesting(false)} /> : null}

      <ActivateDialog open={activateOpen} onClose={() => setActivateOpen(false)} onActivated={() => void subscription.refresh()} />
      {confirm.dialog}
    </>
  );
}

/* ------------------------------------------------------------------ batch test */

/**
 * Check a pasted list before any of it is saved.
 *
 * The original had this as its own Tools tile and it is the difference between buying a proxy
 * list and using one: a hundred lines go in, the dead ones come out, and nothing enters the
 * library until the working ones do. Rows are shown as they were pasted so a failure can be
 * pointed at rather than guessed at.
 */
function BatchTestModal({ onClose }: { onClose: () => void }): ReactNode {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ProxyBatchRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    setRows(null);
    try {
      setRows(await bridge().testProxyLines(text));
    } catch (problem) {
      setError(messageOf(problem));
    } finally {
      setBusy(false);
    }
  };

  const parsed = text.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean).length;
  const working = (rows ?? []).filter((row) => row.ok).length;

  return (
    <Modal
      title={t('tools.proxy')}
      subtitle={t('tools.proxy.hint')}
      onClose={onClose}
      width="wide"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('btn.close')}
          </Button>
          <Button
            variant="primary"
            icon="speed"
            busy={busy}
            disabled={parsed === 0}
            onClick={() => void run()}
          >
            {t('proxy.testline').replace('{n}', String(parsed))}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('proxy.lines')} hint={t('proxy.lines.hint')}>
          <textarea
            className="input mono"
            rows={6}
            spellCheck={false}
            value={text}
            placeholder={'http://user:pass@host:port\nsocks5://host:port'}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>

        {error ? (
          <Banner tone="err" icon="info">
            {error}
          </Banner>
        ) : null}

        {busy ? (
          <div className="cluster faint" style={{ fontSize: 12.5 }}>
            <span className="spinner" /> {t('proxy.testing').replace('{n}', String(parsed))}
          </div>
        ) : null}

        {rows ? (
          rows.length === 0 ? (
            <div className="hint">{t('proxy.empty')}</div>
          ) : (
            <>
              <div className="cluster" style={{ gap: 6 }}>
                <Chip tone={working > 0 ? 'ok' : 'err'}>
                  {t('proxy.working').replace('{ok}', String(working))}
                </Chip>
                <Chip tone={working === rows.length ? 'muted' : 'err'}>
                  {t('proxy.failing').replace('{n}', String(rows.length - working))}
                </Chip>
                <span className="faint" style={{ fontSize: 12 }}>
                  {t('proxy.paste.hint')}
                </span>
              </div>
              <div className="rows">
                {rows.map((row, index) => (
                  <div className="row" key={`${row.line}-${index}`}>
                    <div className="row-icon" style={{ color: row.ok ? 'var(--ok)' : 'var(--err)' }}>
                      <Icon name={row.ok ? 'check' : 'close'} />
                    </div>
                    <div className="row-main">
                      <div className="row-title mono" style={{ fontSize: 12.5 }}>
                        {row.host ? `${row.host}:${row.port}` : row.line}
                      </div>
                      <div className="row-sub">
                        {row.ok
                          ? `${row.ip}${row.country ? ` · ${row.country}` : ''} · ${row.latencyMs} ms`
                          : row.error || t('proxy.unreachable')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ editor */

function ProxyEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: ProxyEntry | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useI18n();
  const toast = useToast();

  const [name, setName] = useState(entry?.name ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [type, setType] = useState<ProxyConfig['type']>(entry?.config.type ?? 'http');
  const [host, setHost] = useState(entry?.config.host ?? '');
  const [port, setPort] = useState(entry?.config.port ?? 8080);
  const [user, setUser] = useState(entry?.config.user ?? '');
  const [password, setPassword] = useState(entry?.password ?? '');
  const [replacePassword, setReplacePassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState('');

  const config = (): ProxyConfig => ({
    ...(entry?.config ?? {
      type,
      host,
      port,
      user,
      passwordEnc: '',
      lastIp: '',
      lastCountry: '',
      lastCountryCode: '',
      lastTimezone: '',
      lastCity: '',
      fallbackDirect: false,
    }),
    type,
    host,
    port,
    user,
    password,
  });

  const check = async () => {
    setChecking(true);
    setResult('');
    try {
      const outcome = await bridge().checkProxy(config(), password);
      setResult(
        outcome.ok
          ? `${outcome.ip} · ${outcome.country}${outcome.city ? `, ${outcome.city}` : ''} · ${outcome.latencyMs} ms`
          : outcome.error || t('proxy.failed'),
      );
    } catch (error) {
      setResult(messageOf(error));
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    if (!host.trim() || !port) {
      toast.warn(t('err.badProxy'), t('ed.host'));
      return;
    }
    setSaving(true);
    try {
      await bridge().saveProxy({ id: entry?.id, name, note, password, replacePassword, config: config() });
      toast.success(t('btn.save'), name || `${host}:${port}`);
      onSaved();
    } catch (error) {
      toast.error(t('err.save'), messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={entry ? t('proxy.edit.title') : t('proxy.save.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon="speed" onClick={check} busy={checking}>
            {t('btn.test')}
          </Button>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('btn.cancel')}
          </Button>
          <Button variant="primary" icon="save" onClick={save} busy={saving}>
            {t('btn.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        {result ? <Banner tone={/\d+\.\d+\.\d+\.\d+/.test(result) ? 'ok' : 'err'}>{result}</Banner> : null}

        <div className="form-grid">
          <Field label={t('proxy.name')} span={2}>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="UK residential" />
          </Field>

          <Field label={t('ed.ptype')} span={2}>
            <Segmented
              value={type}
              onChange={(next) => setType(next as ProxyConfig['type'])}
              options={PROXY_TYPES.filter((option) => option !== 'none').map((option) => ({ id: option, label: option.toUpperCase() }))}
            />
          </Field>

          <Field label={t('ed.host')}>
            <input className="input mono" value={host} onChange={(event) => setHost(event.target.value)} onPaste={(event) => {
              const parsed = parseProxyLine(event.clipboardData.getData('text'));
              if (!parsed) return;
              event.preventDefault();
              setType(parsed.type ?? 'http'); setHost(parsed.host ?? ''); setPort(parsed.port ?? 0);
              setUser(parsed.user ?? ''); setPassword(parsed.password ?? ''); setReplacePassword(true);
            }} placeholder="gate.example.com" spellCheck={false} />
          </Field>

          <Field label={t('ed.port')}>
            <input className="input mono num" type="number" value={port || ''} onChange={(event) => setPort(Number(event.target.value) || 0)} />
          </Field>

          <Field label={t('ed.user')}>
            <input className="input mono" value={user} onChange={(event) => setUser(event.target.value)} autoComplete="off" spellCheck={false} />
          </Field>

          <Field label={t('ed.pass')} hint={t('proxy.password.hint')}>
            <input className="input mono" type="password" value={password} onChange={(event) => { setPassword(event.target.value); setReplacePassword(true); }} autoComplete="new-password" />
          </Field>

          <Field label={t('proxy.note')} hint={t('proxy.note.hint')} span={2}>
            <input className="input" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ import */

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }): ReactNode {
  const { t } = useI18n();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title={t('proxy.import.title')}
      subtitle={t('proxy.import.hint')}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('btn.cancel')}
          </Button>
          <Button
            variant="primary"
            icon="upload"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await bridge().importProxyList(text);
                toast.success(t('proxy.import.added').replace('{n}', String(result.added)));
                if (result.failed.length > 0) {
                  toast.warn(t('proxy.import.failed').replace('{n}', String(result.failed.length)), result.failed.slice(0, 4).join(', '));
                }
                onImported();
              } catch (error) {
                toast.error(t('err.generic'), messageOf(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('btn.import')}
          </Button>
        </>
      }
    >
      <textarea
        className="textarea mono"
        rows={12}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={'gate.example.com:8080:user:password\n1.2.3.4:1080\nuser:pass@5.6.7.8:3128'}
        spellCheck={false}
      />
    </Modal>
  );
}
