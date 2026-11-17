import type { ReactNode } from 'react';

/** Shared mark used by the window, installer, tray and renderer. */
function Mark(): ReactNode {
  return <>
    <rect x="2" y="2" width="60" height="60" rx="10" fill="#2f6bde" />
    <path d="M43 15a21 21 0 1 0 6.4 5.3" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M42 19v17.5a10 10 0 0 1-20 0" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
  </>;
}

export function Logo({ size = 40, className }: { size?: number; className?: string }): ReactNode {
  return <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Joe Browser"><Mark /></svg>;
}

export function Wordmark({ height = 34, className }: { height?: number; className?: string }): ReactNode {
  return <svg viewBox="0 0 360 96" height={height} width={Math.round(3.75 * height)} className={className} role="img" aria-label="Joe Browser">
    <g transform="translate(4 4) scale(1.375)"><Mark /></g>
    <text x="112" y="59" fontFamily="'IBM Plex Sans',sans-serif" fontSize="32" fontWeight={700} fill="var(--text, #eef1f6)">Joe Browser</text>
  </svg>;
}
