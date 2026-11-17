import type { ReactNode } from 'react';
import type { ProfileSummary, ProfileLocation, SessionInfo } from '../../shared/types';
import { Icon } from './Icon';
import { BrowserLogo } from './BrowserLogo';
import { CountryFlag } from './CountryFlag';
import { countryName } from '../../shared/countries';
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
  location,
  session,
  selected,
  onSelect,
  onOpen,
  onEdit,
  onMenu,
}: {
  profile: ProfileSummary;
  location?: ProfileLocation;
  session?: SessionInfo;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onMenu: () => MenuAction[];
}): ReactNode {
  const { t } = useI18n();
  const running = Boolean(session) || profile.running;

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
        >
          <BrowserLogo engine={session?.engine ?? profile.engine} size={25} />
          {running ? <span className="live" /> : null}
        </button>

        <div className="profile-title">
          <div className="profile-name" title={profile.name}>
            <span className="truncate">{profile.name}</span>

          </div>
          <div className="profile-meta">
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
              <Icon name="play" size={14} />
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

        <LocationChip location={location} direct={!profile.hasProxy} />

        {profile.linked ? (
          <Chip tone="warn" title={t('card.linked')}>
            <Icon name="link" size={12} />
            {t('card.linked.short', 'Linked')}
          </Chip>
        ) : null}

        {statusLabel ? <Chip tone={statusTone as 'accent' | 'ok' | 'warn' | 'err'}>{statusLabel}</Chip> : null}
      </div>

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
          <BrowserLogo engine={session?.engine ?? profile.engine} size={14} /> {ENGINE_LABEL[session?.engine ?? profile.engine] ?? (session?.engine ?? profile.engine)} {profile.browserVersion.split('.')[0]}
        </span>

        <div className="spacer" />

        {running ? (
          <Button size="sm" variant="ok" icon="play" onClick={onOpen} title={t('card.focus')}>
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
  location,
  session,
  selected,
  onSelect,
  onOpen,
  onEdit,
  onMenu,
}: {
  profile: ProfileSummary;
  location?: ProfileLocation;
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

      <div className="row-icon"><BrowserLogo engine={session?.engine ?? profile.engine} size={24} /></div>

      <div className="row-main" onClick={onEdit} style={{ cursor: 'pointer' }}>
        <div className="row-title">
          <span className="truncate">{profile.name}</span>
          {running ? <Chip tone="ok">{t('generic.running')}</Chip> : null}
          {profile.linked ? <Chip tone="warn" icon="link">{t('card.linked.short', 'Linked')}</Chip> : null}
        </div>
        <div className="row-sub">
          {shortOs(profile.os)} · {profile.screen} · {profile.lastOpenedAt ? t('card.opened').replace('{when}', when(profile.lastOpenedAt)) : t('card.never')}
        </div>
      </div>

      <LocationChip location={location} direct={!profile.hasProxy} />
      <div className="chip muted" title={t('card.signature')}>
        {profile.signature}
      </div>

      <div className="row-actions">
        <Button size="sm" variant={running ? 'ok' : 'primary'} icon={running ? 'play' : 'play'} onClick={onOpen}>
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

function LocationChip({ location, direct }: { location?: ProfileLocation; direct: boolean }): ReactNode {
  return <Chip tone="muted" title={`${direct ? 'Direct connection' : 'Proxy connection'} · checked with ip-api.com`}>
    {location?.ok ? <><CountryFlag code={location.countryCode} size={16} />{countryName(location.countryCode, location.country)}</> : <><Icon name="globe" size={14} />{location ? 'Location unavailable' : 'Detecting location…'}</>}
    {direct ? ' · Direct' : null}
  </Chip>;
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
