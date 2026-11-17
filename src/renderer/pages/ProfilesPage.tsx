import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppSettings, Profile, ProfileSummary, SessionInfo, SortMode } from '../../shared/types';
import { SORT_MODES } from '../../shared/types';
import { bridge } from '../bridge';
import { useI18n } from '../i18n';
import { Icon } from '../components/Icon';
import {
  Banner,
  Button,
  EmptyState,
  IconButton,
  Menu,
  SearchInput,
  Segmented,
  useConfirm,
  useToast,
  type MenuAction,
} from '../components/UI';
import { ProfileCard, ProfileRow, shortOs } from '../components/ProfileCard';
import { ProfileEditor } from './ProfileEditor';
import { LeakModal } from './LeakModal';
import { BatchCreateModal } from './BatchCreateModal';
import { useSubscription } from '../cloud/subscription';
import { FREE_PROFILE_LIMIT } from '../cloud/client';
import { ActivateDialog } from '../components/ActivateDialog';
import { messageOf } from '../util';

/**
 * The profile workspace.
 *
 * Everything the user does with a profile starts here: a card grid that narrows to rows, one
 * search box over every field worth searching, a sort that matches the original's six modes, a
 * selection that makes bulk actions possible, and a single menu per profile with the same actions
 * the original's kebab menu carried.
 *
 * Three behaviours are worth calling out because they are what makes a grid usable at a hundred
 * profiles: the search covers name, group, tag, operating system, language and proxy host in one
 * field; the selection survives a filter change so you can pick from one group and add to another;
 * and a card shows a "linked" chip the moment its identity overlaps another profile's.
 */

interface Filters {
  query: string;
  quick: 'all' | 'running' | 'proxy' | 'direct';
}

const EMPTY_FILTERS: Filters = { query: '', quick: 'all' };

export function ProfilesPage({
  profiles,
  runningById,
  settings,
  saveSettings,
  refresh,
  toast: pageToast,
}: {
  profiles: ProfileSummary[];
  runningById: Map<string, SessionInfo>;
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  refresh: () => Promise<void>;
  toast: ReturnType<typeof useToast>;
}): ReactNode {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [leakFor, setLeakFor] = useState<ProfileSummary | null>(null);
  const [batching, setBatching] = useState(false);
  // Free plan is one profile; trial and premium are unlimited. The ceiling is enforced here, at
  // the only places a profile can come into existence.
  const subscription = useSubscription();
  const limitReached = subscription.tier === 'free' && profiles.length >= FREE_PROFILE_LIMIT;
  const [activateOpen, setActivateOpen] = useState(false);
  const openCreate = () => (limitReached ? setActivateOpen(true) : setCreating(true));
  const openBatch = () => (subscription.tier === 'free' ? setActivateOpen(true) : setBatching(true));
  const [busy, setBusy] = useState<string>('');
  const searchRef = useRef<HTMLDivElement>(null);

  const density = settings.density;

  /* ---------------------------------------------------------------- search + filter */

  useEffect(() => {
    const focus = () => {
      const input = searchRef.current?.querySelector('input');
      input?.focus();
      input?.select();
    };
    const onNew = () => { if (limitReached) setActivateOpen(true); else setCreating(true); };
    const onEscape = () => {
      setSelected(new Set());
      setFilters(EMPTY_FILTERS);
    };
    const onFocusProfile = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const profile = profiles.find((entry) => entry.id === id);
      if (profile) setFilters({ ...EMPTY_FILTERS, query: profile.name });
    };

    window.addEventListener('joe:focus-search', focus);
    window.addEventListener('joe:new-profile', onNew);
    window.addEventListener('joe:escape', onEscape);
    window.addEventListener('joe:focus-profile', onFocusProfile);
    return () => {
      window.removeEventListener('joe:focus-search', focus);
      window.removeEventListener('joe:new-profile', onNew);
      window.removeEventListener('joe:escape', onEscape);
      window.removeEventListener('joe:focus-profile', onFocusProfile);
    };
  }, [profiles, limitReached]);

  const visible = useMemo(() => {
    const needle = filters.query.trim().toLowerCase();

    const matching = profiles.filter((profile) => {
      if (filters.quick === 'running' && !(profile.running || runningById.has(profile.id))) return false;
      if (filters.quick === 'proxy' && !profile.hasProxy) return false;
      if (filters.quick === 'direct' && profile.hasProxy) return false;
      if (!needle) return true;

      // One field, every surface. A user who types "berlin" should find the group, the tag, the
      // timezone and the proxy city, not just the name.
      const haystack = [
        profile.name,
        profile.group,
        profile.tags.join(' '),
        profile.os,
        shortOs(profile.os),
        profile.language,
        profile.timezone,
        profile.proxyLabel,
        profile.proxyCountry,
        profile.notes,
        profile.status,
        profile.signature,
        profile.browserVersion,
        profile.engine,
      ]
        .join(' ')
        .toLowerCase();

      return needle.split(/\s+/).every((part) => haystack.includes(part));
    });

    // The main process already sorts, but the page keeps its own order so a change of sort is
    // instant rather than a round trip.
    const mode: SortMode = settings.sortBy;
    const sorted = [...matching].sort((a, b) => {
      switch (mode) {
        case 'name':
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'created':
          return b.createdAt.localeCompare(a.createdAt);
        case 'running': {
          const ar = runningById.has(a.id) || a.running ? 1 : 0;
          const br = runningById.has(b.id) || b.running ? 1 : 0;
          return br - ar || b.lastOpenedAt.localeCompare(a.lastOpenedAt);
        }
        case 'os':
          return shortOs(a.os).localeCompare(shortOs(b.os)) || a.name.localeCompare(b.name);
        case 'group':
          return (a.group || '\uffff').localeCompare(b.group || '\uffff') || a.name.localeCompare(b.name);
        case 'recent':
        default:
          return (b.lastOpenedAt || b.createdAt).localeCompare(a.lastOpenedAt || a.createdAt);
      }
    });

    return sorted;
  }, [profiles, filters, settings.sortBy, runningById]);

  const groups = useMemo(() => {
    if (settings.sortBy !== 'group') return [];
    const map = new Map<string, ProfileSummary[]>();
    for (const profile of visible) {
      const key = profile.group || '';
      const list = map.get(key) ?? [];
      list.push(profile);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visible, settings.sortBy]);

  /* ---------------------------------------------------------------- actions */

  const run = useCallback(
    async (label: string, work: () => Promise<void>) => {
      setBusy(label);
      try {
        await work();
      } catch (error) {
        toast.error(t('err.generic'), messageOf(error));
      } finally {
        setBusy('');
      }
    },
    [toast, t],
  );

  const open = useCallback(
    async (profile: ProfileSummary) => {
      if (profile.running || runningById.has(profile.id)) {
        await run(profile.id, async () => {
          await bridge().focusProfile(profile.id);
        });
        return;
      }
      await run(profile.id, async () => {
        await bridge().launchProfile(profile.id);
        await refresh();
      });
    },
    [run, refresh, runningById],
  );

  const stop = useCallback(
    async (profile: ProfileSummary) => {
      await run(profile.id, async () => {
        await bridge().stopProfile(profile.id);
        await refresh();
      });
    },
    [run, refresh],
  );

  /**
   * Arrow-key navigation over the card grid.
   *
   * The original moved focus between cards with the arrow keys, because a person who is opening
   * ten profiles in a row should not have to move the mouse ten times. A flat grid has no idea
   * where its columns are, so the column count is measured from the rendered card positions
   * rather than guessed from a CSS variable - at 1400 px there are more columns than at 900 px.
   *
   * Focus is tracked as an id, not as `document.activeElement`, so it survives a re-render of the
   * list when a profile's running state changes under it.
   */
  const [focusId, setFocusId] = useState<string | null>(null);

  const focusCard = useCallback((id: string | null) => {
    setFocusId(id);
    if (!id) return;
    // The card is focusable with tabIndex -1 so it takes focus without joining the tab order;
    // Tab still walks the real controls inside it.
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-profile-card="${CSS.escape(id)}"]`);
      element?.focus();
      element?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  const columnsIn = useCallback((container: HTMLElement): number => {
    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-profile-card]'));
    if (cards.length === 0) return 1;
    const firstTop = cards[0]!.getBoundingClientRect().top;
    let count = 0;
    for (const card of cards) {
      if (Math.abs(card.getBoundingClientRect().top - firstTop) > 4) break;
      count++;
    }
    return Math.max(1, count);
  }, []);

  const edit = useCallback(async (profile: ProfileSummary) => {
    const full = await bridge().getProfile(profile.id);
    if (full) setEditing(full);
  }, []);

  useEffect(() => {
    /**
     * The keys the original handled in ProcessCmdKey, for the page that owns the cards.
     *
     * These are page-scoped on purpose: Ctrl+A in a text field must still select the text, and
     * the arrow keys inside the search box must still move the caret. The handler bails out for
     * anything typed into a field.
     */
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true
      ) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      const order = Array.from(document.querySelectorAll<HTMLElement>('[data-profile-card]')).map(
        (element) => element.dataset['profileCard'] ?? '',
      );
      if (order.length === 0) return;

      // Ctrl+O cycles the sort, matching the original's CycleSort.
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        const index = SORT_MODES.findIndex((mode) => mode.id === settings.sortBy);
        const next = SORT_MODES[(index + 1) % SORT_MODES.length]!;
        void saveSettings({ sortBy: next.id });
        return;
      }
      // Ctrl+A selects every visible profile, the same as the bulk bar's "All".
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelected(new Set(visible.map((profile) => profile.id)));
        return;
      }
      if (event.key === 'F2' && focusId) {
        event.preventDefault();
        const profile = profiles.find((entry) => entry.id === focusId);
        if (profile) void edit(profile);
        return;
      }
      // Shift+F10 opens the focused card's menu. Most laptops have no Apps key.
      if (event.shiftKey && event.key === 'F10' && focusId) {
        event.preventDefault();
        document.querySelector<HTMLElement>(`[data-profile-card="${CSS.escape(focusId)}"] .icon-btn`)?.click();
        return;
      }
      if (event.key === 'Enter' && focusId) {
        event.preventDefault();
        const profile = profiles.find((entry) => entry.id === focusId);
        if (profile) void open(profile);
        return;
      }

      const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0 };
      if (!(event.key in step)) return;
      event.preventDefault();

      const current = focusId && order.includes(focusId) ? order.indexOf(focusId) : -1;
      const container = document.querySelector<HTMLElement>('.grid');
      const columns = container ? columnsIn(container) : 1;

      if (current < 0) {
        focusCard(order[0] ?? null);
        return;
      }
      let next = current;
      if (event.key === 'ArrowRight') next = Math.min(order.length - 1, current + 1);
      if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
      if (event.key === 'ArrowDown') next = Math.min(order.length - 1, current + columns);
      if (event.key === 'ArrowUp') next = Math.max(0, current - columns);
      focusCard(order[next] ?? null);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profiles, visible, settings.sortBy, saveSettings, focusId, focusCard, columnsIn, open, edit]);

  const remove = useCallback(
    async (profile: ProfileSummary) => {
      const ok = await confirm.ask({
        title: t('card.delete'),
        body: settings.useTrash
          ? t('trash.confirm.body').replace(
              '{name}',
              profile.name,
            )
          : t('trash.confirm.body.direct').replace(
              '{name}',
              profile.name,
            ),
        confirmLabel: t('btn.delete'),
        danger: true,
      });
      if (!ok) return;
      await run(profile.id, async () => {
        await bridge().deleteProfile(profile.id);
        setSelected((current) => {
          const next = new Set(current);
          next.delete(profile.id);
          return next;
        });
        await refresh();
        toast.success(t('btn.delete'), profile.name);
      });
    },
    [confirm, run, refresh, settings.useTrash, t, toast],
  );

  const duplicate = useCallback(
    async (profile: ProfileSummary) => {
      if (limitReached) { setActivateOpen(true); return; }
      await run(profile.id, async () => {
        const copy = await bridge().duplicateProfile(profile.id);
        await refresh();
        toast.success(t('btn.duplicate'), copy.name);
      });
    },
    [run, refresh, t, toast, limitReached],
  );

  const reroll = useCallback(
    async (profile: ProfileSummary) => {
      await run(profile.id, async () => {
        await bridge().rerollFingerprint(profile.id);
        await refresh();
        toast.success(t('ed.fp.new'), profile.name);
      });
    },
    [run, refresh, t, toast],
  );

  const clearData = useCallback(
    async (profile: ProfileSummary, scope: 'cache' | 'cookies' | 'siteData' | 'everything') => {
      if (scope === 'everything') {
        const ok = await confirm.ask({
          title: t('card.clear'),
          body: t('ed.fp.clash.body'),
          confirmLabel: t('btn.delete'),
          danger: true,
        });
        if (!ok) return;
      }
      await run(profile.id, async () => {
        const freed = await bridge().clearProfileData(profile.id, scope);
        await refresh();
        toast.success(t('card.clear'), profile.name);
        void freed;
      });
    },
    [confirm, run, refresh, t, toast],
  );

  const cookies = useCallback(
    async (profile: ProfileSummary, direction: 'in' | 'out') => {
      await run(profile.id, async () => {
        if (direction === 'out') {
          const file = await bridge().exportCookies(profile.id);
          if (file) toast.success(t('card.cookiesout'), file);
        } else {
          const count = await bridge().importCookies(profile.id);
          if (count > 0) toast.success(t('card.cookiesin'), String(count));
        }
      });
    },
    [run, t, toast],
  );

  const applyProxy = useCallback(
    async (profile: ProfileSummary) => {
      await run(profile.id, async () => {
        const saved = await bridge().listProxies();
        if (saved.length === 0) {
          toast.warn(t('proxy.empty'), t('proxy.empty.body'));
          return;
        }
        const working = saved.filter((entry) => entry.lastStatus !== -1);
        const pick = working[0] ?? saved[0]!;
        const applied = await bridge().applyProxyToSession(profile.id, pick.id);
        if (applied) {
          toast.success(t('proxy.apply.live'), pick.name);
        } else {
          toast.warn(t('proxy.apply.reopen'), pick.name);
        }
        await refresh();
      });
    },
    [run, refresh, t, toast],
  );

  /* ---------------------------------------------------------------- bulk */

  const toggleSelection = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedProfiles = profiles.filter((profile) => selected.has(profile.id));

  const bulk = async (kind: 'open' | 'stop' | 'duplicate' | 'delete') => {
    const ids = [...selected];
    if (ids.length === 0) return;

    if (kind === 'delete') {
      const ok = await confirm.ask({
        title: t('sel.delete'),
        body: `${ids.length} ${ids.length === 1 ? 'profile' : 'profiles'}`,
        confirmLabel: t('btn.delete'),
        danger: true,
      });
      if (!ok) return;
    }

    await run(kind, async () => {
      const runners: Record<typeof kind, (list: string[]) => Promise<number>> = {
        open: (list) => bridge().bulkOpen(list),
        stop: (list) => bridge().bulkStop(list),
        duplicate: (list) => bridge().bulkDuplicate(list),
        delete: (list) => bridge().bulkDelete(list),
      };
      const done = await runners[kind](ids);
      await refresh();
      if (kind === 'delete' || kind === 'duplicate') setSelected(new Set());
      toast.success(t('generic.done'), `${done}/${ids.length}`);
    });
  };

  /** Rename in place: a profile's name is the one field people change most. */
  const rename = async (profile: ProfileSummary) => {
    const name = await confirm.askText({
      title: t('card.rename'),
      label: t('ed.name'),
      value: profile.name,
      confirmLabel: t('btn.save'),
    });
    if (!name || name === profile.name) return;
    try {
      await bridge().renameProfile(profile.id, name);
      await refresh();
      toast.success(t('card.rename'), name);
    } catch (error) {
      toast.error(t('err.save'), messageOf(error));
    }
  };

  /* ---------------------------------------------------------------- menu */

  const menuFor = (profile: ProfileSummary): MenuAction[] => {
    const running = profile.running || runningById.has(profile.id);
    return [
      running
        ? { label: t('card.focus'), icon: 'play', onClick: () => void open(profile) }
        : { label: t('card.open'), icon: 'play', onClick: () => void open(profile) },
      { label: t('card.rename'), icon: 'name', onClick: () => void rename(profile) },
      { label: t('card.edit'), icon: 'edit', onClick: () => void edit(profile) },
      { separator: true, label: '', onClick: () => undefined },
      { label: t('card.report'), icon: 'fingerprint', onClick: () => setLeakFor(profile) },
      { label: t('card.history'), icon: 'history', onClick: () => setLeakFor(null) ?? window.dispatchEvent(new CustomEvent('joe:open-history', { detail: profile.id })) },
      { label: t('card.proxy'), icon: 'proxy', onClick: () => void applyProxy(profile) },
      { separator: true, label: '', onClick: () => undefined },
      { label: t('card.duplicate'), icon: 'copy', onClick: () => void duplicate(profile) },
      { label: t('ed.fp.new'), icon: 'refresh', onClick: () => void reroll(profile) },
      { label: t('card.folder'), icon: 'folder', onClick: () => void run(profile.id, () => bridge().openProfileDir(profile.id)) },
      { label: t('card.cookiesout'), icon: 'upload', onClick: () => void cookies(profile, 'out') },
      { label: t('card.cookiesin'), icon: 'download', onClick: () => void cookies(profile, 'in') },
      { separator: true, label: '', onClick: () => undefined },
      { label: t('card.clear'), icon: 'archive', onClick: () => void clearData(profile, 'cache') },
      running ? { label: t('card.close'), icon: 'stop', onClick: () => void stop(profile), danger: true } : null,
      { label: t('card.delete'), icon: 'trash', onClick: () => void remove(profile), danger: true },
    ].filter(Boolean) as MenuAction[];
  };

  /* ---------------------------------------------------------------- render */

  const header = (
    <header className="header">
      <div className="header-titles">
        <h1>{t('header.profiles')}</h1>
        <div className="sub">
          {profiles.length === 0
            ? t('empty.sub')
            : `${t('count.profiles').replace('{n}', String(profiles.length))}${
                filters.query || filters.quick !== 'all'
                  ? ` · ${t('count.matching').replace('{n}', String(visible.length))}`
                  : ''
              }`}
        </div>
      </div>

      <div className="header-actions">
        <div ref={searchRef}>
          <SearchInput
            value={filters.query}
            onChange={(query) => setFilters((current) => ({ ...current, query }))}
            placeholder={t('search.profiles')}
          />
        </div>

        <Menu
          actions={SORT_MODES.map((mode) => ({
            label: t(`sort.${mode.id}`, mode.label),
            icon: settings.sortBy === mode.id ? 'check' : 'sort',
            onClick: () => void saveSettings({ sortBy: mode.id }),
          }))}
          trigger={(openMenu) => (
            <Button variant="soft" icon="sort" onClick={openMenu} title={t('sort.label')}>
              {t(`sort.${settings.sortBy}`, settings.sortBy)}
            </Button>
          )}
        />

        <Menu
          actions={[
            {
              label: t('view.cards'),
              icon: density === 'comfortable' ? 'check' : 'grid',
              onClick: () => void saveSettings({ density: 'comfortable' }),
            },
            {
              label: t('view.rows'),
              icon: density === 'compact' ? 'check' : 'list',
              onClick: () => void saveSettings({ density: 'compact' }),
            },
          ]}
          trigger={(openMenu) => (
            <IconButton
              icon={density === 'compact' ? 'list' : 'grid'}
              label={t('view.cards')}
              onClick={openMenu}
            />
          )}
        />

        <Button variant="soft" icon="layers" onClick={openBatch} title={t('btn.batch')}>
          {t('btn.batch')}
        </Button>

        <Button variant="primary" icon="plus" onClick={openCreate}>
          {t('btn.new')}
        </Button>
      </div>
    </header>
  );

  if (profiles.length === 0) {
    return (
      <>
        {header}
        <div className="content">
          <div className="content-inner">
            <EmptyState
              icon="profiles"
              title={t('empty.title')}
              body={t('empty.sub')}
              action={
                <div className="cluster" style={{ justifyContent: 'center' }}>
                  <Button variant="primary" icon="plus" onClick={openCreate}>
                    {t('empty.action')}
                  </Button>
                  <Button variant="soft" icon="layers" onClick={openBatch}>
                    {t('btn.batch')}
                  </Button>
                  <Button variant="ghost" icon="upload" onClick={() => void run('import', async () => {
                    const count = await bridge().importProfiles(subscription.tier === 'free' ? Math.max(0, FREE_PROFILE_LIMIT - profiles.length) : undefined);
                    await refresh();
                    if (count > 0) toast.success(t('btn.import'), String(count));
                  })}>
                    {t('tools.import')}
                  </Button>
                </div>
              }
            />
          </div>
        </div>
        {creating ? (
          <ProfileEditor
            profile={null}
            onClose={() => setCreating(false)}
            onSaved={async () => {
              setCreating(false);
              await refresh();
            }}
            settings={settings}
            existing={profiles}
            toast={pageToast}
          />
        ) : null}
        {batching ? (
          <BatchCreateModal
            settings={settings}
            onClose={() => setBatching(false)}
            onCreated={async () => {
              setBatching(false);
              await refresh();
            }}
          />
        ) : null}
        {activateOpen ? (
          <ActivateDialog
            open={activateOpen}
            reason="Your free plan includes one profile. Activate a license - or keep your trial - to create as many profiles as you need."
            onClose={() => setActivateOpen(false)}
            onActivated={() => void subscription.refresh()}
          />
        ) : null}
        {confirm.dialog}
      </>
    );
  }

  return (
    <>
      {header}

      <div className="content">
        <div className="content-inner">
          <div className="spread" style={{ marginBottom: 14 }}>
            <Segmented
              value={filters.quick}
              onChange={(quick) => setFilters((current) => ({ ...current, quick }))}
              options={[
                { id: 'all', label: t('filter.all') },
                { id: 'running', label: t('filter.running') },
                { id: 'proxy', label: t('filter.proxy') },
                { id: 'direct', label: t('filter.direct') },
              ]}
            />
            {profiles.some((profile) => profile.linked) ? (
              <Banner tone="warn" icon="link">
                {t('card.linked')}.{' '}
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ display: 'inline-flex', height: 20, padding: '0 4px' }}
                  onClick={() => {
                    const first = profiles.find((profile) => profile.linked);
                    if (first) setLeakFor(first);
                  }}
                  type="button"
                >
                  {t('btn.audit')}
                </button>
              </Banner>
            ) : null}
          </div>

          {selected.size > 0 ? (
            <div className="bulk">
              <span className="count">{t('sel.count').replace('{n}', String(selected.size))}</span>
              <Button size="sm" icon="play" onClick={() => void bulk('open')}>
                {t('sel.open')}
              </Button>
              <Button size="sm" icon="stop" onClick={() => void bulk('stop')}>
                {t('sel.stop')}
              </Button>
              <Button size="sm" icon="copy" onClick={() => void bulk('duplicate')}>
                {t('sel.duplicate')}
              </Button>
              <Button size="sm" variant="danger" icon="trash" onClick={() => void bulk('delete')}>
                {t('sel.delete')}
              </Button>
              <div className="spacer" />
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                {t('sel.clear')}
              </Button>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              icon="search"
              title={t('empty.nomatch')}
              body={t('empty.nomatch.sub')}
              action={
                <Button variant="soft" onClick={() => setFilters(EMPTY_FILTERS)}>
                  {t('btn.clear')}
                </Button>
              }
            />
          ) : groups.length > 0 ? (
            groups.map(([group, list]) => (
              <section key={group || 'ungrouped'}>
                <div className="group-head">
                  <Icon name="folder" size={13} />
                  {group || t('card.ungrouped')}
                  <span className="count">{list.length}</span>
                </div>
                {density === 'compact' ? (
                  <div className="rows">
                    {list.map((profile) => (
                      <ProfileRow
                        key={profile.id}
                        profile={profile}
                        session={runningById.get(profile.id)}
                        selected={selected.has(profile.id)}
                        onSelect={() => toggleSelection(profile.id)}
                        onOpen={() => void open(profile)}
                        onEdit={() => void edit(profile)}
                        onMenu={() => menuFor(profile)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid">
                    {list.map((profile) => (
                      <ProfileCard
                        key={profile.id}
                        profile={profile}
                        session={runningById.get(profile.id)}
                        selected={selected.has(profile.id)}
                        onSelect={() => toggleSelection(profile.id)}
                        onOpen={() => void open(profile)}
                        onEdit={() => void edit(profile)}
                        onMenu={() => menuFor(profile)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))
          ) : density === 'compact' ? (
            <div className="rows">
              {visible.map((profile) => (
                <ProfileRow
                  key={profile.id}
                  profile={profile}
                  session={runningById.get(profile.id)}
                  selected={selected.has(profile.id)}
                  onSelect={() => toggleSelection(profile.id)}
                  onOpen={() => void open(profile)}
                  onEdit={() => void edit(profile)}
                  onMenu={() => menuFor(profile)}
                />
              ))}
            </div>
          ) : (
            <div className="grid">
              {visible.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  session={runningById.get(profile.id)}
                  selected={selected.has(profile.id)}
                  onSelect={() => toggleSelection(profile.id)}
                  onOpen={() => void open(profile)}
                  onEdit={() => void edit(profile)}
                  onMenu={() => menuFor(profile)}
                />
              ))}
            </div>
          )}

          {visible.length > 0 ? (
            <div className="spread" style={{ marginTop: 18, color: 'var(--text-4)', fontSize: 11.8 }}>
              <span>
                {t('count.matching').replace('{n}', String(visible.length))}
                {visible.length !== profiles.length ? ` / ${profiles.length}` : ''}
              </span>
              <span className="cluster">
                {selectedProfiles.length > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(visible.map((p) => p.id)))}>
                    {t('sel.all')}
                  </Button>
                ) : null}
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => void run('export', async () => {
                    const file = await bridge().exportProfiles();
                    if (file) toast.success(t('btn.export'), file);
                  })}
                  type="button"
                >
                  <Icon name="save" size={13} />
                  {t('btn.export')}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => void run('import', async () => {
                    const count = await bridge().importProfiles(subscription.tier === 'free' ? Math.max(0, FREE_PROFILE_LIMIT - profiles.length) : undefined);
                    await refresh();
                    if (count > 0) toast.success(t('btn.import'), String(count));
                  })}
                  type="button"
                >
                  <Icon name="upload" size={13} />
                  {t('btn.import')}
                </button>
              </span>
            </div>
          ) : null}

          {busy ? (
            <div className="banner" style={{ marginTop: 12, opacity: 0.8 }}>
              <span className="spinner" />
              <div className="grow">{t('generic.loading')}</div>
            </div>
          ) : null}
        </div>
      </div>

      {creating ? (
        <ProfileEditor
          profile={null}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await refresh();
          }}
          settings={settings}
          existing={profiles}
          toast={pageToast}
        />
      ) : null}

      {editing ? (
        <ProfileEditor
          profile={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
          settings={settings}
          existing={profiles}
          toast={pageToast}
        />
      ) : null}

      {leakFor ? <LeakModal profile={leakFor} onClose={() => setLeakFor(null)} /> : null}

      {batching ? (
        <BatchCreateModal
          settings={settings}
          onClose={() => setBatching(false)}
          onCreated={async () => {
            setBatching(false);
            await refresh();
          }}
        />
      ) : null}
      {activateOpen ? (
        <ActivateDialog
          open={activateOpen}
          reason="Your free plan includes one profile. Activate a license - or keep your trial - to create as many profiles as you need."
          onClose={() => setActivateOpen(false)}
          onActivated={() => void subscription.refresh()}
        />
      ) : null}
      {confirm.dialog}
    </>
  );
}
