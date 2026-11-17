import { useId, type ReactNode } from 'react';

/**
 * Circular country flags.
 *
 * Each flag is drawn inline as a simplified rendition and clipped to a circle - the shape used
 * across the language picker and the identity fields. Drawn inline rather than fetched so the
 * picker never shows a broken image, an empty tile, or a rectangular flag inside a circle.
 */

function starPoints(cx: number, cy: number, r: number, rotation = -Math.PI / 2): string {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? r : r * 0.424;
    const angle = rotation + (index * Math.PI) / 5;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(' ');
}

const FLAGS: Record<string, ReactNode> = {
  US: (
    <>
      <rect width="32" height="32" fill="#ffffff" />
      {[0, 2, 4, 6, 8, 10, 12].map((index) => (
        <rect key={index} y={(index * 32) / 13} width="32" height={32 / 13} fill="#B22234" />
      ))}
      <rect width="14.5" height={(7 * 32) / 13} fill="#3C3B6E" />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4].map((col) => (
          <circle key={`${row}-${col}`} cx={1.7 + col * 2.8} cy={2.4 + row * 3.9} r="0.55" fill="#ffffff" />
        )),
      )}
    </>
  ),
  GB: (
    <>
      <rect width="32" height="32" fill="#012169" />
      <path d="M0 0L32 32M32 0L0 32" stroke="#ffffff" strokeWidth="6.6" />
      <path d="M0 0L32 32M32 0L0 32" stroke="#C8102E" strokeWidth="2.2" />
      <path d="M16 0V32M0 16H32" stroke="#ffffff" strokeWidth="10.6" />
      <path d="M16 0V32M0 16H32" stroke="#C8102E" strokeWidth="6.3" />
    </>
  ),
  DE: (
    <>
      <rect width="32" height="10.67" fill="#000000" />
      <rect y="10.67" width="32" height="10.67" fill="#DD0000" />
      <rect y="21.33" width="32" height="10.67" fill="#FFCE00" />
    </>
  ),
  RU: (
    <>
      <rect width="32" height="10.67" fill="#ffffff" />
      <rect y="10.67" width="32" height="10.67" fill="#0039A6" />
      <rect y="21.33" width="32" height="10.67" fill="#D52B1E" />
    </>
  ),
  ES: (
    <>
      <rect width="32" height="32" fill="#AA151B" />
      <rect y="8" width="32" height="16" fill="#F1BF00" />
    </>
  ),
  FR: (
    <>
      <rect width="10.67" height="32" fill="#0055A4" />
      <rect x="10.67" width="10.67" height="32" fill="#ffffff" />
      <rect x="21.33" width="10.67" height="32" fill="#EF4135" />
    </>
  ),
  BR: (
    <>
      <rect width="32" height="32" fill="#009C3B" />
      <path d="M16 4.5 29.5 16 16 27.5 2.5 16Z" fill="#FFDF00" />
      <circle cx="16" cy="16" r="5.6" fill="#002776" />
      <path d="M10.6 14.2c5.5 1.6 10.3 0.4 12.4-3.6" stroke="#ffffff" strokeWidth="1.15" fill="none" />
    </>
  ),
  IT: (
    <>
      <rect width="10.67" height="32" fill="#009246" />
      <rect x="10.67" width="10.67" height="32" fill="#ffffff" />
      <rect x="21.33" width="10.67" height="32" fill="#CE2B37" />
    </>
  ),
  NL: (
    <>
      <rect width="32" height="10.67" fill="#AE1C28" />
      <rect y="10.67" width="32" height="10.67" fill="#ffffff" />
      <rect y="21.33" width="32" height="10.67" fill="#21468B" />
    </>
  ),
  PL: (
    <>
      <rect width="32" height="16" fill="#ffffff" />
      <rect y="16" width="32" height="16" fill="#DC143C" />
    </>
  ),
  TR: (
    <>
      <rect width="32" height="32" fill="#E30A17" />
      <circle cx="12.4" cy="16" r="6.1" fill="#ffffff" />
      <circle cx="13.9" cy="16" r="4.9" fill="#E30A17" />
      <polygon points={starPoints(20.5, 16, 2.5, -Math.PI / 2)} fill="#ffffff" />
    </>
  ),
  UA: (
    <>
      <rect width="32" height="16" fill="#0057B7" />
      <rect y="16" width="32" height="16" fill="#FFD700" />
    </>
  ),
  SA: (
    <>
      <rect width="32" height="32" fill="#006C35" />
      <path d="M6 12.6h20M7.2 16.4h17.6" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M8 21.5h16" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  CN: (
    <>
      <rect width="32" height="32" fill="#DE2910" />
      <polygon points={starPoints(8, 8.6, 4)} fill="#FFDE00" />
      <polygon points={starPoints(15.4, 4.6, 1.35)} fill="#FFDE00" />
      <polygon points={starPoints(18.6, 8, 1.35)} fill="#FFDE00" />
      <polygon points={starPoints(18.6, 13.4, 1.35)} fill="#FFDE00" />
      <polygon points={starPoints(15.4, 16.8, 1.35)} fill="#FFDE00" />
    </>
  ),
  JP: (
    <>
      <rect width="32" height="32" fill="#ffffff" />
      <circle cx="16" cy="16" r="6.6" fill="#BC002D" />
    </>
  ),
  KR: (
    <>
      <rect width="32" height="32" fill="#ffffff" />
      <circle cx="16" cy="16" r="6" fill="#CD2E3A" />
      <path d="M10 16a6 6 0 0 0 12 0 3 3 0 0 0-6 0 3 3 0 0 1-6 0Z" fill="#0047A0" />
      <circle cx="13" cy="16" r="1.6" fill="#CD2E3A" />
      <circle cx="19" cy="16" r="1.6" fill="#0047A0" />
      <path d="M6.5 6.5l5 5M4.8 9.2l5 5M9.2 4.8l5 5" stroke="#000000" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M25.5 25.5l-5-5M27.2 22.8l-5-5M22.8 27.2l-5-5" stroke="#000000" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
};

export function Flag({ code, size = 22, className }: { code: string; size?: number; className?: string }): ReactNode {
  const clipId = useId();
  const body = FLAGS[code.toUpperCase()] ?? (
    <>
      <rect width="32" height="32" fill="#3a4250" />
      <circle cx="16" cy="16" r="7" fill="#8b93a1" />
    </>
  );
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label={code}
      style={{ display: 'inline-block', flex: 'none', borderRadius: '50%' }}
    >
      <clipPath id={clipId}>
        <circle cx="16" cy="16" r="15.5" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>{body}</g>
      <circle cx="16" cy="16" r="15.2" fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="0.8" />
    </svg>
  );
}
