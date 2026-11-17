import { useState, type ReactNode } from 'react';
import type { AppSettings } from '../../shared/types';
import { bridge } from '../bridge';
import { useI18n } from '../i18n';
import { Banner, Button, Field, Modal, useToast } from '../components/UI';
import { messageOf } from '../util';

/**
 * Batch create.
 *
 * The original offered 5, 10, 25, 50 and 100 with a cap of 200, one proxy per line, and a group
 * for the lot. The count is still a picker because "how many do I need" is a judgement, not a
 * measurement - but a typed number is allowed too, since nobody wants to press a chip five times.
 *
 * Every profile gets its own rolled identity and the kernel choice is spread across the ones that
 * are installed, so a batch of a hundred does not look like a hundred copies of one machine.
 */

const COUNTS = [5, 10, 25, 50, 100];

export function BatchCreateModal({
  onClose,
  onCreated,
}: {
  settings: AppSettings;
  onClose: () => void;
  onCreated: () => void;
}): ReactNode {
  const { t } = useI18n();
  const toast = useToast();

  const [prefix, setPrefix] = useState('Profile');
  const [count, setCount] = useState(10);
  const [proxies, setProxies] = useState('');
  const [busy, setBusy] = useState(false);

  const proxyLines = proxies.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const create = async () => {
    if (count > 200) {
      toast.warn(t('tools.batch.tooMany'));
      return;
    }
    setBusy(true);
    try {
      const result = await bridge().batchCreate({ prefix, count, group: '', proxies });
      if (result.made > 0) {
        toast.success(t('tools.batch.created').replace('{n}', String(result.made)));
      }
      if (result.shared > 0) {
        toast.warn(t('tools.batch.shared').replace('{n}', String(result.shared)));
      }
      if (result.failed > 0) {
        toast.error(t('tools.batch.failed').replace('{n}', String(result.failed)));
      }
      onCreated();
    } catch (error) {
      toast.error(t('err.batch'), messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('tools.batch.title')}
      onClose={onClose}
      footer={
        <>
          <span className="faint" style={{ fontSize: 11.8 }}>
            {count} profiles{proxyLines.length > 0 ? ` · ${proxyLines.length} proxies` : ''}
          </span>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('btn.cancel')}
          </Button>
          <Button variant="primary" icon="layers" onClick={create} busy={busy} disabled={count < 1}>
            {t('btn.batch')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <Field label={t('tools.batch.prefix')}>
            <input className="input" value={prefix} onChange={(event) => setPrefix(event.target.value)} spellCheck={false} />
          </Field>

          <Field label={t('tools.batch.count')} span="all">
            <div className="cluster">
              {COUNTS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={count === option ? 'primary' : 'soft'}
                  onClick={() => setCount(option)}
                >
                  {option}
                </Button>
              ))}
              <input
                className="input num"
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(event) => setCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
                style={{ width: 110 }}
              />
            </div>
          </Field>

          <Field label={t('tools.batch.proxies')} hint={t('tools.batch.proxies.hint')} span="all">
            <textarea
              className="textarea mono"
              rows={5}
              value={proxies}
              onChange={(event) => setProxies(event.target.value)}
              placeholder={'gate.example.com:8080:user:pass\n1.2.3.4:1080'}
              spellCheck={false}
            />
          </Field>
        </div>

        {proxyLines.length > 0 && proxyLines.length < count ? (
          <Banner tone="info" icon="proxy">
            {proxyLines.length} proxies for {count} profiles. The list is used round robin, so{' '}
            {count - proxyLines.length} profiles share a connection with another.
          </Banner>
        ) : null}

        {count > 200 ? (
          <Banner tone="err" icon="info">
            {t('tools.batch.tooMany')}
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}
