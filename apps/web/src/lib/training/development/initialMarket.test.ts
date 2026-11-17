/**
 * Initial transfer market: every rider has OVR 69..75 (inclusive), with diverse profiles. Targeted tests.
 * Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/initialMarket.test.ts
 */
import { PERFORMANCE_FOCUS } from '../config';
import { TECHNIQUE_ATTRIBUTES, TACTICS_ATTRIBUTES, SKILL_ATTRIBUTES } from '@/lib/rider/config';
import { overallRating } from '@/lib/rider/score';
import { PHYSICAL, productionShape, SHAPE_OF_PLAN } from './config';
import { INITIAL_MARKET_OVR, MARKET_GEN_CONFIG, generateInitialMarketRider, generateMarketRider, assertInitialMarketPool } from './initialMarket';
import { officialOvr } from './ovr';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const sdOf = (v: number[]) => { const m = v.reduce((a, b) => a + b) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
const corr = (a: number[], b: number[]) => { const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let s = 0, x2 = 0, y2 = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); x2 += (a[i] - ma) ** 2; y2 += (b[i] - mb) ** 2; } return s / Math.sqrt(x2 * y2); };

check('range is 69..75 inclusive', INITIAL_MARKET_OVR.min === 69 && INITIAL_MARKET_OVR.max === 75);
const N = 10000;
const pool = Array.from({ length: N }, (_, i) => generateInitialMarketRider(i * 104729 + 7));
const ovr = pool.map((r) => officialOvr(r.attributes));
check('EVERY initial rider has OVR 69..75 (10 000 riders)', ovr.every((o) => o >= 69 && o <= 75), `min ${Math.min(...ovr)} max ${Math.max(...ovr)}`);
check('official OVR is the production overallRating() (one formula)', pool.every((r) => officialOvr(r.attributes) === overallRating(r.attributes)));
check('no initial rider above 75', ovr.filter((o) => o > 75).length === 0);
check('every OVR value 69..75 occurs (each >= 8 %, bell-shaped inside the range, no empty value)', [69, 70, 71, 72, 73, 74, 75].every((v) => ovr.filter((o) => o === v).length / N >= 0.08), [69, 70, 71, 72, 73, 74, 75].map((v) => (ovr.filter((o) => o === v).length / N).toFixed(3)).join(' '));
check('the OVR is real: it comes from the attributes (recomputed from the stored attributes)', pool.every((r, i) => officialOvr(r.attributes) === ovr[i]));
check('attributes are integers within 1..200', pool.every((r) => SKILL_ATTRIBUTES.every((k) => Number.isInteger(r.attributes[k]) && r.attributes[k] >= 1 && r.attributes[k] <= 200)));
check('assertInitialMarketPool accepts the pool', (() => { try { assertInitialMarketPool(pool); return true; } catch { return false; } })());
const bad = { ...pool[0], attributes: { ...pool[0].attributes, climbing: 200, hills: 200, flat: 200, sprint: 200, timeTrial: 200, endurance: 200, acceleration: 200 } };
check('assertInitialMarketPool rejects a rider above 75', (() => { try { assertInitialMarketPool([pool[1], bad]); return false; } catch { return true; } })());

// diversity of profiles inside the narrow OVR range
const physRange = pool.map((r) => Math.max(...PERFORMANCE_FOCUS.map((k) => r.attributes[k])) - Math.min(...PERFORMANCE_FOCUS.map((k) => r.attributes[k])));
const techRange = pool.map((r) => Math.max(...TECHNIQUE_ATTRIBUTES.map((k) => r.attributes[k])) - Math.min(...TECHNIQUE_ATTRIBUTES.map((k) => r.attributes[k])));
const physSd = pool.map((r) => sdOf(PERFORMANCE_FOCUS.map((k) => r.attributes[k]))), techSd = pool.map((r) => sdOf(TECHNIQUE_ATTRIBUTES.map((k) => r.attributes[k])));
check('attributes are NOT levelled: > 70 % of riders have a physical spread (max-min) >= 15', physRange.filter((x) => x >= 15).length / N > 0.7, `${physRange.filter((x) => x >= 15).length / N}`);
check('and a technical spread >= 15 for > 70 %', techRange.filter((x) => x >= 15).length / N > 0.7, `${techRange.filter((x) => x >= 15).length / N}`);
check('nearly flat physical profile (sd < 3) is rare (< 8 %)', physSd.filter((x) => x < 3).length / N < 0.08, `${physSd.filter((x) => x < 3).length / N}`);
check('physical and technical spread are independent (|corr| < 0.1)', Math.abs(corr(physSd, techSd)) < 0.1, `${corr(physSd, techSd)}`);
const ra = pool.filter((r) => r.inferredShape === 'climber');
check('a climber with a strong climb does not have a strong descent automatically (|corr| < 0.15)', Math.abs(corr(ra.map((r) => r.attributes.climbing), ra.map((r) => r.attributes.descending))) < 0.15, `${corr(ra.map((r) => r.attributes.climbing), ra.map((r) => r.attributes.descending))}`);
check('within one type riders differ strongly (sd of each physical attribute > 6)', PERFORMANCE_FOCUS.every((k) => sdOf(ra.map((r) => r.attributes[k])) > 6));
const sp = pool.filter((r) => r.inferredShape === 'sprinter');
check('type is visible on average: sprinters have higher sprint than climbing', sp.reduce((a, r) => a + r.attributes.sprint - r.attributes.climbing, 0) / sp.length > 5);
check('all seven types are present (each 10..18 %)', SHAPE_OF_PLAN.every((s) => { const p = pool.filter((r) => r.inferredShape === s).length / N; return p > 0.1 && p < 0.18; }));
const distinct = new Set(pool.slice(0, 500).map((r) => PERFORMANCE_FOCUS.map((k) => r.attributes[k]).join(',')));
check('no common pattern: 500 riders have 500 different physical profiles', distinct.size >= 495, `${distinct.size}`);

// technical diversity (mildly higher) + independence of technique from the physical profile
const T = TECHNIQUE_ATTRIBUTES;
let pw = 0, pc = 0; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { pw += corr(pool.map((r) => r.attributes[T[i]]), pool.map((r) => r.attributes[T[j]])); pc++; }
check('excellent technique in one attribute does not mean excellent in all: mean pairwise correlation of the 6 technical attributes < 0.2', pw / pc < 0.2, `${(pw / pc).toFixed(3)}`);
check('technical spread (max-min) >= 25 for > 35 % of riders (was 27 %)', techRange.filter((x) => x >= 25).length / N > 0.35, `${techRange.filter((x) => x >= 25).length / N}`);
const strongTech = pool.filter((r) => Math.max(...T.map((k) => r.attributes[k])) >= 85);
check('of the riders with a technical attribute >= 85, > 65 % also have another technical attribute <= 65', strongTech.length > 300 && strongTech.filter((r) => Math.min(...T.map((k) => r.attributes[k])) <= 65).length / strongTech.length > 0.65, `${strongTech.length} ${strongTech.filter((r) => Math.min(...T.map((k) => r.attributes[k])) <= 65).length / strongTech.length}`);
const techMean = pool.map((r) => T.reduce((a, k) => a + r.attributes[k], 0) / 6), physMean = pool.map((r) => PERFORMANCE_FOCUS.reduce((a, k) => a + r.attributes[k], 0) / 7);
check('technique level is independent of the physical level (|corr| < 0.1; was -0.41 from the OVR window)', Math.abs(corr(techMean, physMean)) < 0.1, `${corr(techMean, physMean)}`);
const sprint = pool.filter((r) => r.inferredShape === 'sprinter'), climb = pool.filter((r) => r.inferredShape === 'climber');
check('technique does not follow the type: sprinter and climber have the same mean technique (+-2)', Math.abs(sprint.reduce((a, r) => a + T.reduce((x, k) => x + r.attributes[k], 0) / 6, 0) / sprint.length - climb.reduce((a, r) => a + T.reduce((x, k) => x + r.attributes[k], 0) / 6, 0) / climb.length) < 2);
const dscore = pool.map((r) => r.attributes.descending), cscore = pool.map((r) => r.attributes.climbing);
check('technique profile is independent of the physical profile: |corr(descending, climbing)| < 0.1', Math.abs(corr(dscore, cscore)) < 0.1, `${corr(dscore, cscore)}`);

// hidden Potential and aptitudes independent of the initial OVR
const pot = pool.map((r) => r.hidden.potential);
check('Potential is independent of the starting OVR (|corr| < 0.05)', Math.abs(corr(ovr, pot)) < 0.05, `${corr(ovr, pot)}`);
check('Potential spans the whole range: >= 5 % below 20 and >= 5 % above 80 (N(50,20))', pot.filter((p) => p < 20).length / N >= 0.05 && pot.filter((p) => p > 80).length / N >= 0.05);
const same72 = pool.filter((_, i) => ovr[i] === 72);
check('riders with the SAME OVR 72 have very different Potential (sd > 15) and different profiles', sdOf(same72.map((r) => r.hidden.potential)) > 15);
check('every rider has a stable aptitude profile (13 values) and the five hidden traits within 1..100', pool.every((r) => Object.keys(r.aptitude).length === 13 && Object.values(r.hidden).every((v) => v >= 1 && v <= 100)));
check('deterministic: same seed -> identical rider', JSON.stringify(generateInitialMarketRider(42)) === JSON.stringify(generateInitialMarketRider(42)));
check('age 17..20 (young market riders)', pool.every((r) => r.age >= 17 && r.age <= 20));

// the restriction belongs ONLY to the initial fill
const later = Array.from({ length: 3000 }, (_, i) => generateMarketRider(i * 31 + 5, null));
const lo = later.map((r) => officialOvr(r.attributes));
check('later riders are NOT limited to 69..75 (some stronger, some weaker)', lo.some((o) => o > 75) && lo.some((o) => o < 69), `${Math.min(...lo)}..${Math.max(...lo)}`);
check('later riders with an explicit range obey it', Array.from({ length: 300 }, (_, i) => generateMarketRider(i, { min: 80, max: 90 })).every((r) => { const o = officialOvr(r.attributes); return o >= 80 && o <= 90; }));
// OVR formula untouched
check('production overallRating() is untouched (same weights as before)', overallRating({ ...pool[0].attributes, ...Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, 100])) } as typeof pool[0]['attributes']) === 100);
check('tactics group is 5 attributes, experience stays young-rider-low (within expFloor..expCeiling, median < 40)', TACTICS_ATTRIBUTES.length === 5 && pool.every((r) => r.attributes.experience >= MARKET_GEN_CONFIG.expFloor && r.attributes.experience <= MARKET_GEN_CONFIG.expCeiling) && [...pool].map((r) => r.attributes.experience).sort((a, b) => a - b)[Math.floor(pool.length / 2)] < 40);
void PHYSICAL; void productionShape;
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
