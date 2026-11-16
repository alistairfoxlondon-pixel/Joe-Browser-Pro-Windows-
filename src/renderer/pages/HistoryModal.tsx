import { useEffect, useMemo, useState } from 'react';
import type { HistoryEntry, ProfileSummary } from '../../shared/types';
import { bridge } from '../bridge';
import { Empty, Modal, Spinner } from '../components/UI';
import { messageOf } from '../util';

/**
 * One profile's browsing history.
 *
 * Isolated by construction: the main process reads a file named after this profile and no other,
 * so there is no query that could return another profile's pages. Clearing it is a delete of that
 * file, not a filtered write.
 */
export function HistoryModal({
  profile,
  onClose,
  toast,
}: {
  profile: ProfileSummary;
  onClose(): void;
  toast(kind: 'info' | 'success' | 'warn' | 'error', title: string, detail?: string): void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void bridge()
      .listHistory(profile.id, 800)
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch((error) => {
        if (!cancelled) {
          setEntries([]);
          toast('error', 'Could not read the history', messageOf(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profile.id, toast]);

  const visible = useMemo(() => {
    if (!entries) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.url.toLowerCase().includes(needle) || entry.title.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, HistoryEntry[]>();
    for (const entry of visible) {
      const day = entry.at.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(entry);
      byDay.set(day, list);
    }
    return [...byDay.entries()];
  }, [visible]);

  async function clear() {
    setClearing(true);
    try {
      const freed = await bridge().clearHistory(profile.id);
      setEntries([]);
      toast('success', 'History cleared', freed > 0 ? `${Math.round(freed / 1024)} KB removed` : '');
    } catch (error) {
      toast('error', 'Could not clear the history', messageOf(error));
    } finally {
      setClearing(false);
    }
  }

  return (
    <Modal
      title={`History · ${profile.name}`}
      subtitle="Pages this profile visited. No other profile can see them."
      onClose={onClose}
      width={680}
      footer={
        <>
          <span style={{ marginRight: 'auto', color: 'var(--muted)', fontSize: 12 }}>
            {entries === null ? 'Reading…' : `${entries.length} entries`}
          </span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-danger"
            onClick={clear}
            disabled={clearing || !entries || entries.length === 0}
          >
            {clearing ? <Spinner /> : null} Clear history
          </button>
        </>
      }
    >
      <input
        className="input"
        placeholder="Search this profile's history"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {entries === null ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)' }}>
          <Spinner /> Reading the history file…
        </div>
      ) : entries.length === 0 ? (
        <Empty
          icon="⇥"
          title="Nothing recorded yet"
          body="Open this profile and browse; every page it visits is recorded here, isolated from the others."
        />
      ) : visible.length === 0 ? (
        <Empty icon="⌕" title="Nothing matches" body="No entry in this profile's history matches that search." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(([day, dayEntries]) => (
            <div key={day}>
              <div className="section-label" style={{ marginBottom: 6 }}>
                {day}
              </div>
              <div className="list">
                {dayEntries.map((entry) => (
                  <div className="list-row" key={`${entry.at}-${entry.url}`}>
                    <div className="list-main">
                      <div className="list-title" title={entry.url}>
                        {entry.title || shortUrl(entry.url)}
                      </div>
                      <div className="list-sub mono">{entry.url}</div>
                    </div>
                    <span className="chip">{timeOf(entry.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

function timeOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
