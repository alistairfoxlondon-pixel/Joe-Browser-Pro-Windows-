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
      <rect x="2" y="2" width="60" height="60" rx="15" fill="#2f6bde" />
      <path d="M19 20.5h26" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M38 20.5V40.6a9.5 9.5 0 0 1-19 0"
        fill="none"
        stroke="#ffffff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ height = 34, className }: { height?: number; className?: string }): ReactNode {
  const width = Math.round((520 / 96) * height);
  return (
    <svg viewBox="0 0 520 96" height={height} width={width} className={className} role="img" aria-label="Joe Browser">
      <rect x="4" y="4" width="88" height="88" rx="22" fill="#2f6bde" />
      <path d="M31 32h34" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
      <path d="M56 32V63a13.5 13.5 0 0 1-27 0" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <text x="112" y="45" fontFamily="'Fira Sans','Segoe UI',system-ui,sans-serif" fontSize="30" fontWeight={700} fill="var(--text, #eef1f6)">
        Joe Browser
      </text>
      <text x="112" y="73" fontFamily="'Fira Sans','Segoe UI',system-ui,sans-serif" fontSize="12.5" fontWeight={600} letterSpacing="0.18em" fill="var(--accent, #2f6bde)">
        ANTI-DETECT BROWSER
      </text>
    </svg>
  );
}
