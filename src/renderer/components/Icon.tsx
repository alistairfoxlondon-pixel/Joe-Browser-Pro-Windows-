import type { ReactNode } from 'react';

/**
 * The icon set.
 *
 * Line icons on a 24-unit grid with one stroke weight, drawn inline rather than loaded from a
 * font: the original bundled Material Icons and paid for it with a 300 KB font and a subset that
 * never quite matched. Twenty icons at the weight the rest of the interface uses is smaller,
 * sharper and has no fallback flash.
 */

const PATHS = {
  profiles: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 14.5zM8 20h10.5A1.5 1.5 0 0 0 20 18.5V8',
  history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4v4.5h4.5',
  proxy: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5',
  extensions: 'M9.5 4.5a1.5 1.5 0 0 1 3 0V6h2.5A1.5 1.5 0 0 1 16.5 7.5V10h1.5a1.5 1.5 0 0 1 0 3H16.5v2.5a1.5 1.5 0 0 1-1.5 1.5H12.5v1.5a1.5 1.5 0 0 1-3 0V17H7a1.5 1.5 0 0 1-1.5-1.5V13H4a1.5 1.5 0 0 1 0-3h1.5V7.5A1.5 1.5 0 0 1 7 6h2.5z',
  browsers: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM4 9h16M6.5 7h.01M9 7h.01',
  tools: 'M14.5 4.5a4 4 0 0 0-5 5L4 15v5h5l5.5-5.5a4 4 0 0 0 5-5l-3 3-2.5-.5L13.5 9z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.3a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.6 15H3.3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6V4.3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.3a2 2 0 1 1 0 4h-.2z',
  about: 'M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'm5 13 4 4L19 7',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  play: 'M7 4.5v15l13-7.5z',
  stop: 'M7 7h10v10H7z',
  external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  folder: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h3.2l1.8 2.5h8A1.5 1.5 0 0 1 20 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z',
  trash: 'M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v5M14 11v5',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM15 6l3 3',
  copy: 'M9 9h9.5A1.5 1.5 0 0 1 20 10.5V20a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 20v-9.5A1.5 1.5 0 0 1 9 9zM5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 5 2.5h9.5A1.5 1.5 0 0 1 16 4v.5',
  refresh: 'M20 11a8 8 0 1 0-2.3 6.5M20 4v7h-7',
  shield: 'M12 3.5 5 6v6c0 4.4 3 7.6 7 8.5 4-.9 7-4.1 7-8.5V6z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 12h17M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z',
  download: 'M12 4v10M8 10.5l4 4 4-4M5 19h14',
  upload: 'M12 15V5M8 8.5l4-4 4 4M5 19h14',
  key: 'M14.5 9.5a4.5 4.5 0 1 0-4 4.47L9 15.5v2H7v2H4v-3l5-5a4.5 4.5 0 0 1 5.5-5z',
  lock: 'M7 10V7.5a5 5 0 0 1 10 0V10M5.5 10h13A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10z',
  unlock: 'M7 10V7.5a5 5 0 0 1 9.6-2M5.5 10h13A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10z',
  logout: 'M15 17l5-5-5-5M20 12H9M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM16 16h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  bolt: 'm13 3-8 10h5l-1 8 8-10h-5z',
  warning: 'M12 4 3 20h18zM12 10v4M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12S18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  filter: 'M4 5h16l-6.5 8v6l-3 2v-8z',
  sort: 'M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M4 6h16M4 12h16M4 18h16',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M5 5l1.5 1.5M17.5 17.5 19 19M2 12h2M20 12h2M5 19l1.5-1.5M17.5 6.5 19 5',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z',
  cpu: 'M8 8h8v8H8zM9 3.5V6M15 3.5V6M9 18v2.5M15 18v2.5M3.5 9H6M3.5 15H6M18 9h2.5M18 15h2.5',
  monitor: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5zM9 20h6M12 17v3',
  phone: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2',
  wifi: 'M4 9a13 13 0 0 1 16 0M7 12.5a8.5 8.5 0 0 1 10 0M10 16a4 4 0 0 1 4 0M12 19.5h.01',
  database: 'M12 8.5c4.4 0 8-1.2 8-2.7S16.4 3 12 3 4 4.2 4 5.8s3.6 2.7 8 2.7zM4 5.8v12.4c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V5.8M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8',
  speed: 'M12 21a9 9 0 1 0-9-9M12 12l4.5-4.5M12 12a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  cookie: 'M12 21a9 9 0 1 0-9-9 3 3 0 0 0 4 3 2.4 2.4 0 0 0 3 2.6A3 3 0 0 0 12 21zM8 9h.01M14 8h.01M15 13h.01M9.5 14.5h.01',
  fingerprint: 'M12 4a8 8 0 0 0-8 8v2M20 14v-2a8 8 0 0 0-5-7.4M8.5 21a9 9 0 0 0 1-4v-5a2.5 2.5 0 0 1 5 0v6a11 11 0 0 0 .5 3.3M12 13v5M4 18a13 13 0 0 0 2-7 6 6 0 0 1 11-3.3',
  code: 'm8 6-6 6 6 6M16 6l6 6-6 6',
  brand: 'M4 5h16M4 5l8 9 8-9M8 21h8',
  power: 'M12 4v8M7.5 6.8a8 8 0 1 0 9 0',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  link: 'M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.4-1.4',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  bell: 'M6 9a6 6 0 1 1 12 0v5l2 3H4l2-3zM10 20a2 2 0 0 0 4 0',
  archive: 'M3.5 7h17M5 7v12h14V7M9 7V4.5h6V7M9.5 11h5',
  sparkle: 'M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  terminal: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM8 10l2.5 2.5L8 15M13 15h3',
  memory: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 9h8M8 13h8',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  route: 'M6 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 15V9a4 4 0 0 1 4-4h3M18 9v6a4 4 0 0 1-4 4h-3',
  history2: 'M12 8v4l2.5 1.5M12 21a9 9 0 1 0-9-9M3 5v4h4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM6 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  dotVertical: 'M13 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0zM13 6a1 1 0 1 0-2 0 1 1 0 0 0 2 0zM13 18a1 1 0 1 0-2 0 1 1 0 0 0 2 0z',
  telegram: 'M21 4.5 2.5 11.7l5.4 1.7 1.9 5.9 2.9-3.6 5.1 3.6zM7.9 13.4 21 4.5l-9.2 11.2',
  translate: 'M4 6h8M7.5 6v-2M10 6c0 4-2.5 7-6 8M5 9c.8 2.2 2.6 4 5 4.7M13 19l4-10 4 10M14.5 15.5h5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size,
  className,
  strokeWidth = 1.8,
  fill,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  fill?: string;
}): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill ?? 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The play triangle and the stop square read better filled at small sizes. */
export function PlayIcon({ size }: { size?: number }): ReactNode {
  return <Icon name="play" size={size} fill="currentColor" strokeWidth={0} />;
}
