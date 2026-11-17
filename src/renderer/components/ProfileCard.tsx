import type { ReactNode } from 'react';
import type { ProfileSummary, SessionInfo } from '../../shared/types';
import { Icon } from './Icon';
import { Button, Chip, IconButton, Menu, clock, when, type MenuAction } from './UI';
import { useI18n } from '../i18n';

/**
 * One profile, as a card.
 *
 * The card is the app's most-seen surface, so it carries exactly what the user needs to decide
 * whether to open it: what machine it claims to be, where it connects from, whether it is already
 * running, and whether it overlaps with another profile. Everything else is one click away in the
 * menu, which is the same list the original's kebab menu carried.
 */

const ENGINE_LABEL: Record<string, string> = {
  chrome: 'Chrome',
  chromium: 'Chromium',
  edge: 'Edge',
  brave: 'Brave',
  firefox: 'Firefox',
  custom: 'Custom',
};

export function ProfileCard({
  profile,
  session,
  selected,
  onSelect,
  onOpen,
  onEdit,
  onMenu,
}: {
  profile: ProfileSummary;
  session?: SessionInfo;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onMenu: () => MenuAction[];
}): ReactNode {
  const { t } = useI18n();
  const running = Boolean(session) || profile.running;

  const initials = profile.name
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const statusLabel = profile.status ? t(`card.status.${profile.status}`, profile.status) : '';
  const statusTone = profile.status === 'banned' ? 'err' : profile.status === 'warm' ? 'warn' : profile.status === 'new' ? 'accent' : 'muted';

  const openLabel = running ? t('card.focus') : t('card.open');

  return (
    <article
      className={`card profile${running ? ' running' : ''}${selected ? ' selected' : ''}`}
      data-profile-card={profile.id}
      tabIndex={-1}
      onDoubleClick={onOpen}
      onClick={(event) => {
        // Clicking the card body opens; the controls inside stop their own propagation.
        if ((event.target as HTMLElement).closest('button, input, [role="menu"]')) return;
        onEdit();
      }}
    >
      <div className="profile-top">
        <button
          className="avatar"
          onClick={onOpen}
          title={openLabel}
          type="button"
          style={{ background: profile.colors.tint, borderColor: profile.colors.accent + '44' }}
        >
          <span style={{ color: profile.colors.accent }}>{initials || 'J'}</span>
          {running ? <span className="live" /> : null}
        </button>

        <div className="profile-title">
          <div className="profile-name" title={profile.name}>
            <span className="truncate">{profile.name}</span>
            {profile.freshSession ? (
              <span className="lock" title={t('ed.fresh')}>
                <Icon name="shield" size={12} />
              </span>
            ) : null}
          </div>
          <div className="profile-meta">
            {profile.group ? (
              <>
                <span className="truncate">{profile.group}</span>
                <span className="sep">·</span>
              </>
            ) : null}
            <span className="truncate">
              {running
                ? t('generic.running')
                : profile.lastOpenedAt
                  ? t('card.opened').replace('{when}', when(profile.lastOpenedAt))
                  : t('card.never')}
            </span>
          </div>
        </div>

        <div className="profile-menu" onClick={(event) => event.stopPropagation()}>
          <Menu
            actions={onMenu()}
            trigger={(open) => (
              <button className="icon-btn" onClick={open} title="More" aria-label="More actions" type="button">
                <Icon name="dotVertical" />
              </button>
            )}
          />
        </div>
      </div>

      <div className="profile-chips">
        <Chip tone={statusTone === 'muted' ? undefined : (statusTone as 'accent' | 'ok' | 'warn' | 'err')}>
          {running ? (
            <>
              <Icon name="bolt" size={12} />
              {t('generic.running')}
            </>
          ) : (
            <>
              <Icon name={osIcon(profile.os)} size={12} />
              {shortOs(profile.os)}
            </>
          )}
        </Chip>

        <Chip title={profile.screen}>
          <Icon name="monitor" size={12} />
          {profile.screen}
        </Chip>

        <Chip tone={profile.hasProxy ? 'accent' : 'muted'} title={`${profile.proxyLabel} ${profile.proxyCountry}`}>
          <Icon name="globe" size={12} />
          {profile.hasProxy ? profile.proxyCountry || profile.proxyLabel : t('generic.direct')}
        </Chip>

        {profile.linked ? (
          <Chip tone="warn" title={t('card.linked')}>
            <Icon name="link" size={12} />
            {t('card.linked.short', 'Linked')}
          </Chip>
        ) : null}

        {statusLabel ? <Chip tone={statusTone as 'accent' | 'ok' | 'warn' | 'err'}>{statusLabel}</Chip> : null}
      </div>

      {profile.tags.length > 0 ? (
        <div className="profile-tags">
          {profile.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="chip muted" style={{ height: 19, fontSize: 11 }}>
              #{tag}
            </span>
          ))}
          {profile.tags.length > 5 ? (
            <span className="chip muted" style={{ height: 19, fontSize: 11 }}>
              +{profile.tags.length - 5}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="profile-foot">
        <button
          className="check"
          data-on={selected}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          title={t('card.select')}
          aria-label={t('card.select')}
          aria-pressed={selected}
          type="button"
        >
          <Icon name="check" strokeWidth={3} />
        </button>

        <span className="chip muted" title={t('card.signature')}>
          {profile.signature}
        </span>

        <span className="faint num" style={{ fontSize: 11.5 }} title={`${profile.browserVersion} · ${ENGINE_LABEL[profile.engine] ?? profile.engine}`}>
          {ENGINE_LABEL[profile.engine] ?? profile.engine} {profile.browserVersion.split('.')[0]}
        </span>

        <div className="spacer" />

        {running ? (
          <Button size="sm" variant="ok" icon="bolt" onClick={onOpen} title={t('card.focus')}>
            {clock(session?.startedAt ?? '') || t('generic.running')}
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon="play" onClick={onOpen} title={openLabel}>
            {t('btn.open')}
          </Button>
        )}

        <IconButton icon="edit" label={t('card.edit')} small onClick={onEdit} />
      </div>
    </article>
  );
}

/** A dense row, for the compact density the settings offer. */
export function ProfileRow({
  profile,
  session,
  selected,
  onSelect,
  onOpen,
  onEdit,
  onMenu,
}: {
  profile: ProfileSummary;
  session?: SessionInfo;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onMenu: () => MenuAction[];
}): ReactNode {
  const { t } = useI18n();
  const running = Boolean(session) || profile.running;

  return (
    <div className={`row${selected ? ' selected' : ''}`} style={selected ? { background: 'var(--accent-soft)' } : undefined}>
      <button className="check" data-on={selected} onClick={onSelect} aria-pressed={selected} title={t('card.select')} type="button">
        <Icon name="check" strokeWidth={3} />
      </button>

      <div className="row-icon" style={{ background: profile.colors.tint, color: profile.colors.accent }}>
        <Icon name={osIcon(profile.os)} />
      </div>

      <div className="row-main" onClick={onEdit} style={{ cursor: 'pointer' }}>
        <div className="row-title">
          <span className="truncate">{profile.name}</span>
          {running ? <Chip tone="ok">{t('generic.running')}</Chip> : null}
          {profile.linked ? <Chip tone="warn" icon="link">{t('card.linked.short', 'Linked')}</Chip> : null}
        </div>
        <div className="row-sub">
          {shortOs(profile.os)} · {profile.screen} · {profile.timezone} ·{' '}
          {profile.hasProxy ? profile.proxyCountry || profile.proxyLabel : t('generic.direct')} ·{' '}
          {profile.lastOpenedAt ? t('card.opened').replace('{when}', when(profile.lastOpenedAt)) : t('card.never')}
        </div>
      </div>

      <div className="chip muted" title={t('card.signature')}>
        {profile.signature}
      </div>

      <div className="row-actions">
        <Button size="sm" variant={running ? 'ok' : 'primary'} icon={running ? 'bolt' : 'play'} onClick={onOpen}>
          {running ? t('card.focus') : t('btn.open')}
        </Button>
        <Menu
          actions={onMenu()}
          trigger={(open) => <IconButton icon="dotVertical" label="More" small onClick={open} />}
        />
      </div>
    </div>
  );
}

export function shortOs(target: string): string {
  switch (target) {
    case 'Windows 11':
      return 'Windows 11';
    case 'Windows 10':
      return 'Windows 10';
    case 'macOS':
      return 'macOS';
    case 'Linux':
      return 'Linux';
    case 'Android':
      return 'Android';
    case 'iPhone':
      return 'iPhone';
    case 'iPad':
      return 'iPad';
    default:
      return 'System';
  }
}

export function osIcon(target: string): 'monitor' | 'phone' {
  return target === 'Android' || target === 'iPhone' || target === 'iPad' ? 'phone' : 'monitor';
}
