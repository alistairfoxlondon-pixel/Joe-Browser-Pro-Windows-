import type { ReactNode } from 'react';

/**
 * The Joe Browser mark.
 *
 * One flat cobalt tile, one white monogram - the same geometry as the installer icon, the
 * tray icon and the EXE. Drawn inline so it stays sharp at any size, on any surface, without a
 * network fetch or a fallback flash.
 */

export function Logo({ size = 40, className }: { size?: number; className?: string }): ReactNode {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Joe Browser"
    >
      <rect x="2" y="2" width="60" height="60" rx="11" fill="#2f6bde" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M29 21h12M37 21v16a8 8 0 0 1-16 0" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ height = 34, className }: { height?: number; className?: string }): ReactNode {
  const width = Math.round((520 / 96) * height);
  return (
    <svg viewBox="0 0 520 96" height={height} width={width} className={className} role="img" aria-label="Joe Browser">
      <g transform="translate(4 4) scale(1.375)">
        <rect x="2" y="2" width="60" height="60" rx="11" fill="#2f6bde" />
        <circle cx="32" cy="32" r="21" fill="none" stroke="#fff" strokeWidth="3" />
        <path d="M29 21h12M37 21v16a8 8 0 0 1-16 0" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="112" y="45" fontFamily="'Inter',sans-serif" fontSize="30" fontWeight={700} fill="var(--text, #eef1f6)">
        Joe Browser
      </text>
      <text x="112" y="73" fontFamily="'Inter',sans-serif" fontSize="12.5" fontWeight={600} letterSpacing="0.18em" fill="var(--accent, #2f6bde)">
        ANTI-DETECT BROWSER
      </text>
    </svg>
  );
}
