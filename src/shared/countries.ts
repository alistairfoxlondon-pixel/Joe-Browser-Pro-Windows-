import { FLAG_CODES } from './flagCodes';

// Match only flags bundled by flag-icons; never render an empty or unrelated flag.
const available: Set<string> = new Set(FLAG_CODES);
const names = new Intl.DisplayNames(['en'], { type: 'region' });

export function countryCode(value: string): string {
  const code = (value || '').trim().toUpperCase();
  return available.has(code) ? code : '';
}

/** Code is the common source for both the displayed name and flag. */
export function countryName(code: string, fallback = ''): string {
  const normalized = countryCode(code);
  if (!normalized) return fallback;
  const name = names.of(normalized);
  return name && name !== normalized ? name : fallback || normalized;
}
