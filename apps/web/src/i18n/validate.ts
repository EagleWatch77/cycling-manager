/**
 * i18n validation. Run with `npm run i18n:check`.
 *
 * Fails when a locale file is missing, a key is missing from any locale, key
 * structures differ, or a file exists for a locale the app does not support.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALE_NAMES } from './config';

const DIR = join(process.cwd(), 'src/i18n/messages');
const problems: string[] = [];

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const present = files.map((f) => f.replace(/\.json$/, ''));

for (const code of present) {
  if (!(LOCALES as readonly string[]).includes(code)) {
    problems.push(`unsupported locale file: ${code}.json — not listed in LOCALES`);
  }
}
for (const code of LOCALES) {
  if (!present.includes(code)) problems.push(`missing locale file: ${code}.json`);
}
if (!(LOCALES as readonly string[]).includes(DEFAULT_LOCALE)) {
  problems.push(`DEFAULT_LOCALE "${DEFAULT_LOCALE}" is not in LOCALES`);
}
if (!(LOCALES as readonly string[]).includes(FALLBACK_LOCALE)) {
  problems.push(`FALLBACK_LOCALE "${FALLBACK_LOCALE}" is not in LOCALES`);
}
for (const code of LOCALES) {
  if (!LOCALE_NAMES[code]) problems.push(`LOCALE_NAMES has no display name for "${code}"`);
}

const dicts = new Map<string, Record<string, string>>();
for (const code of LOCALES) {
  try {
    dicts.set(code, JSON.parse(readFileSync(join(DIR, `${code}.json`), 'utf8')));
  } catch {
    problems.push(`cannot read or parse ${code}.json`);
  }
}

const reference = dicts.get(FALLBACK_LOCALE);
if (reference) {
  const refKeys = Object.keys(reference).sort();
  for (const [code, dict] of dicts) {
    const keys = Object.keys(dict).sort();
    for (const k of refKeys) if (!(k in dict)) problems.push(`${code}.json is missing key "${k}"`);
    for (const k of keys) if (!(k in reference)) problems.push(`${code}.json has extra key "${k}"`);
    for (const [k, v] of Object.entries(dict)) {
      if (typeof v !== 'string') problems.push(`${code}.json key "${k}" is not a string`);
      else if (v.trim() === '') problems.push(`${code}.json key "${k}" is empty`);
    }
    // placeholders such as {n} must survive translation
    for (const k of refKeys) {
      const want = (reference[k].match(/\{[a-z]+\}/g) ?? []).sort().join(',');
      const got = (dict[k]?.match(/\{[a-z]+\}/g) ?? []).sort().join(',');
      if (want !== got) problems.push(`${code}.json key "${k}" placeholder mismatch: expected ${want || 'none'}, got ${got || 'none'}`);
    }
  }
}

if (problems.length) {
  console.error(`i18n validation failed with ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`i18n OK — ${LOCALES.length} locales, ${Object.keys(reference ?? {}).length} keys each`);
