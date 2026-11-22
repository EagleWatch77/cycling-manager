/** Run with: npx tsx src/lib/sponsors/catalog.test.ts — the approved 30 names are identical in code, migration and page wiring. */
import fs from 'node:fs';
import path from 'node:path';
import { APPROVED_MAIN_SPONSORS, APPROVED_SECONDARY_SPONSORS } from './catalog';
import { demoContracts, demoOffers } from './demo';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) pass++; else { fail++; console.log(`FAIL ${n} ${d}`); } };
const root = path.resolve(__dirname, '../../../../..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261122_02_sponsor_catalog_main_30.sql'), 'utf8');

// the owner's approved list, written out independently of the constant
const OWNER = ['Veltaro Cycling', 'Kadrin Wheels', 'Aerovex', 'Torvello Bikes', 'Rydexa', 'Solvanta Energy', 'Noryx Power', 'Voltaris Group', 'Eltrava Energy', 'Energonix',
  'Veltrion Motors', 'Arvexa Automotive', 'Nordaris Mobility', 'Motravia', 'Axeron Motors', 'Datrix Systems', 'Quantelis', 'Nexoria Tech', 'Syntrava', 'Corevanta',
  'Monvera Capital', 'Asteriq Finance', 'Valtrix Bank', 'Norvella Insurance', 'Fintravo', 'Altivex Logistics', 'Montaris Group', 'Avendra Global', 'Trinex Industries', 'Orvanta Holdings'];
check('exactly 30 names', APPROVED_MAIN_SPONSORS.length === 30);
check('constant == owner list, same order', JSON.stringify(APPROVED_MAIN_SPONSORS) === JSON.stringify(OWNER));
check('no duplicate names', new Set(APPROVED_MAIN_SPONSORS.map((x) => x.toLowerCase())).size === 30);
// the migration contains the same names (in both the INSERT and the numbering UPDATE), in the same order
const arrays = [...sql.matchAll(/unnest\(array\[([\s\S]*?)\]\)/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
check('migration lists the catalogue twice (insert + numbering)', arrays.length === 2);
check('migration names == constant, same order (insert)', JSON.stringify(arrays[0]) === JSON.stringify(OWNER));
check('migration names == constant, same order (numbering)', JSON.stringify(arrays[1]) === JSON.stringify(OWNER));
check('migration marks them main and checks the count of 30', /'main', o from unnest/.test(sql) && /<> 30/.test(sql));
check('migration is re-runnable: ON CONFLICT DO NOTHING + IF NOT EXISTS', /on conflict \(name\) do nothing/.test(sql) && /add column if not exists kind/.test(sql));
check('migration refuses to run without migration 01', /Run 20261122_01_sponsors_foundation\.sql first/.test(sql));
check('migration holds the 21-day rule', /expires_at = created_at \+ interval '21 days'/.test(sql));
check('migration has no money and no contract insert', !/insert into public\.sponsor_(contracts|payouts|offers)/i.test(sql) && !/weekly_income_cents\s*=\s*[1-9]/.test(sql));
check('migration does not delete or drop existing data', !/\bdrop (table|column)\b/i.test(sql.replace(/--.*$/gm, '')) && !/\bdelete from\b/i.test(sql.replace(/--.*$/gm, '')) && !/\btruncate\b/i.test(sql));
// the page reads the catalogue from the database, not from the constant
const page = fs.readFileSync(path.join(root, 'apps/web/src/app/sponsors/page.tsx'), 'utf8');
const repo = fs.readFileSync(path.join(root, 'apps/web/src/lib/sponsors/repository.ts'), 'utf8');
check('the page no longer lists the catalogue (generator input only)', !/getMainSponsorCatalog|SponsorCatalog|catalog\.entries/.test(page) && !fs.existsSync(path.join(root, 'apps/web/src/components/sponsors/SponsorCatalog.tsx')));
check('repository has no catalogue reader any more', !/getMainSponsorCatalog|from\('sponsor_companies'\)\.select\('id, name, catalog_no'\)/.test(repo));
check('the constant is used on the page only as the DEMO name source', (page.match(/APPROVED_MAIN_SPONSORS/g) ?? []).length === 2 && /demoNames/.test(page));
// demo names come from the catalogue
const now = new Date('2026-11-22T10:00:00Z'); const sec = (n: number) => `Sec ${n}`;
const names = [...demoContracts(now, OWNER, sec), ...demoOffers(now, OWNER, APPROVED_SECONDARY_SPONSORS)].filter((x) => x.kind === 'main').map((x) => x.companyName);
check('main demo items use catalogue names only', names.length === 4 && names.every((n) => OWNER.includes(n)), names.join(','));
check('no "Demo sponsor A/B" left', ![...demoContracts(now, OWNER, sec), ...demoOffers(now, OWNER, APPROVED_SECONDARY_SPONSORS)].some((x) => /^Demo sponsor/.test(x.companyName)));
check('secondary demo items are NOT invented companies (neutral label)', [...demoContracts(now, OWNER, sec)].filter((x) => x.kind === 'secondary').every((x) => /^Sec \d$/.test(x.companyName)));
check('demo names inside the demo are distinct per card', new Set([...demoContracts(now, OWNER, sec), ...demoOffers(now, OWNER, APPROVED_SECONDARY_SPONSORS)].map((x) => x.companyName)).size === 8);

// ---- the 50 secondary sponsors: owner list written out independently, compared with the constant and with migration 20261122_06
const OWNER_SEC = ['Velora Nutrition', 'Endriva Fuel', 'Nutrexia Sport', 'Proventa Hydration', 'Carbion Energy', 'Hydrava', 'Peakora Nutrition', 'Vitanex Sport', 'Geltrix', 'Revora Recovery', 'Aerion Helmets', 'Veltrix Apparel', 'Gripora', 'Pedalix', 'Carbonex Components', 'Optivelo', 'Rovenna Sportswear', 'Spinora', 'Vexaro Gear', 'Lumetra Lights', 'Nexbit Digital', 'Trackora Systems', 'Pulsion Tech', 'DataVelo', 'Synexis Mobile', 'Velometric', 'Optaris Electronics', 'Cloudvanta', 'Nexaro Devices', 'Chronexa', 'Montiva Hotels', 'Traveon', 'Alpiora Resorts', 'Routevia Travel', 'Velmont Coffee', 'Frutella Foods', 'Granovia', 'Naturivo', 'Aquenor Water', 'Bravento Foods', 'Transvex Express', 'Moventra Logistics', 'Packora', 'Urbanexa', 'Servion Auto', 'Finora Pay', 'Insurevia', 'Noventra Media', 'Printora Studio', 'EcoVantis'];
const sql6 = fs.readFileSync(path.join(root, 'supabase/migrations/20261122_06_sponsor_secondary.sql'), 'utf8');
check('secondary: exactly 50 names, same order as the owner list', APPROVED_SECONDARY_SPONSORS.length === 50 && JSON.stringify(APPROVED_SECONDARY_SPONSORS) === JSON.stringify(OWNER_SEC));
check('secondary: no duplicates, none equal to a main sponsor', new Set(OWNER_SEC.map((x) => x.toLowerCase())).size === 50 && !OWNER_SEC.some((n) => OWNER.includes(n)));
const arrays6 = [...sql6.matchAll(/unnest\(array\[([\s\S]*?)\]\)/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
check('migration 06 lists the secondary catalogue twice (insert + numbering), identical to the owner list', arrays6.length === 2 && arrays6.every((a) => JSON.stringify(a) === JSON.stringify(OWNER_SEC)));
check('migration 06 inserts as kind secondary and self-checks 30 + 50 = 80', /'secondary', o from unnest/.test(sql6) && /v_s <> 50/.test(sql6) && /v_all <> 80/.test(sql6));
check('migration 06 is one transaction, never deletes or drops data', /^begin;/m.test(sql6) && /^commit;/m.test(sql6) && !/\bdelete from\b|\btruncate\b|\bdrop (table|column)\b/i.test(sql6.replace(/--.*$/gm, '')));
check('migration 06 creates no money / contract / payout rows', !/insert into public\.sponsor_(contracts|payouts)/i.test(sql6));
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
