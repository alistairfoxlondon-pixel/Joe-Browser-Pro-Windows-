import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** Bundled ISO 3166 flags; the fallback never claims an unknown location. */
export function CountryFlag({ code, size = 20 }: { code: string; size?: number }): ReactNode {
  const normalized = code.toLowerCase();
  return /^[a-z]{2}$/.test(normalized)
    ? <span className={`fi fi-${normalized} country-flag`} style={{ width: size, height: size }} aria-label={code.toUpperCase()} role="img" />
    : <Icon name="globe" size={size} />;
}
