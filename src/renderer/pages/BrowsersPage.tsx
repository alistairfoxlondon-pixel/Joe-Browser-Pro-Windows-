import { useEffect, useMemo, useState } from 'react';
import type { DetectedBrowser, KernelBuild } from '../../shared/types';
import { bridge, onEvent } from '../bridge';
import { Empty, Spinner, bytes } from '../components/UI';
import { messageOf } from '../util';

const ENGINE_NAMES: Record<string, string> = {
  chrome: 'Google Chrome',
  chromium: 'Chromium',
  edge: 'Microsoft Edge',
  brave: 'Brave',
  firefox: 'Firefox',
  opera: 'Opera',
};

const FILTERS = ['all', 'chrome', 'chromium', 'firefox'] as const;

export function BrowsersPage({
  toast,
}: {
  toast(kind: 'info' | 'success' | 'warn' | 'error', title: string, detail?: string): void;
}) {
  const [builds, setBuilds] = useState<KernelBuild[]>([]);
  const [detected, setDetected] = useState<DetectedBrowser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [working, setWorking] = useState<string>('');
  const [progress, setProgress] = useState<Record<string, number>>({});

  async function load(refresh = false) {
    setLoading(true);
    setError('');
    try {
      const [list, local] = await Promise.all([
        bridge().listKernels(),
        bridge().detectInstalledBrowsers(),
      ]);
      setBuilds(list);
      setDetected(local);
      void refresh;
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const off = onEvent('kernel:progress', (payload) => {
      const { id, received, total } = payload as { id: string; received: number; total: number };
      setProgress((current) => ({
        ...current,
        [id]: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0,
      }));
    });
    return off;
  }, []);

  const visible = useMemo(
    () => builds.filter((build) => filter === 'all' || build.engine === filter),
    [builds, filter],
  );

  const installed = builds.filter((build) => build.installed);

  async function install(build: KernelBuild) {
    setWorking(build.id);
    setProgress((current) => ({ ...current, [build.id]: 0 }));
    try {
      await bridge().downloadKernel(build.id);
      toast('success', `${ENGINE_NAMES[build.engine] ?? build.engine} ${build.version} installed`, 'It can now be pinned to a profile.');
      await load(true);
    } catch (cause) {
      toast('error', 'Could not install that build', messageOf(cause));
    } finally {
      setWorking('');
      setProgress((current) => {
        const next = { ...current };
        delete next[build.id];
        return next;
      });
    }
  }

  async function remove(build: KernelBuild) {
    setWorking(build.id);
    try {
      await bridge().removeKernel(build.id);
      toast('success', 'Build removed');
      await load(true);
    } catch (cause) {
      toast('error', 'Could not remove that build', messageOf(cause));
    } finally {
      setWorking('');
    }
  }

  return (
    <>
      <div className="main-head">
        <div>
          <h1 className="main-title">Browsers</h1>
          <p className="main-sub">
            Pinned builds from the vendors’ own release channels. Nothing downloads until you ask
            for it, or a profile needs it.
          </p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => void load(true)} disabled={loading}>
            {loading ? <Spinner /> : null} Refresh catalog
          </button>
        </div>
      </div>

      <div className="main-body">
        <div className="stat-row">
          <div className="stat">
            <div className="k">Installed builds</div>
            <div className="v">{installed.length}</div>
          </div>
          <div className="stat">
            <div className="k">On disk</div>
            <div className="v">{bytes(installed.reduce((sum, b) => sum + b.sizeBytes, 0))}</div>
          </div>
          <div className="stat">
            <div className="k">Browsers on this PC</div>
            <div className="v">{detected.length}</div>
          </div>
        </div>

        {detected.length > 0 ? (
          <>
            <div className="section-label" style={{ marginBottom: 8 }}>
              Already on this PC
            </div>
            <div className="list" style={{ marginBottom: 22 }}>
              {detected.map((browser) => (
                <div className="list-row" key={`${browser.engine}-${browser.path}`}>
                  <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                    {(ENGINE_NAMES[browser.engine] ?? browser.engine).charAt(0)}
                  </div>
                  <div className="list-main">
                    <div className="list-title">{browser.name}</div>
                    <div className="list-sub mono">{browser.path}</div>
                  </div>
                  <span className="chip">{browser.version || 'unknown'}</span>
                  <span className="chip ok">ready to use</span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {FILTERS.map((entry) => (
            <button
              key={entry}
              className={`btn btn-sm ${filter === entry ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(entry)}
            >
              {entry === 'all' ? 'All engines' : ENGINE_NAMES[entry] ?? entry}
            </button>
          ))}
        </div>

        {error ? (
          <Empty
            icon="⚠"
            title="The catalog could not be read"
            body={error}
            action={
              <button className="btn" onClick={() => void load(true)}>
                Try again
              </button>
            }
          />
        ) : loading && builds.length === 0 ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)', padding: 20 }}>
            <Spinner /> Reading the vendor release channels…
          </div>
        ) : visible.length === 0 ? (
          <Empty icon="◎" title="No builds listed" body="Refresh the catalog to fetch the current release channels." />
        ) : (
          <div className="list">
            {visible.slice(0, 60).map((build) => (
              <div className="list-row" key={build.id}>
                <div className="list-main">
                  <div className="list-title">
                    {ENGINE_NAMES[build.engine] ?? build.engine}{' '}
                    <span className="mono" style={{ color: 'var(--muted)', fontWeight: 400 }}>
                      {build.version}
                    </span>
                  </div>
                  <div className="list-sub">
                    {build.channel} · {build.os}
                    {build.installed ? ` · ${bytes(build.sizeBytes)} on disk` : ''}
                  </div>
                  {progress[build.id] !== undefined ? (
                    <div className="progress" style={{ marginTop: 7, maxWidth: 320 }}>
                      <div style={{ width: `${progress[build.id]}%` }} />
                    </div>
                  ) : null}
                </div>

                {build.installed ? (
                  <>
                    <span className="chip ok">installed</span>
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={working === build.id}
                      onClick={() => void remove(build)}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-sm"
                    disabled={working === build.id}
                    onClick={() => void install(build)}
                  >
                    {working === build.id ? <Spinner /> : null}
                    {working === build.id ? 'Installing' : 'Install'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
