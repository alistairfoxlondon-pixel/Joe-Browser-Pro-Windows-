import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * The shared controls.
 *
 * Small, unopinionated primitives. The point of collecting them here is that the app has one
 * modal, one toggle and one field, not eleven slightly different ones - which is exactly how
 * the old build ended up with six different row heights.
 */

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width,
}: {
  title: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
      >
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange(value: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="toggle" style={disabled ? { opacity: 0.55 } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="track" aria-hidden="true" />
      <span style={{ fontSize: 13 }}>{label}</span>
    </label>
  );
}

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="big" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Working" />;
}

export interface ToastItem {
  id: number;
  kind: 'info' | 'success' | 'warn' | 'error';
  title: string;
  detail?: string;
}

export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss(id: number): void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.kind}`} onClick={() => onDismiss(item.id)}>
          <div className="toast-title">{item.title}</div>
          {item.detail ? <div className="toast-detail">{item.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function bytes(value: number): string {
  if (!value) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1048576).toFixed(1)} MB`;
  return `${(value / 1073741824).toFixed(2)} GB`;
}

export function ago(iso: string): string {
  if (!iso) return 'never opened';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'never opened';
  const seconds = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}
