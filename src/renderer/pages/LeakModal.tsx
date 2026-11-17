import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { LeakReport, ProfileSummary } from '../../shared/types';
import { CHECK_SITES } from '../../shared/types';
import { bridge } from '../bridge';
import { useI18n } from '../i18n';
import { Icon } from '../components/Icon';
import { Banner, Button, Chip, Meter, Modal, Segmented, useToast } from '../components/UI';
import { messageOf } from '../util';

/**
 * The fingerprint report.
 *
 * Two readings, because they answer different questions. The declared audit compares the stored
 * identity with itself - it catches a profile whose clock says Berlin while its proxy says London,
 * and it works with the browser closed. The live audit reads the running page over the debugging
 * protocol and compares what the browser actually answers to what the profile claims; that is the
 * one that catches a browser quietly overriding an injected value.
 *
 * The surface table is the point of the screen: one row per surface, what the profile says, what
 * was seen, and whether they agree.
 */

export function LeakModal({
  profile,
  onClose,
}: {
  profile: ProfileSummary;
  onClose: () => void;
}): ReactNode {
  const { t } = useI18n();
  const toast = useToast();

  const [mode, setMode] = useState<'declared' | 'live'>('declared');
  const [report, setReport] = useState<LeakReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (which: 'declared' | 'live') => {
      setLoading(true);
      setError('');
      try {
        const next = which === 'live' ? await bridge().runLiveAudit(profile.id) : await bridge().runLeakCheck(profile.id);
        setReport(next);
      } catch (failure) {
        setReport(null);
        setError(messageOf(failure));
      } finally {
        setLoading(false);
      }
    },
    [profile.id],
  );

  useEffect(() => {
    void load(mode);
  }, [load, mode]);

  const openChecker = async (url: string) => {
    try {
      await bridge().openInProfile(profile.id, url);
      toast.success(t('fp.open'), url);
    } catch (failure) {
      toast.warn(t('err.notRunning'), messageOf(failure));
    }
  };

  const score = report?.score ?? 0;
  const tone = score >= 95 ? 'ok' : score >= 75 ? 'warn' : 'err';
  const failing = report?.surfaces.filter((surface) => !surface.ok).length ?? 0;

  return (
    <Modal
      title={t('fp.title')}
      subtitle={`${profile.name} · ${profile.signature}`}
      onClose={onClose}
      width="wide"
      footer={
        <>
          <Chip tone={tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'err'} icon={tone === 'ok' ? 'shield' : 'warning'}>
            {report ? t('fp.pass').replace('{n}', String(report.surfaces.length - failing)).replace('{m}', String(report.surfaces.length)) : t('generic.loading')}
          </Chip>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('btn.close')}
          </Button>
          <Button variant="soft" icon="refresh" onClick={() => void load(mode)} busy={loading}>
            {t('btn.check')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="spread">
          <Segmented
            value={mode}
            onChange={(next) => setMode(next)}
            options={[
              { id: 'declared', label: t('fp.declared') },
              { id: 'live', label: t('fp.live') },
            ]}
          />
          <span className="faint" style={{ fontSize: 11.8 }}>
            {mode === 'live' ? t('fp.live.hint') : t('fp.declared.hint')}
          </span>
        </div>

        <div className="spread" style={{ gap: 18 }}>
          <div style={{ flex: '0 0 130px' }}>
            <div style={{ fontSize: 30, fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.1 }} className="num">
              {report ? `${score}%` : '—'}
            </div>
            <div className="faint" style={{ fontSize: 11.5, marginBottom: 6 }}>
              {t('fp.score')}
            </div>
            <Meter value={score} tone={tone} />
          </div>

          <div className="grow">
            {error ? (
              <Banner tone="err" icon="warning">
                <b>{t('err.notRunning')}</b>
                <div style={{ marginTop: 3 }}>{error}</div>
              </Banner>
            ) : failing > 0 ? (
              <Banner tone="warn" icon="warning">
                <b>
                  {failing} {failing === 1 ? 'surface does not' : 'surfaces do not'} match the claim.
                </b>
                <div style={{ marginTop: 3 }}>
                  A site comparing any one of them with the others can tell this profile is not what it says it is.
                </div>
              </Banner>
            ) : report ? (
              <Banner tone="ok" icon="shield">
                <b>Every claim matches what was read.</b>
                <div style={{ marginTop: 3 }}>
                  {mode === 'live'
                    ? 'The running browser answered with the values below.'
                    : 'The stored identity is internally consistent. Open the profile and run the live audit to compare it with the running page.'}
                </div>
              </Banner>
            ) : (
              <div className="skeleton" style={{ height: 52, borderRadius: 8, background: 'var(--panel-2)' }} />
            )}
          </div>
        </div>

        <div className="rows">
          <div className="row" style={{ background: 'var(--panel-2)', fontSize: 11, fontWeight: 650, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
            <span style={{ width: 22 }} />
            <span style={{ flex: '0 0 150px' }}>{t('fp.surface')}</span>
            <span className="grow">{t('fp.claim')}</span>
            <span className="grow">{t('fp.observed')}</span>
          </div>

          {(report?.surfaces ?? []).map((surface) => (
            <div className="row" key={surface.name}>
              <span
                style={{
                  width: 22,
                  flex: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  color: surface.ok ? 'var(--ok)' : 'var(--err)',
                }}
              >
                <Icon name={surface.ok ? 'check' : 'warning'} size={14} strokeWidth={2.6} />
              </span>

              <span style={{ flex: '0 0 150px', fontWeight: 570, fontSize: 12.8 }}>{surface.name}</span>

              <span className="grow truncate mono" style={{ fontSize: 11.8, color: 'var(--text-2)' }} title={surface.claim}>
                {surface.claim || '—'}
              </span>

              <span className="grow truncate mono" style={{ fontSize: 11.8, color: surface.ok ? 'var(--text-2)' : 'var(--err)' }} title={surface.observed}>
                {surface.observed || '—'}
              </span>
            </div>
          ))}

          {loading && !report ? (
            <div className="row">
              <span className="spinner" style={{ color: 'var(--accent)' }} />
              <span className="muted">{mode === 'live' ? t('fp.live.hint') : t('generic.loading')}</span>
            </div>
          ) : null}
        </div>

        {report?.surfaces.some((surface) => surface.note) ? (
          <div className="stack tight">
            {report.surfaces
              .filter((surface) => surface.note)
              .map((surface) => (
                <div key={surface.name} className="hint">
                  <b style={{ color: 'var(--text-2)' }}>{surface.name}:</b> {surface.note}
                </div>
              ))}
          </div>
        ) : null}

        <div className="section-label">{t('fp.checkers')}</div>
        <div className="cluster">
          {CHECK_SITES.map((site) => (
            <Button key={site.name} size="sm" variant="soft" icon="external" onClick={() => void openChecker(site.url)}>
              {site.name}
            </Button>
          ))}
        </div>
        <div className="hint">{t('fp.open.hint')}</div>
      </div>
    </Modal>
  );
}
