/** Run with: npx tsx src/components/sponsors/SponsorCatalog.test.tsx */
import '../BikeCard.setup';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { getDictionary } from '@/i18n/config';
import { SponsorCatalog } from './SponsorCatalog';
import { APPROVED_MAIN_SPONSORS } from '@/lib/sponsors/catalog';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const entries = APPROVED_MAIN_SPONSORS.map((name, i) => ({ id: `id-${i}`, name, no: i + 1 }));
for (const loc of ['sk', 'en', 'cs', 'de', 'es', 'fr', 'pl'] as const) {
  const t = getDictionary(loc);
  const h = renderToStaticMarkup(createElement(SponsorCatalog, { entries, loaded: true, t }));
  check(`${loc}: all 30 names rendered`, APPROVED_MAIN_SPONSORS.every((n) => h.includes(`>${n}<`)) && (h.match(/<li /g) ?? []).length === 30);
  check(`${loc}: title + "not your offers" note + count`, h.includes(t('sp.catalog.title')) && h.includes(t('sp.catalog.note')) && h.includes(t('sp.catalog.count', { n: 30 })));
}
const t = getDictionary('sk');
const h = renderToStaticMarkup(createElement(SponsorCatalog, { entries, loaded: true, t }));
check('numbers 1..30 shown in the approved order', h.indexOf('>1<') < h.indexOf('Veltaro Cycling') && h.indexOf('Veltaro Cycling') < h.indexOf('Kadrin Wheels') && h.indexOf('Fintravo') < h.indexOf('Orvanta Holdings'));
check('responsive grid: 1 col phone, 2 / 3 / 5 wider', /grid-cols-1/.test(h) && /min-\[420px\]:grid-cols-2/.test(h) && /md:grid-cols-3/.test(h) && /xl:grid-cols-5/.test(h));
check('long names cannot overflow (truncate + min-w-0)', /min-w-0 truncate/.test(h));
check('the catalogue is not presented as offers (no Prijať / Odmietnuť / Detail)', !/Prijať|Odmietnuť|>Detail</.test(h));
const empty = renderToStaticMarkup(createElement(SponsorCatalog, { entries: [], loaded: false, t }));
check('before the migration: honest empty state, no invented names', empty.includes(t('sp.catalog.empty')) && !APPROVED_MAIN_SPONSORS.some((n) => empty.includes(n)));
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
