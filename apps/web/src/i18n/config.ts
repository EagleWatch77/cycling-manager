import sk from './messages/sk.json';
import en from './messages/en.json';

export const LOCALES = ['sk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'sk';

const DICTIONARIES: Record<Locale, Record<string, string>> = { sk, en };

export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}

/**
 * Minimal dictionary lookup, deliberately dependency-free so it can be swapped
 * for next-intl later without touching a single component: components only ever
 * call `t(key)`.
 *
 * Domain identifiers (league ids, terrain names, equipment slot ids) stay
 * language-neutral in the data and are translated at render time.
 */
export function getDictionary(locale: Locale) {
  const dict = DICTIONARIES[locale];
  return function t(key: string, vars?: Record<string, string | number>): string {
    let out = dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
    return out;
  };
}

export type T = ReturnType<typeof getDictionary>;
