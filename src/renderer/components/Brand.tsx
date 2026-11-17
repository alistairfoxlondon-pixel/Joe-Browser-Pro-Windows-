import type { ReactNode } from 'react';

/** Shared mark used by the window, installer, tray and renderer. */
function Mark(): ReactNode {
  return <>
    <rect x="2" y="2" width="60" height="60" rx="9" fill="#2f6bde" />
    <path d="M17 29v-7a5 5 0 0 1 5-5h20a5 5 0 0 1 5 5v7" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M38 27v12a10 10 0 0 1-20 0" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />
    <circle cx="38" cy="20" r="2.1" fill="#fff" />
  </>;
}

export function Logo({ size = 40, className }: { size?: number; className?: string }): ReactNode {
  return <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Joe Browser"><Mark /></svg>;
}

export function Wordmark({ height = 34, className }: { height?: number; className?: string }): ReactNode {
  return <svg viewBox="0 0 360 96" height={height} width={Math.round(3.75 * height)} className={className} role="img" aria-label="Joe Browser">
    <g transform="translate(4 4) scale(1.375)"><Mark /></g>
    <text x="112" y="59" fontFamily="'Inter',sans-serif" fontSize="32" fontWeight={700} fill="var(--text, #eef1f6)">Joe Browser</text>
  </svg>;
}
