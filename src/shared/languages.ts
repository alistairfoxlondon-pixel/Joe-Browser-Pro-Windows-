/**
 * The interface languages the app offers.
 *
 * The original shipped 15 tables and a picker that showed a circular flag with the language's own
 * name, never a bare "en / de / ru". A language with no table was not offered at all, because
 * choosing one and watching nothing change reads as a broken app.
 *
 * Here the English table is the contract: every key in it must exist, and every other table is a
 * partial translation that falls back per key. The `coverage` figure shown in the picker is
 * computed from the tables themselves, so it cannot claim more than it delivers.
 */

export interface LanguageDef {
  key: string;
  flag: string;
  english: string;
  native: string;
  /** 'ltr' or 'rtl'; the Arabic table flips the whole layout. */
  direction: 'ltr' | 'rtl';
}

export const LANGUAGES: LanguageDef[] = [
  { key: 'en', flag: 'US', english: 'English', native: 'English', direction: 'ltr' },
  { key: 'de', flag: 'DE', english: 'German', native: 'Deutsch', direction: 'ltr' },
  { key: 'ru', flag: 'RU', english: 'Russian', native: 'Русский', direction: 'ltr' },
  { key: 'es', flag: 'ES', english: 'Spanish', native: 'Español', direction: 'ltr' },
  { key: 'fr', flag: 'FR', english: 'French', native: 'Français', direction: 'ltr' },
  { key: 'pt', flag: 'BR', english: 'Portuguese', native: 'Português', direction: 'ltr' },
  { key: 'it', flag: 'IT', english: 'Italian', native: 'Italiano', direction: 'ltr' },
  { key: 'nl', flag: 'NL', english: 'Dutch', native: 'Nederlands', direction: 'ltr' },
  { key: 'pl', flag: 'PL', english: 'Polish', native: 'Polski', direction: 'ltr' },
  { key: 'tr', flag: 'TR', english: 'Turkish', native: 'Türkçe', direction: 'ltr' },
  { key: 'uk', flag: 'UA', english: 'Ukrainian', native: 'Українська', direction: 'ltr' },
  { key: 'ar', flag: 'SA', english: 'Arabic', native: 'العربية', direction: 'rtl' },
  { key: 'zh', flag: 'CN', english: 'Chinese (Simplified)', native: '简体中文', direction: 'ltr' },
  { key: 'ja', flag: 'JP', english: 'Japanese', native: '日本語', direction: 'ltr' },
  { key: 'ko', flag: 'KR', english: 'Korean', native: '한국어', direction: 'ltr' },
];

export function languageByKey(key: string): LanguageDef {
  return LANGUAGES.find((entry) => entry.key === key) ?? LANGUAGES[0]!;
}

/** Full name for a picker: "German (Deutsch)". */
export function languageName(key: string): string {
  const entry = languageByKey(key);
  return entry.native === entry.english ? entry.english : `${entry.english} (${entry.native})`;
}
