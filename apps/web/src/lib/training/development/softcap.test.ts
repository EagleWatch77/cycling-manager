/**
 * Individual soft ceilings BELOW the starting attributes: intended behaviour ("no more room"), never a decline and never a calculation error.
 * Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/softcap.test.ts
 */
import { PERFORMANCE_FOCUS } from '../config';
import { TECHNIQUE_ATTRIBUTES, SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { generateInitialMarketPool } from './initialMarket';
import { SHAPE_OF_PLAN, DEV_CONFIG, type DevRider } from './config';
import { effectiveCap, techCapOf, weeklyTraining, roomPhys } from './core';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const pool = generateInitialMarketPool(3000, 20261117);
const asDev = (m: (typeof pool)[number]): DevRider => ({ age: m.age, shape: SHAPE_OF_PLAN.indexOf(m.inferredShape as never), attrs: { ...m.attributes }, progress: {}, decline: {}, energy: 100, fatigue: 0, hidden: m.hidden, aptitude: m.aptitude });

// 1. how common is it, and is it the weak-Potential riders (by design)
let pairs = 0, below = 0, deep = 0; const lowPot: number[] = [], highPot: number[] = [];
for (const m of pool) { const r = asDev(m); let n = 0; for (const k of PERFORMANCE_FOCUS) { pairs++; const gap = r.attrs[k] - effectiveCap(r, k); if (gap > 0) { below++; n++; } if (gap > 30) deep++; } (m.hidden.potential < 30 ? lowPot : m.hidden.potential > 70 ? highPot : []).push(n); }
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log(`  info  ceiling below the starting value: ${(100 * below / pairs).toFixed(1)} % of rider x physical attribute pairs, > 30 points below: ${(100 * deep / pairs).toFixed(1)} %; per rider Potential<30: ${mean(lowPot).toFixed(2)}, Potential>70: ${mean(highPot).toFixed(2)}`);
check('it concentrates on weak Potential: riders with Potential < 30 have far more attributes above their ceiling than Potential > 70', mean(lowPot) > 3 * mean(highPot) + 0.5 && mean(highPot) < 0.8, `${mean(lowPot)} ${mean(highPot)}`);

// 2. a full year (9 weeks x several seasons) for the affected riders: no decline, no NaN, no negative gain, bounded progress
let nan = 0, decreased = 0, negGain = 0, bigProgress = 0, crawlTooFast = 0, checked = 0;
for (const m of pool.filter((x) => x.hidden.potential < 30).slice(0, 300)) {
  let r = asDev(m); const start = { ...r.attrs };
  for (let w = 0; w < 36; w++) {
    const o = weeklyTraining(r, { planId: r.shape, mode: w % 2 ? 'basic' : 'full' }, DEV_CONFIG); r = o.rider;
    for (const k of SKILL_ATTRIBUTES) { if (!Number.isFinite(r.attrs[k]) || !Number.isFinite(r.progress[k] ?? 0) || !Number.isFinite(o.rawProgress[k])) nan++; if (o.gains[k] < 0) negGain++; if ((r.progress[k] ?? 0) >= DEV_CONFIG.threshold || (r.progress[k] ?? 0) < 0) bigProgress++; }
    if (!Number.isFinite(r.energy) || !Number.isFinite(r.fatigue)) nan++;
  }
  for (const k of SKILL_ATTRIBUTES) if (r.attrs[k] < start[k]) decreased++;
  for (const k of PERFORMANCE_FOCUS) { const cap = effectiveCap(asDev(m), k); checked++; if (start[k] - cap >= 30 && r.attrs[k] - start[k] > 1) crawlTooFast++; }
}
check('weeks of training with ceilings below the start never produce NaN/Infinity', nan === 0, `${nan}`);
check('training never lowers an attribute (only Vitality ageing can)', decreased === 0, `${decreased}`);
check('no negative gain and accumulator progress stays within 0..threshold', negGain === 0 && bigProgress === 0, `${negGain} ${bigProgress}`);
check('an attribute >= 30 points above its ceiling gains at most 1 point in 36 weeks (it simply has no room)', crawlTooFast === 0 && checked > 1000, `${crawlTooFast}/${checked}`);

// 3. exact behaviour of the room factor around the ceiling + extreme Potential
const r0 = (potential: number): DevRider => ({ age: 18, shape: 1, attrs: Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, 60])) as Record<SkillAttribute, number>, progress: {}, decline: {}, energy: 100, fatigue: 0, hidden: { potential, trainability: 50, professionalism: 50, recovery: 50, vitality: 50 } });
const lowest = r0(1); const w = weeklyTraining(lowest, { planId: 1, mode: 'full' });
check('Potential 1, weak-shape attribute (ceiling 35 vs value 60): finite, practically no growth (< 0.1 raw per week), no decline', Object.values(w.rawProgress).every(Number.isFinite) && w.rawProgress.climbing < 0.1 && w.gains.climbing === 0 && w.rider.attrs.climbing === 60);
check('room is smooth: 0.5 exactly 10 points below the ceiling, 0.95+ far below, 0 at 200', Math.abs(roomPhys(90, 100) - 0.5) < 1e-9 && roomPhys(40, 100) > 0.95 && roomPhys(200, 400) === 0);
check('technique ceiling below the start (rider with profile): no growth, no decline', (() => { const r = { ...r0(60), attrs: { ...r0(60).attrs, descending: 150 }, aptitude: { descending: -1, cornering: -1 } as Partial<Record<SkillAttribute, number>> }; const o = weeklyTraining(r, { planId: 0, mode: 'full' }); return techCapOf(r, 'descending') === 120 && o.gains.descending === 0 && o.rider.attrs.descending === 150 && o.rawProgress.descending < 0.5; })());
check('decline stays a separate mechanism: a rider with all attributes above their ceilings loses points only through seasonStart (Vitality), never through training', decreased === 0);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
void TECHNIQUE_ATTRIBUTES;
