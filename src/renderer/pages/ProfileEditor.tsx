import { useEffect, useState } from 'react';
import type {
  DesktopOs,
  Profile,
  ProfileSummary,
  ProxyCheckResult,
  ProxyType,
} from '../../shared/types';
import { bridge } from '../bridge';
import { Field, Modal, Spinner, Toggle } from '../components/UI';
import { messageOf } from '../util';

type Tab = 'general' | 'identity' | 'proxy' | 'tools';

interface Props {
  profile: ProfileSummary | null;
  onClose(): void;
  onSaved(name: string): void | Promise<void>;
  toast(kind: 'info' | 'success' | 'warn' | 'error', title: string, detail?: string): void;
}

const SCREENS: [number, number][] = [
  [1920, 1080],
  [2560, 1440],
  [1366, 768],
  [1536, 864],
  [1440, 900],
  [3840, 2160],
  [1680, 1050],
  [1280, 720],
];

export function ProfileEditor({ profile, onClose, onSaved, toast }: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [draft, setDraft] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(profile));
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState('');
  const [newName, setNewName] = useState('');
  const [newEngine, setNewEngine] = useState('chrome');
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<ProxyCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!profile) {
        // A brand-new profile: the store fills the identity in, so this is only the shell of
        // one. Asking the app for a preview of the identity keeps the form honest.
        setLoading(false);
        return;
      }
      try {
        const full = await bridge().getProfile(profile.id);
        if (!cancelled && full) setDraft(full);
      } catch (error) {
        toast('error', 'Could not open that profile', messageOf(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [profile, toast]);

  if (profile && loading) {
    return (
      <Modal title="Loading profile" onClose={onClose}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)' }}>
          <Spinner /> Reading the stored identity…
        </div>
      </Modal>
    );
  }

  const fp = draft?.fingerprint;
  const proxy = draft?.proxy;
  const tools = draft?.tools;

  function patch(next: Partial<Profile>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  function patchFingerprint(next: Partial<NonNullable<typeof fp>>) {
    setDraft((current) =>
      current ? { ...current, fingerprint: { ...current.fingerprint, ...next } } : current,
    );
  }

  function patchProxy(next: Partial<NonNullable<typeof proxy>>) {
    setDraft((current) => (current ? { ...current, proxy: { ...current.proxy, ...next } } : current));
  }

  function patchTools(next: Partial<NonNullable<typeof tools>>) {
    setDraft((current) => (current ? { ...current, tools: { ...current.tools, ...next } } : current));
  }

  async function save() {
    if (!profile && !newName.trim()) {
      toast('warn', 'Give the profile a name', 'The name is how you will find it in the list.');
      setTab('general');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<Profile> = draft
        ? {
            name: draft.name,
            group: draft.group,
            tags: draft.tags,
            startUrl: draft.startUrl,
            engine: draft.engine,
            kernelId: draft.kernelId,
            fingerprint: draft.fingerprint,
            proxy: { ...draft.proxy, password: secret || undefined },
            tools: draft.tools,
          }
        : {
            name: newName.trim(),
            engine: newEngine,
          };

      if (profile) {
        await bridge().updateProfile(profile.id, payload);
      } else {
        await bridge().createProfile(payload);
      }

      await onSaved((payload.name as string) || 'Profile');
    } catch (error) {
      toast('error', 'Could not save the profile', messageOf(error));
    } finally {
      setSaving(false);
    }
  }

  async function testProxy() {
    if (!proxy) return;
    setChecking(true);
    setCheck(null);
    try {
      const result = await bridge().checkProxy(proxy, secret || undefined);
      setCheck(result);
      if (result.ok) {
        patchProxy({
          lastIp: result.ip,
          lastCountry: result.country,
          lastCountryCode: result.countryCode,
          lastCity: result.city,
          lastTimezone: result.timezone,
        });
        // The whole point of matching: clock and locale follow the exit country.
        if (draft?.fingerprint.autoMatchProxy && result.countryCode) {
          patchFingerprint({ timezone: result.timezone || draft.fingerprint.timezone });
        }
      }
    } catch (error) {
      setCheck({
        ok: false,
        ip: '',
        country: '',
        countryCode: '',
        city: '',
        timezone: '',
        latencyMs: 0,
        error: messageOf(error),
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Modal
      title={profile ? `Edit ${profile.name}` : 'New profile'}
      subtitle={
        profile
          ? 'Changes are saved to this profile only; other profiles keep their own identity.'
          : 'Four things are asked for up front. Everything else has a sensible default you can change later.'
      }
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : null}
            {profile ? 'Save changes' : 'Create profile'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
        {(
          [
            ['general', 'General'],
            ['identity', 'Identity'],
            ['proxy', 'Proxy'],
            ['tools', 'Tools'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(id)}
            disabled={!profile && id !== 'general'}
          >
            {label}
          </button>
        ))}
      </div>

      {!profile ? (
        <>
          <Field label="Name" hint="A new identity is generated when the profile is created, unique against every profile you already have.">
            <input
              className="input"
              autoFocus
              value={newName}
              placeholder="e.g. Shop UK"
              onChange={(event) => setNewName(event.target.value)}
            />
          </Field>
          <Field label="Engine" hint="Which browser family this profile runs. A build can be pinned later.">
            <select
              className="select"
              value={newEngine}
              onChange={(event) => setNewEngine(event.target.value)}
            >
              <option value="chrome">Google Chrome</option>
              <option value="chromium">Chromium</option>
              <option value="edge">Microsoft Edge</option>
              <option value="brave">Brave</option>
              <option value="firefox">Firefox</option>
            </select>
          </Field>
        </>
      ) : null}

      {draft && tab === 'general' ? (
        <>
          <Field label="Name" hint="The only thing that identifies this profile in the list.">
            <input
              className="input"
              value={draft.name}
              autoFocus
              onChange={(event) => patch({ name: event.target.value })}
            />
          </Field>
          <div className="row">
            <Field label="Group" hint="Free text. Used for the filter above the list.">
              <input
                className="input"
                value={draft.group}
                placeholder="e.g. E-commerce"
                onChange={(event) => patch({ group: event.target.value })}
              />
            </Field>
            <Field label="Tags" hint="Comma separated.">
              <input
                className="input"
                value={draft.tags.join(', ')}
                placeholder="fb, ads"
                onChange={(event) =>
                  patch({
                    tags: event.target.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                      .slice(0, 12),
                  })
                }
              />
            </Field>
          </div>
          <div className="row">
            <Field label="Engine" hint="Which browser family this profile runs.">
              <select
                className="select"
                value={draft.engine}
                onChange={(event) => patch({ engine: event.target.value })}
              >
                <option value="chrome">Google Chrome</option>
                <option value="chromium">Chromium</option>
                <option value="edge">Microsoft Edge</option>
                <option value="brave">Brave</option>
                <option value="firefox">Firefox</option>
              </select>
            </Field>
            <Field label="Pinned build" hint="Optional. Empty follows the newest build on this PC.">
              <input
                className="input mono"
                value={draft.kernelId}
                placeholder="chrome-157.0.8103.41-stable"
                onChange={(event) => patch({ kernelId: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Start page" hint="Opened when the profile launches.">
            <input
              className="input"
              value={draft.startUrl}
              placeholder="about:blank"
              onChange={(event) => patch({ startUrl: event.target.value })}
            />
          </Field>
        </>
      ) : null}

      {draft && tab === 'identity' && fp ? (
        <>
          <div className="section-label">Machine</div>
          <div className="row">
            <Field label="Operating system" hint="What the profile claims to be.">
              <select
                className="select"
                value={fp.os}
                onChange={(event) => patchFingerprint({ os: event.target.value as DesktopOs })}
              >
                {['Windows 11', 'Windows 10', 'macOS 15', 'macOS 14', 'Linux'].map((os) => (
                  <option key={os} value={os}>
                    {os}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Screen" hint="Width × height, and the height after the taskbar.">
              <select
                className="select"
                value={`${fp.screenW}x${fp.screenH}`}
                onChange={(event) => {
                  const [w, h] = event.target.value.split('x').map(Number);
                  patchFingerprint({ screenW: w!, screenH: h!, availW: w!, availH: (h ?? 0) - 40 });
                }}
              >
                {SCREENS.map(([w, h]) => (
                  <option key={`${w}x${h}`} value={`${w}x${h}`}>
                    {w} × {h}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="row-3">
            <Field label="Time zone" hint="IANA name. Must agree with the proxy’s country.">
              <input
                className="input mono"
                value={fp.timezone}
                onChange={(event) => patchFingerprint({ timezone: event.target.value })}
              />
            </Field>
            <Field label="CPU cores">
              <input
                className="input"
                type="number"
                min={2}
                max={32}
                value={fp.cores}
                onChange={(event) => patchFingerprint({ cores: Number(event.target.value) || 4 })}
              />
            </Field>
            <Field label="Memory (GB)">
              <input
                className="input"
                type="number"
                min={2}
                max={8}
                value={fp.memory}
                onChange={(event) => patchFingerprint({ memory: Number(event.target.value) || 8 })}
              />
            </Field>
          </div>

          <Field label="Graphics card" hint="Read-only: the adapter this PC actually has.">
            <input className="input mono" value={fp.webGlRenderer} readOnly />
          </Field>

          <div className="section-label">Noise</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Toggle
              label="Canvas"
              checked={fp.canvasNoise}
              onChange={(value) => patchFingerprint({ canvasNoise: value })}
            />
            <Toggle
              label="Audio"
              checked={fp.audioNoise}
              onChange={(value) => patchFingerprint({ audioNoise: value })}
            />
            <Toggle
              label="Fonts"
              checked={fp.fontsNoise}
              onChange={(value) => patchFingerprint({ fontsNoise: value })}
            />
            <Toggle
              label="Timing jitter"
              checked={fp.hardwareNoise}
              onChange={(value) => patchFingerprint({ hardwareNoise: value })}
            />
          </div>

          <div className="row">
            <Field label="WebRTC" hint="off removes the interface; proxy keeps host addresses off the wire.">
              <select
                className="select"
                value={fp.webRtcMode}
                onChange={(event) => patchFingerprint({ webRtcMode: event.target.value })}
              >
                <option value="proxy">Proxy only</option>
                <option value="public">Public address only</option>
                <option value="off">Disabled</option>
              </select>
            </Field>
            <Field label="Seed" hint="The identity is a pure function of this number.">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input mono"
                  value={fp.seed}
                  onChange={(event) => patchFingerprint({ seed: Number(event.target.value) || 1 })}
                />
                <button
                  className="btn"
                  onClick={() => patchFingerprint({ seed: Math.floor(Math.random() * 4294967295) })}
                >
                  Re-roll
                </button>
              </div>
            </Field>
          </div>
        </>
      ) : null}

      {draft && tab === 'proxy' && proxy ? (
        <>
          <div className="row">
            <Field label="Type">
              <select
                className="select"
                value={proxy.type}
                onChange={(event) => patchProxy({ type: event.target.value as ProxyType })}
              >
                <option value="none">Direct (no proxy)</option>
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </Field>
            <Field label="Port">
              <input
                className="input"
                type="number"
                value={proxy.port || ''}
                onChange={(event) => patchProxy({ port: Number(event.target.value) || 0 })}
              />
            </Field>
          </div>

          <Field label="Host">
            <input
              className="input mono"
              value={proxy.host}
              placeholder="185.21.4.14"
              onChange={(event) => patchProxy({ host: event.target.value })}
            />
          </Field>

          <div className="row">
            <Field label="Username">
              <input
                className="input"
                value={proxy.user}
                onChange={(event) => patchProxy({ user: event.target.value })}
              />
            </Field>
            <Field label="Password" hint="Sent through the local relay, never on a command line.">
              <input
                className="input"
                type="password"
                value={secret}
                placeholder={proxy.passwordEnc ? '•••••••• (stored)' : 'not set'}
                onChange={(event) => setSecret(event.target.value)}
              />
            </Field>
          </div>

          <Toggle
            label="Keep the session alive on a direct connection if the proxy stops answering"
            checked={proxy.fallbackDirect}
            onChange={(value) => patchProxy({ fallbackDirect: value })}
          />
          <Toggle
            label="Match the clock and language to the proxy’s country"
            checked={fp?.autoMatchProxy ?? true}
            onChange={(value) => patchFingerprint({ autoMatchProxy: value })}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn" onClick={testProxy} disabled={checking || proxy.type === 'none'}>
              {checking ? <Spinner /> : null}
              {checking ? 'Checking' : 'Test proxy'}
            </button>
            {check ? (
              <span className={`chip ${check.ok ? 'ok' : 'warn'}`}>
                {check.ok
                  ? `${check.ip} · ${check.city || check.country} · ${check.latencyMs} ms`
                  : check.error}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {draft && tab === 'tools' && tools ? (
        <>
          <Toggle
            label="Paste as human — Ctrl+V types the clipboard out character by character"
            checked={tools.humanPaste}
            onChange={(value) => patchTools({ humanPaste: value })}
          />
          <Field label="Typing speed">
            <select
              className="select"
              value={tools.humanPasteSpeed}
              onChange={(event) => patchTools({ humanPasteSpeed: event.target.value })}
            >
              <option value="relaxed">Relaxed</option>
              <option value="natural">Natural</option>
              <option value="fast">Fast</option>
              <option value="instant">Instant</option>
            </select>
          </Field>

          <div className="divider" />

          <Toggle
            label="Restore the right-click menu on pages that block it"
            checked={tools.enableRightClick}
            onChange={(value) => patchTools({ enableRightClick: value })}
          />
          <Toggle
            label="Unlock text selection and copy"
            checked={tools.unlockSelection}
            onChange={(value) => patchTools({ unlockSelection: value })}
          />

          <div className="divider" />

          <Toggle
            label="Watch the exit address and warn when it rotates or drops"
            checked={tools.proxyWatch}
            onChange={(value) => patchTools({ proxyWatch: value })}
          />
          <Field label="Check every (seconds)">
            <input
              className="input"
              type="number"
              min={30}
              max={600}
              value={tools.proxyWatchInterval}
              onChange={(event) =>
                patchTools({ proxyWatchInterval: Math.min(600, Math.max(30, Number(event.target.value) || 60)) })
              }
            />
          </Field>

          <Field
            label="Extra unpacked extensions"
            hint="One absolute folder path per line."
          >
            <textarea
              className="input"
              rows={3}
              value={tools.customExtensions}
              onChange={(event) => patchTools({ customExtensions: event.target.value })}
            />
          </Field>
        </>
      ) : null}
    </Modal>
  );
}
