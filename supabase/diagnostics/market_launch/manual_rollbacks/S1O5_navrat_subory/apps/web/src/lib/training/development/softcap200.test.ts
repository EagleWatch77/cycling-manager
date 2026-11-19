/**
 * Working model S1 + O5 (cap 80 + 150 x (Pot/100)^2 + youth floor; owner 2026-11-19, NOT deployed): above Potential ~89 the formula exceeds 200.
 * Checks that no attribute can ever pass the hard maximum 200, that the soft cap still bites where it is below 200,
 * and what happens to riders that START above their individual ceiling (low Potential).
 * Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/softcap200.test.ts
 */
import { PERFORMANCE_FOCUS } from '../config';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { generateLaunchMarket } from './launchMarket';
import { SHAPE_OF_PLAN, DEV_CONFIG, type DevRider, type DevelopmentConfig } from './config';
import { effectiveCap, softCap, weeklyTraining } from './core';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const CAND: DevelopmentConfig = { ...DEV_CONFIG }; // = S1 + O5 (the working model)

const capsAt = [20, 50, 75, 90, 95, 100].map((p) => Math.round(softCap(p, CAND))).join();
check('cap values (S1+O5 OFF, slope 1.25): Pot 20/50/75/90/95/100 = 85/111/150/181/193/205 (before the hard maximum)', capsAt === '85,111,150,181,193,205', capsAt);
check('hard maximum is 200', DEV_CONFIG.maxAttribute === 200);

// 1. strongest possible rider: Potential 100, best aptitude, top trainability/professionalism, attributes start just below 200, 600 weeks of full training
const mk = (pot: number, start: number, apt: number, shape = 0): DevRider => ({ age: 20, shape, attrs: Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, start])) as Record<SkillAttribute, number>, progress: {}, decline: {}, energy: 100, fatigue: 0,
  hidden: { potential: pot, trainability: 100, professionalism: 100, recovery: 100, vitality: 100 } as DevRider['hidden'], aptitude: Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, apt])) as DevRider['aptitude'] });
/** the rider ages one year per 5 training weeks (calendar v2: odd weeks), starting at age 20 */
function trainWeeks(r0: DevRider, weeks: number, cfg: DevelopmentConfig): DevRider {
  let r = r0; for (let w = 0; w < weeks; w++) r = weeklyTraining({ ...r, energy: 100, fatigue: 0, age: 20 + Math.floor(w / 5) }, { planId: r.shape, mode: 'full' }, cfg).rider; return r;
}
const top = trainWeeks(mk(100, 150, 1), 600, CAND);
const maxAttr = Math.max(...SKILL_ATTRIBUTES.map((k) => top.attrs[k]));
check('Potential 100, aptitude +1, 600 weeks: NO attribute above 200', maxAttr <= 200, `max ${maxAttr}`);
check('... and the plan attributes actually reach 200 exactly (the hard stop, not a soft one)', PERFORMANCE_FOCUS.filter((k) => top.attrs[k] === 200).length >= 1, PERFORMANCE_FOCUS.map((k) => top.attrs[k]).join());
check('effective ceiling of a Potential 95-100 plan attribute is above 200 (formula) but the attribute still stops at 200', effectiveCap(top, PERFORMANCE_FOCUS[0], CAND) > 200);
// mutation check: with a (wrong) maximum of 250 the same test must show attributes above 200, i.e. the guard above really is the hard maximum
const mutant = trainWeeks(mk(100, 150, 1), 600, { ...CAND, maxAttribute: 250 });
check('mutation check: with maximum 250 attributes pass 200 (so the 200 guard is what stops them)', Math.max(...SKILL_ATTRIBUTES.map((k) => mutant.attrs[k])) > 200);
// non-negative / finite
check('no NaN, attributes are whole numbers', SKILL_ATTRIBUTES.every((k) => Number.isInteger(top.attrs[k])));

// 2. soft cap below 200 still bites. A career is ~18 seasons x 5 training weeks (calendar v2) = 90 training weeks, full mode every week.
const CAREER = 90;
const mid = trainWeeks(mk(60, 100, 0), CAREER, CAND), midCap = effectiveCap(mid, PERFORMANCE_FOCUS[0], CAND);
check(`Potential 60: a plan attribute (ceiling ${midCap.toFixed(0)}) ends a full career within the soft band (<= ceiling + 20; ideal rider: Trainability/Professionalism 100, full mode every week)`, mid.attrs[PERFORMANCE_FOCUS[0]] <= midCap + 20 && mid.attrs[PERFORMANCE_FOCUS[0]] >= midCap - 25, `${mid.attrs[PERFORMANCE_FOCUS[0]]}`);
const OLD: DevelopmentConfig = { ...DEV_CONFIG, capSlope: 1.25, youthRoomFloor: 0 };
const midOld = trainWeeks(mk(60, 100, 0), CAREER, OLD);
console.log(`  info  same rider with the PREVIOUS slope 1.25 and no youth floor: ceiling ${effectiveCap(midOld, PERFORMANCE_FOCUS[0], OLD).toFixed(0)}, attribute after a full career ${midOld.attrs[PERFORMANCE_FOCUS[0]]} (the soft overshoot is the existing model's behaviour, not new)`);
const midLong = trainWeeks(mk(60, 100, 0), 600, CAND);
console.log(`  info  soft means soft: after an unrealistic 600 weeks the same attribute creeps to ${midLong.attrs[PERFORMANCE_FOCUS[0]]} (ceiling ${midCap.toFixed(0)}); after a full career (90 weeks) it is ${mid.attrs[PERFORMANCE_FOCUS[0]]}`);
const weakRider = trainWeeks(mk(95, 100, 0), CAREER, CAND);
const weakVals = PERFORMANCE_FOCUS.map((k) => ({ k, v: weakRider.attrs[k], cap: effectiveCap(weakRider, k, CAND) }));
check('Potential 95, full career: attributes whose ceiling is below 200 end within the soft band (<= ceiling + 20), none above 200', weakVals.filter((x) => x.cap < 200).every((x) => x.v <= x.cap + 20) && weakVals.every((x) => x.v <= 200), weakVals.map((x) => `${x.v}/${x.cap.toFixed(0)}`).join(' '));

// 3. riders that START above their individual ceiling (launch market, approved Potential bands)
const pool = generateLaunchMarket();
const asDev = (m: (typeof pool)[number]): DevRider => ({ age: m.age, shape: SHAPE_OF_PLAN.indexOf(m.inferredShape as never), attrs: { ...m.attributes }, progress: {}, decline: {}, energy: 100, fatigue: 0, hidden: m.hidden, aptitude: m.aptitude });
const band = (p: number) => (p <= 39 ? 'Pot 1-39' : p <= 59 ? 'Pot 40-59' : p <= 74 ? 'Pot 60-74' : 'Pot 75+');
const stats: Record<string, { pairs: number; above: number; gap: number[]; gained: number; lowered: number; riders: number }> = {};
for (const m of pool) {
  const r0 = asDev(m), b = band(m.hidden.potential); const s = (stats[b] ??= { pairs: 0, above: 0, gap: [], gained: 0, lowered: 0, riders: 0 }); s.riders++;
  const r1 = trainWeeks(r0, 36, CAND); // 36 weeks = 4 seasons of full training
  for (const k of PERFORMANCE_FOCUS) { s.pairs++; const g = r0.attrs[k] - effectiveCap(r0, k, CAND); if (g > 0) { s.above++; s.gap.push(g); } s.gained += r1.attrs[k] - r0.attrs[k]; if (r1.attrs[k] < r0.attrs[k]) s.lowered++; }
}
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0);
for (const [b, s] of Object.entries(stats).sort()) console.log(`  info  ${b}: ${s.riders} riders | attribute above its own ceiling at the start: ${(100 * s.above / s.pairs).toFixed(0)} % (median excess ${med(s.gap).toFixed(0)}) | mean performance points gained per rider (7 attributes) in 36 training weeks (~7 seasons) of full training: ${(s.gained / s.riders).toFixed(1)}`);
check('training NEVER lowers an attribute that starts above its ceiling', Object.values(stats).every((s) => s.lowered === 0));
const low = stats['Pot 1-39'], high = stats['Pot 75+'];
check('low Potential riders gain far less than high Potential riders (no room, by design)', !!low && !!high && low.gained / low.riders < 0.5 * (high.gained / high.riders), `${low && (low.gained / low.riders).toFixed(1)} vs ${high && (high.gained / high.riders).toFixed(1)}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
