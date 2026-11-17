import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { countryCode } from '../../shared/countries';

/** Bundled ISO 3166 flags; the fallback never claims an unknown location. */
export function CountryFlag({ code, size = 20 }: { code: string; size?: number }): ReactNode {
  const normalized = countryCode(code).toLowerCase();
  return normalized
    ? <span className={`fi fis fi-${normalized} country-flag`} style={{ width: size, height: size }} aria-label={code.toUpperCase()} role="img" />
    : <Icon name="globe" size={size} />;
}
