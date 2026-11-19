/**
 * Launch market (first 100 free riders, C-093): real OVR F4 69..75, age 17..20, Skúsenosti 1..20 of 200,
 * hidden development traits on the production 55..95 scale. Targeted tests.
 * Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/launchMarket.test.ts
 */
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import { potentialToStars } from '@/lib/rider/development';
import { POTENTIAL_MIN, POTENTIAL_MAX } from '@/lib/rider/config';
import { MARKET_GEN_CONFIG, generateInitialMarketRider } from './initialMarket';
import { LAUNCH_MARKET_COUNT, LAUNCH_MARKET_SEED, generateLaunchMarket, launchMarketId } from './launchMarket';
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
check('potential, trainability, professionalism, recovery on the production 55..95 scale', pool.every((r) => dev.every((k) => r.hidden[k] >= 55 && r.hidden[k] <= 95)));
check('vitality 1..100', pool.every((r) => r.hidden.vitality >= 1 && r.hidden.vitality <= 100));
const stars = pool.map((r) => potentialToStars(r.hidden.potential, POTENTIAL_MIN, POTENTIAL_MAX));
check('all five potential star levels occur (each >= 8 riders)', [1, 2, 3, 4, 5].every((s) => stars.filter((x) => x === s).length >= 8), [1, 2, 3, 4, 5].map((s) => stars.filter((x) => x === s).length).join(' '));
check('all 7 rider types occur', new Set(pool.map((r) => r.inferredShape)).size === 7);
check('unique names', new Set(pool.map((r) => `${r.firstName} ${r.surname}`)).size === 100);
check('deterministic (same output twice)', JSON.stringify(generateLaunchMarket()) === JSON.stringify(pool));
check('ids are stable and unique', new Set(pool.map((_, i) => launchMarketId(i))).size === 100 && launchMarketId(0) === launchMarketId(0));
check('the production generator defaults are unchanged (older config keeps expMin 15, hidden mean 50)', MARKET_GEN_CONFIG.expMin === 15 && MARKET_GEN_CONFIG.hiddenMean === 50);
check('old initial-market generator still gives OVR 69..75', officialOvr(generateInitialMarketRider(LAUNCH_MARKET_SEED).attributes) >= 69);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
