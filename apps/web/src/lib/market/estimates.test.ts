/**
 * Rough Rozvoj estimates of a market rider (lib/market/estimates.ts + buildMarketRadarModel): levels only, never an exact number, radar consistent with the card.
 * Run with: npx tsx src/lib/market/estimates.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { asLevel, marketScoreToLevel, toMarketEstimateLevels, MARKET_ESTIMATE_KEYS } from './estimates';
import { buildMarketRadarModel, buildRadarModel, NO_DEVELOPMENT_ESTIMATES } from '../rider/radar';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '../rider/config';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// --- mapping: same edges as public.market_score_to_level (supabase/tests/market_rider_estimates.test.sh: 1,20,21,40,41,60,61,80,81,100 -> 1122334455)
check('marketScoreToLevel equals the SQL twin on the band edges', [1, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(marketScoreToLevel).join('') === '1122334455');
const sqlSrc = fs.readFileSync(path.join(__dirname, '../../../../../supabase/migrations/20261119_06_market_rider_estimates.sql'), 'utf8');
check('SQL twin is "ceil(value / 20)" clamped 1..5 (same rule as the TypeScript twin)', /ceil\(p_value \/ 20\.0\)/.test(sqlSrc) && /greatest\(1, least\(5,/.test(sqlSrc));
check('SQL noise is +-10 (mod 21 - 10), keyed by salt + rider id + attribute; Potential has no noise', /% 21\)::int - 10/.test(sqlSrc) && /market_noisy_level\(m\.trainability,\s+m\.id, 'trainability'\)/.test(sqlSrc) && /potential_to_stars\(m\.potential\)/.test(sqlSrc) && !/market_noisy_level\(m\.potential/.test(sqlSrc));
check('NO secret salt is written in the migration or in any TypeScript file (generated inside the database)', /gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text/.test(sqlSrc) && !/salt\s*(=|:)\s*'[0-9a-f]{16,}'/i.test(sqlSrc) && !/salt/i.test(fs.readFileSync(path.join(__dirname, 'estimates.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
check('every value 1..100 gives a level 1..5', Array.from({ length: 100 }, (_, i) => marketScoreToLevel(i + 1)).every((l) => l >= 1 && l <= 5));
// --- database row -> levels
check('asLevel accepts only whole numbers 1..5', [1, 2, 3, 4, 5].every((n) => asLevel(n) === n) && [0, 6, 2.5, NaN, null, undefined, '3', {}].every((v) => asLevel(v) === null));
const full = toMarketEstimateLevels({ potential_stars: 4, trainability_level: 2, professionalism_level: 5, recovery_level: 3, vitality_level: 1 }, 12, 4);
check('full row maps to five levels + the exact Experience', full.potential === 4 && full.trainability === 2 && full.professionalism === 5 && full.recovery === 3 && full.vitality === 1 && full.experience === 12);
const none = toMarketEstimateLevels(null, 12, 3);
check('no row (function missing / not visible): hidden levels null, Potential falls back to the public star bucket, nothing invented',
  none.trainability === null && none.professionalism === null && none.recovery === null && none.vitality === null && none.potential === 3);
const junk = toMarketEstimateLevels({ potential_stars: 99, trainability_level: 87, professionalism_level: '4', recovery_level: null, vitality_level: -1 }, 12, 2);
check('invalid database values are ignored, never shown', junk.trainability === null && junk.professionalism === null && junk.vitality === null && junk.potential === 2);

// --- radar: no exact Rozvoj / Skúsenosti numbers, consistent with the card
const attrs = Object.fromEntries(SKILL_ATTRIBUTES.map((a, i) => [a, 150 + i])) as Record<SkillAttribute, number>;
attrs.experience = 137;
const label = (k: string) => k;
const model = buildMarketRadarModel(attrs, full, label);
const exp = model.groups.find((g) => g.id === 'experience')!;
const dev = model.groups.find((g) => g.id === 'development')!;
check('radar has the five axes in the usual order', model.groups.map((g) => g.id).join() === 'performance,tactics,technique,experience,development');
check('Skúsenosti: exact number (public attribute), no estimate', exp.value === 137 && exp.level === null && exp.range === null);
check('Skúsenosti: position on the radar is the exact one (same as the own-rider radar)', Math.abs((exp.norm ?? 0) - buildRadarModel(attrs, NO_DEVELOPMENT_ESTIMATES, label).groups.find((g) => g.id === 'experience')!.norm!) < 1e-12);
check('Rozvoj: no number, no interval', dev.value === null && dev.range === null && dev.normRange === null);
check('Rozvoj fan has all five hidden values incl. vitality, each a level only',
  dev.attributes.map((a) => a.key).join() === 'potential,trainability,professionalism,recovery,vitality'
  && dev.attributes.every((a) => a.value === null && a.range === null && a.normRange === null && a.level !== null));
const mean = Math.round((4 + 2 + 5 + 3 + 1) / 5);
check('Rozvoj axis level = rounded mean of the five levels (same numbers as the card)', dev.level === mean && Math.abs((dev.norm ?? 0) - [4, 2, 5, 3, 1].reduce((s, l) => s + (l - 0.5) / 5, 0) / 5) < 1e-9);
const partial = buildMarketRadarModel(attrs, { ...full, vitality: null }, label).groups.find((g) => g.id === 'development')!;
check('partly unknown Rozvoj: no mean is invented (level and norm null)', partial.level === null && partial.norm === null);
const json = JSON.stringify(model);
check('no hidden value or interval anywhere in the radar model (Rozvoj has value/range null for all five)', dev.value === null && dev.attributes.every((a) => a.value === null && a.range === null) && !/"range":\{/.test(json));
const skills = model.groups.filter((g) => ['performance', 'tactics', 'technique'].includes(g.id));
check('Výkon / Taktika / Technika are unchanged (still exact attribute values)', skills.every((g) => g.attributes.length > 0 && g.attributes.every((a) => typeof a.value === 'number')));
check('card model = five hidden values (Experience is separate and exact)', MARKET_ESTIMATE_KEYS.join() === 'potential,trainability,professionalism,recovery,vitality');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
