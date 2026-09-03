import sk from './messages/sk.json';
import en from './messages/en.json';
import cs from './messages/cs.json';
import pl from './messages/pl.json';
import es from './messages/es.json';
import fr from './messages/fr.json';
import de from './messages/de.json';

export const LOCALES = ['sk', 'en', 'cs', 'pl', 'de', 'fr', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Slovak stays the default; English is the fallback for any missing key. */
export const DEFAULT_LOCALE: Locale = 'sk';
export const FALLBACK_LOCALE: Locale = 'en';

/** Human-readable names, each written in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  sk: 'Slovenčina',
  en: 'English',
  cs: 'Čeština',
  pl: 'Polski',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
};

/**
 * Two-letter labels for the compact switcher. These are display strings only:
 * the locale ids themselves stay standard ISO 639-1, so Czech is `cs`
 * internally even though the badge reads CZ.
 */
export const LOCALE_SHORT: Record<Locale, string> = {
  sk: 'SK', en: 'EN', cs: 'CZ', pl: 'PL', de: 'DE', fr: 'FR', es: 'ES',
};

/** Cookie the locale is stored in. Read by server components, written by the picker. */
export const LOCALE_COOKIE = 'cm_locale';

const DICTIONARIES: Record<Locale, Record<string, string>> = { sk, en, cs, pl, es, fr, de };

export function isLocale(v: string | undefined | null): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/**
 * Minimal dictionary lookup, deliberately dependency-free so it can be swapped
 * for next-intl later without touching a single component: components only ever
 * call `t(key)`.
 *
 * Missing keys fall back to English, never to the default locale, so an
 * untranslated string surfaces in a language every player can read.
 *
 * Domain identifiers (league ids, terrain names, equipment slot ids) stay
 * language-neutral in the data and are translated at render time.
 */
export function getDictionary(locale: Locale) {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[FALLBACK_LOCALE];
  return function t(key: string, vars?: Record<string, string | number>): string {
    let out = dict[key] ?? DICTIONARIES[FALLBACK_LOCALE][key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
    return out;
  };
}

export type T = ReturnType<typeof getDictionary>;
