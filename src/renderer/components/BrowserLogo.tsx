import type { ReactNode } from 'react';
import { siGooglechrome, siBrave, siFirefoxbrowser } from 'simple-icons/icons';

/** Official product marks, used beside browser names. */
export function BrowserLogo({ engine, size = 20 }: { engine: string; size?: number }): ReactNode {
  const key = engine.toLowerCase();
  if (key === 'edge') return <img src="./brand/microsoft-edge.svg" width={size} height={size} alt="" />;
  if (key === 'chromium') return <img src="./brand/chromium.png" width={size} height={size} alt="" />;
  const icon = key === 'chrome' ? siGooglechrome : key === 'brave' ? siBrave : key === 'firefox' ? siFirefoxbrowser : null;
  if (!icon) return null;
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ flex: 'none', fill: `#${icon.hex}` }}><path d={icon.path} /></svg>;
}
