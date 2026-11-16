import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CHECK_SITES, type LeakReport, type ProfileSummary, type SessionInfo } from '../../shared/types';
import { bridge } from '../bridge';
import { Empty, Modal, Spinner, ago, bytes } from '../components/UI';
import { ProfileEditor } from './ProfileEditor';
import { HistoryModal } from './HistoryModal';
import { messageOf } from '../util';

interface Props {
  profiles: ProfileSummary[];
  sessions: Record<string, SessionInfo>;
  toast(kind: 'info' | 'success' | 'warn' | 'error', title: string, detail?: string): void;
  refresh(): Promise<void>;
}

export function ProfilesPage({ profiles, sessions, toast, refresh }: Props) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [editing, setEditing] = useState<ProfileSummary | 'new' | null>(null);
  const [report, setReport] = useState<LeakReport | null>(null);
  const [historyFor, setHistoryFor] = useState<ProfileSummary | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const groups = useMemo(() => {
    const seen = new Set(profiles.map((p) => p.group).filter(Boolean));
    return ['all', ...seen];
  }, [profiles]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (group !== 'all' && profile.group !== group) return false;
      if (!needle) return true;
      return (
        profile.name.toLowerCase().includes(needle) ||
        profile.group.toLowerCase().includes(needle) ||
        profile.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
        profile.proxyDetail.toLowerCase().includes(needle)
      );
    });
  }, [profiles, query, group]);

  useEffect(() => {
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  async function launch(profile: ProfileSummary) {
    setBusy(profile.id);
    try {
      await bridge().launchProfile(profile.id);
      toast('success', `${profile.name} is opening`, 'The browser is starting with this profile’s own identity.');
      await refresh();
    } catch (error) {
      toast('error', `Could not open ${profile.name}`, messageOf(error));
    } finally {
      setBusy('');
    }
  }

  async function stop(profile: ProfileSummary) {
    setBusy(profile.id);
    try {
      await bridge().stopProfile(profile.id);
      await refresh();
    } catch (error) {
      toast('error', `Could not close ${profile.name}`, messageOf(error));
    } finally {
      setBusy('');
    }
  }

  async function act(
    profile: ProfileSummary,
    work: () => Promise<void>,
    failure: string,
  ): Promise<void> {
    setMenuFor(null);
    setBusy(profile.id);
    try {
      await work();
      await refresh();
    } catch (error) {
      toast('error', failure, messageOf(error));
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <div className="main-head">
        <div>
          <h1 className="main-title">Profiles</h1>
          <p className="main-sub">
            {profiles.length} profile{profiles.length === 1 ? '' : 's'}
            {Object.keys(sessions).length > 0
              ? ` · ${Object.keys(sessions).length} running`
              : ' · every one is its own browser'}
          </p>
        </div>

        <div className="head-actions">
          <div className="search">
            <span aria-hidden="true">⌕</span>
            <input
              className="input"
              placeholder="Search name, tag, proxy"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {groups.length > 2 ? (
            <select
              className="select"
              style={{ width: 140 }}
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            >
              {groups.map((name) => (
                <option key={name} value={name}>
                  {name === 'all' ? 'All groups' : name}
                </option>
              ))}
            </select>
          ) : null}

          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            + New profile
          </button>
        </div>
      </div>

      <div className="main-body">
        {profiles.length === 0 ? (
          <Empty
            icon="▦"
            title="No profiles yet"
            body="A profile is a browser of its own: its own cookies, its own logins, and a fingerprint that is not shared with any other profile in this window."
            action={
              <button className="btn btn-primary" onClick={() => setEditing('new')}>
                Create the first profile
              </button>
            }
          />
        ) : visible.length === 0 ? (
          <Empty icon="⌕" title="Nothing matches" body="No profile matches that search or group." />
        ) : (
          <div className="grid">
            {visible.map((profile) => {
              const session = sessions[profile.id];
              const running = Boolean(session) || profile.running;
              const working = busy === profile.id;

              return (
                <article className="card" key={profile.id}>
                  <div className="card-top">
                    <div
                      className="avatar"
                      style={{ background: profile.colors.tint, color: profile.colors.accent }}
                    >
                      {initials(profile.name)}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="card-name" title={profile.name}>
                        {profile.name}
                      </div>
                      <div className="card-meta">
                        {profile.os} · {profile.engine} {shortVersion(profile.browserVersion)}
                        {' · '}
                        {ago(profile.lastOpenedAt)}
                      </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <button
                        className="icon-btn"
                        aria-label="Profile menu"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuFor(menuFor === profile.id ? null : profile.id);
                        }}
                      >
                        ⋯
                      </button>

                      {menuFor === profile.id ? (
                        <div
                          className="menu"
                          onClick={(event) => event.stopPropagation()}
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 34,
                            zIndex: 20,
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border-strong)',
                            borderRadius: 10,
                            padding: 5,
                            minWidth: 196,
                            boxShadow: 'var(--shadow)',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          <MenuItem
                            onClick={() => {
                              setMenuFor(null);
                              setEditing(profile);
                            }}
                          >
                            Edit profile
                          </MenuItem>
                          <MenuItem
                            onClick={() =>
                              act(profile, async () => {
                                await bridge().duplicateProfile(profile.id);
                                toast('success', `${profile.name} duplicated`, 'The copy keeps the same identity.');
                              }, 'Could not duplicate the profile')
                            }
                          >
                            Duplicate
                          </MenuItem>
                          <MenuItem
                            onClick={() =>
                              act(profile, async () => {
                                await bridge().rerollFingerprint(profile.id);
                                toast('success', 'Fingerprint re-rolled', 'A new identity, unique against every other profile.');
                              }, 'Could not re-roll the fingerprint')
                            }
                          >
                            Re-roll fingerprint
                          </MenuItem>
                          <MenuItem
                            onClick={() =>
                              act(profile, async () => {
                                const report = await bridge().runLeakCheck(profile.id);
                                setReport(report);
                              }, 'Could not run the fingerprint check')
                            }
                          >
                            Check fingerprint
                          </MenuItem>
                          <MenuItem
                            onClick={() => {
                              setMenuFor(null);
                              setHistoryFor(profile);
                            }}
                          >
                            History
                          </MenuItem>
                          <MenuItem
                            onClick={() =>
                              act(profile, async () => {
                                const freed = await bridge().clearProfileData(profile.id, 'cache');
                                toast('success', 'Cache cleared', `${bytes(freed)} reclaimed. Logins untouched.`);
                              }, 'Could not clear the cache')
                            }
                          >
                            Clear cache
                          </MenuItem>
                          <div className="divider" style={{ margin: '4px 0' }} />
                          <MenuItem
                            danger
                            onClick={() =>
                              act(profile, async () => {
                                if (!window.confirm(`Delete “${profile.name}” and all of its data?`)) return;
                                await bridge().deleteProfile(profile.id);
                                toast('success', `${profile.name} deleted`);
                              }, 'Could not delete the profile')
                            }
                          >
                            Delete profile
                          </MenuItem>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="chips">
                    {running ? <span className="chip live">● running</span> : null}
                    <span className={`chip ${profile.proxyLabel === 'Direct' ? '' : 'ok'}`}>
                      {profile.proxyLabel === 'Direct' ? 'Direct' : profile.proxyLabel}
                    </span>
                    <span className="chip">{profile.os}</span>
                    {profile.group ? <span className="chip">{profile.group}</span> : null}
                    {profile.tags.slice(0, 2).map((tag) => (
                      <span className="chip" key={tag}>
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="card-actions">
                    <button
                      className={`btn grow ${running ? '' : 'btn-primary'}`}
                      disabled={working}
                      onClick={() => (running ? stop(profile) : launch(profile))}
                    >
                      {working ? <Spinner /> : null}
                      {working ? 'Working' : running ? 'Close browser' : 'Open profile'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {editing ? (
        <ProfileEditor
          profile={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (name) => {
            setEditing(null);
            await refresh();
            toast('success', `${name} saved`);
          }}
          toast={toast}
        />
      ) : null}

      {report ? (
        <Modal
          title="Fingerprint check"
          subtitle="Claim against observation, surface by surface."
          onClose={() => setReport(null)}
          footer={
            <>
              <span style={{ marginRight: 'auto', color: 'var(--muted)', fontSize: 12 }}>
                {report.score}% of surfaces agree
              </span>
              <button className="btn" onClick={() => setReport(null)}>
                Close
              </button>
            </>
          }
        >
          <div className="list">
            {report.surfaces.map((surface) => (
              <div className="list-row" key={surface.name}>
                <div className="list-main">
                  <div className="list-title">{surface.name}</div>
                  <div className="list-sub mono">
                    claim {surface.claim} · seen {surface.observed}
                  </div>
                </div>
                <span className={`chip ${surface.ok ? 'ok' : 'warn'}`}>
                  {surface.ok ? 'agree' : 'differs'}
                </span>
              </div>
            ))}
          </div>

          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>
              Check it from inside this profile
            </div>
            <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
              Each of these opens in the profile's own session, so the site sees the fingerprint
              under test rather than this window's browser.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CHECK_SITES.map((site) => (
                <button
                  key={site.name}
                  className="btn btn-sm"
                  onClick={async () => {
                    try {
                      await bridge().openInProfile(report.profileId, site.url);
                    } catch (error) {
                      toast('error', `Could not open ${site.name}`, messageOf(error));
                    }
                  }}
                >
                  {site.name} ↗
                </button>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {historyFor ? (
        <HistoryModal
          profile={historyFor}
          onClose={() => setHistoryFor(null)}
          toast={toast}
        />
      ) : null}
    </>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick(): void;
  danger?: boolean;
}) {
  return (
    <button
      className="btn btn-ghost"
      style={{
        justifyContent: 'flex-start',
        padding: '7px 10px',
        color: danger ? 'var(--err)' : undefined,
        fontWeight: 500,
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

function shortVersion(version: string): string {
  const major = version.split('.')[0];
  return major ? `v${major}` : '';
}
