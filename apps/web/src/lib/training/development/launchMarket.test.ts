/**
 * Launch market (first 100 free riders, C-093): real OVR F4 69..75, age 17..20, Skúsenosti 1..20 of 200,
 * Potential on the approved 1..100 band distribution (35/45/14/4.5/1.2/0.3 %), probabilistic. Targeted tests.
 * Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/launchMarket.test.ts
 */
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import { potentialStarsOf } from '@/lib/rider/development';
import { POTENTIAL_BANDS } from '@/lib/rider/config';
import { MARKET_GEN_CONFIG, generateInitialMarketRider, generateMarketRider } from './initialMarket';
import { LAUNCH_MARKET_CONFIG, LAUNCH_MARKET_COUNT, LAUNCH_MARKET_SEED, generateLaunchMarket, launchMarketId } from './launchMarket';
import { officialOvr } from './ovr';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

const pool = generateLaunchMarket();
const ovr = pool.map((r) => officialOvr(r.attributes));
check('exactly 100 riders', LAUNCH_MARKET_COUNT === 100 && pool.length === 100);
check('every rider has real OVR 69..75', ovr.every((o) => o >= 69 && o <= 75), `min ${Math.min(...ovr)} max ${Math.max(...ovr)}`);
check('age 17..20', pool.every((r) => r.age >= 17 && r.age <= 20));
check('Skúsenosti 1..20 of 200', pool.every((r) => r.attributes.experience >= 1 && r.attributes.experience <= 20), `${Math.min(...pool.map((r) => r.attributes.experience))}..${Math.max(...pool.map((r) => r.attributes.experience))}`);
check('all 19 attributes within 1..200', pool.every((r) => SKILL_ATTRIBUTES.every((k) => r.attributes[k] >= 1 && r.attributes[k] <= 200)));
const dev = ['potential', 'trainability', 'professionalism', 'recovery'] as const;
check('Potential 1..100, other hidden traits 1..100', pool.every((r) => (['potential', 'trainability', 'professionalism', 'recovery', 'vitality'] as const).every((k) => r.hidden[k] >= 1 && r.hidden[k] <= 100)));
// the approved bands are PROBABILITIES, not quotas: check the long-run share on a big sample, never a fixed count in the 100
const big = Array.from({ length: 30000 }, (_, i) => generateMarketRider(i * 7919 + 3, null, LAUNCH_MARKET_CONFIG).hidden.potential);
const share = (lo: number, hi: number) => (100 * big.filter((p) => p >= lo && p <= hi).length) / big.length;
const bandShares = POTENTIAL_BANDS.map((b) => share(b.min, b.max));
check('bands: 1-39 / 40-59 / 60-74 / 75-87 / 88-94 / 95-100 = 35 / 45 / 14 / 4.5 / 1.2 / 0.3 % (30 000 samples)', POTENTIAL_BANDS.every((b, i) => Math.abs(bandShares[i] - b.share) < Math.max(0.35, b.share * 0.25)), bandShares.map((x) => x.toFixed(2)).join(' '));
check('bands sum to 100 % and cover 1..100 without a gap', Math.abs(POTENTIAL_BANDS.reduce((a, b) => a + b.share, 0) - 100) < 1e-9 && POTENTIAL_BANDS.every((b, i) => i === 0 ? b.min === 1 : b.min === POTENTIAL_BANDS[i - 1].max + 1) && POTENTIAL_BANDS[5].max === 100);
check('the 100 riders have NO forced count per band (rare bands may be empty): generator draws independently', pool.filter((r) => r.hidden.potential >= 95).length <= 5);
const starsOf = (p: number) => potentialStarsOf(p);
check('stars follow the bands: 1-39 =1, 40-59 =2, 60-74 =3, 75-87 =4, 88-100 =5', [1, 39].every((p) => starsOf(p) === 1) && [40, 59].every((p) => starsOf(p) === 2) && [60, 74].every((p) => starsOf(p) === 3) && [75, 87].every((p) => starsOf(p) === 4) && [88, 94, 95, 100].every((p) => starsOf(p) === 5));
const starShare = [1, 2, 3, 4, 5].map((s) => (100 * big.filter((p) => starsOf(p) === s).length) / big.length);
check('star shares about 35 / 45 / 14 / 4.5 / 1.5 %', [35, 45, 14, 4.5, 1.5].every((t, i) => Math.abs(starShare[i] - t) < Math.max(0.4, t * 0.1)), starShare.map((x) => x.toFixed(2)).join(' '));
check('all 7 rider types occur', new Set(pool.map((r) => r.inferredShape)).size === 7);
check('unique names', new Set(pool.map((r) => `${r.firstName} ${r.surname}`)).size === 100);
check('deterministic (same output twice)', JSON.stringify(generateLaunchMarket()) === JSON.stringify(pool));
check('ids are stable and unique', new Set(pool.map((_, i) => launchMarketId(i))).size === 100 && launchMarketId(0) === launchMarketId(0));
check('the production generator defaults are unchanged (older config keeps expMin 15, hidden mean 50)', MARKET_GEN_CONFIG.expMin === 15 && MARKET_GEN_CONFIG.hiddenMean === 50);
check('old initial-market generator still gives OVR 69..75', officialOvr(generateInitialMarketRider(LAUNCH_MARKET_SEED).attributes) >= 69);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
