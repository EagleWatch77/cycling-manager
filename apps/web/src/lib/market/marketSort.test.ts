/**
 * Default Market order: OVR F4 descending, equal OVR mixed by a stable id-derived key (see marketSort.ts).
 * Run with: npx tsx src/lib/market/marketSort.test.ts
 * Includes the REAL launch-market riders (parsed from supabase/seeds/20261119_launch_market_100.sql, OVR computed by overallRating()).
 */
import fs from 'node:fs';
import path from 'node:path';
import { compareByOverall, shuffleKey, sortByOverall, type OvrSortable } from './marketSort';
import { overallRating } from '../rider/score';
import type { SkillAttribute } from '../rider/config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

interface R extends OvrSortable { name: string; country: string }

// ---- real riders from the seed ----
const seed = fs.readFileSync(path.join(__dirname, '../../../../../supabase/seeds/20261119_launch_market_100.sql'), 'utf8');
const rowRe = /\('([0-9a-f-]{36})'::uuid, '([^']*)', '([^']*)', '([^']*)', '[A-Z]{2}', (\d+), '(\{.*?\})'::jsonb, '\w+', \d+, \d+, \d+, \d+, \d+,/g;
const real: R[] = [];
for (const m of seed.matchAll(rowRe)) {
  real.push({ id: m[1], name: `${m[2]} ${m[3]}`, country: m[4], overallRating: overallRating(JSON.parse(m[6]) as Record<SkillAttribute, number>) });
}
check('seed parsed: 100 riders', real.length === 100, String(real.length));
check('seed: every OVR F4 is in 69..75', real.every((r) => r.overallRating >= 69 && r.overallRating <= 75), JSON.stringify([...new Set(real.map((r) => r.overallRating))]));

const sorted = sortByOverall(real);
const ovrs = sorted.map((r) => r.overallRating);
check('OVR is non-increasing from the top (75 first ... 69 last)', ovrs.every((v, i) => i === 0 || ovrs[i - 1] >= v));
check('first rider has the highest OVR, last has the lowest', ovrs[0] === Math.max(...ovrs) && ovrs[ovrs.length - 1] === Math.min(...ovrs), `${ovrs[0]}..${ovrs[ovrs.length - 1]}`);

// groups with equal OVR: not alphabetical, not by country
const groups = new Map<number, R[]>();
for (const r of sorted) groups.set(r.overallRating, [...(groups.get(r.overallRating) ?? []), r]);
let bigGroups = 0, alphaGroups = 0, countryGroups = 0;
for (const g of groups.values()) {
  if (g.length < 6) continue;
  bigGroups++;
  const byName = [...g].sort((a, b) => a.name.localeCompare(b.name)).map((r) => r.id).join();
  const byCountry = [...g].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)).map((r) => r.id).join();
  const cur = g.map((r) => r.id).join();
  if (cur === byName) alphaGroups++;
  if (cur === byCountry) countryGroups++;
}
check('there are groups of equal OVR to test (>= 2 groups of 6+)', bigGroups >= 2, String(bigGroups));
check('equal-OVR groups are NOT alphabetical', alphaGroups === 0, String(alphaGroups));
check('equal-OVR groups are NOT ordered by country', countryGroups === 0, String(countryGroups));

// stability: independent of the input order, identical on every call
const ids = sorted.map((r) => r.id).join();
const reversed = sortByOverall([...real].reverse()).map((r) => r.id).join();
const rotated = sortByOverall([...real.slice(37), ...real.slice(0, 37)]).map((r) => r.id).join();
check('same result whatever order the database returns rows in', ids === reversed && ids === rotated);
check('same result on repeated calls (refresh)', ids === sortByOverall(real).map((r) => r.id).join());

// pagination over the whole market (page size 20): no repeats, nothing missing, concatenation equals the full order
const PAGE = 20;
const pages: string[][] = [];
for (let p = 1; p <= Math.ceil(real.length / PAGE); p++) pages.push(sorted.slice((p - 1) * PAGE, p * PAGE).map((r) => r.id));
const flat = pages.flat();
check('5 pages x 20, no rider twice, none missing', pages.length === 5 && new Set(flat).size === 100 && flat.length === 100);
check('pages concatenate to the one global order', flat.join() === ids);
check('OVR never increases from page to page (global, not per page)', pages.every((pg, i) => i === 0 || (real.find((r) => r.id === pg[0])!.overallRating <= real.find((r) => r.id === pages[i - 1][PAGE - 1])!.overallRating)));

// a rider joining later does not reshuffle the others with equal OVR relative to each other
const extra: R = { id: 'ffffffff-0000-4000-8000-000000000001', name: 'Test Nový', country: 'Slovakia', overallRating: 72 };
const before = sorted.filter((r) => r.overallRating === 72).map((r) => r.id);
const after = sortByOverall([...real, extra]).filter((r) => r.overallRating === 72 && r.id !== extra.id).map((r) => r.id);
check('adding a rider does not change the relative order of the others', before.join() === after.join());

// hash helpers
check('shuffleKey is deterministic', shuffleKey('abc') === shuffleKey('abc') && shuffleKey('abc') !== shuffleKey('abd'));
check('comparator is a total order (never 0 for different ids)', compareByOverall({ id: 'a', overallRating: 70 }, { id: 'b', overallRating: 70 }) !== 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
