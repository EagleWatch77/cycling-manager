/**
 * Rider State model 1.0 - targeted unit tests (A-C). Run: cd apps/web && npx tsx --tsconfig tsconfig.json src/lib/training/state/state.test.ts
 */
import { STATE_CONFIG as C, type StateRider } from './config';
import { catchUp, dailyRegen, applyLoad, growthFactorOfFitness, weeklyStimulus, fitnessWeek, formWeek, preparedness, coefficientsFromUniforms, declineOnset, trainingLoad } from './core';
import { performanceInputs, EXCLUDED_FROM_RACE_MATHS } from './contract';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const mk = (o: Partial<StateRider> = {}): StateRider => ({ age: 24, vitality: 50, trainability: 50, professionalism: 50, recovery: 50, energyEff: 1, fatigueRes: 1, recoveryCoef: 1,
  energy: 100, fatigue: 0, form: 75, fitness: 75, fitnessPeak: 75, morale: 75, ...o });
const noPlans = new Map<number, number>();
/** weeks 0..n-1; Sunday of week w = day 7w+6 */
const sunday = (w: number) => 7 * w + 6;
const plansFor = (n: number, u: number) => new Map(Array.from({ length: n }, (_, w) => [sunday(w), u] as [number, number]));
const stageWeek = (w: number, days: number[], e = 16, f = 11) => days.map((d) => ({ day: 7 * w + d, energy: e, fatigue: f, raceUnits: C.stageReference.raceUnits }));

// 1-2 individual coefficients
{
  const a = applyLoad(mk({ energyEff: 0.7, fatigueRes: 0.7 }), 16, 11), b = applyLoad(mk({ energyEff: 1.3, fatigueRes: 1.3 }), 16, 11);
  check('same load: economical rider spends less Energy, fatigue-resistant rider gathers less Fatigue', a.energy > b.energy && a.fatigue < b.fatigue && Math.abs((100 - a.energy) - 16 * 0.7) < 1e-9);
  const x = dailyRegen(mk({ energy: 50, fatigue: 50, recoveryCoef: 0.9 })), y = dailyRegen(mk({ energy: 50, fatigue: 50, recoveryCoef: 1.1 }));
  check('same Recovery, different individual coefficient: different recovery', y.energy > x.energy && y.fatigue < x.fatigue);
  const ref = dailyRegen(mk({ energy: 50, fatigue: 50, recovery: 50 }));
  check('reference: Recovery 50 -> +11 Energy, -8 Fatigue', Math.abs(ref.energy - 61) < 1e-9 && Math.abs(ref.fatigue - 42) < 1e-9);
  const pts = [25, 75, 100].map((rec) => dailyRegen(mk({ energy: 0, fatigue: 100, recovery: rec })));
  check('reference: Recovery 25 / 75 / 100 -> about +10/-7, +12/-9, +13/-10', [10, 12, 13].every((e, i) => Math.abs(pts[i].energy - e) < 1e-9) && [7, 9, 10].every((f, i) => Math.abs(100 - pts[i].fatigue - f) < 1e-9));
  const hi = dailyRegen(mk({ energy: 99, fatigue: 1 }));
  check('regeneration never goes above 100 Energy or below 0 Fatigue', hi.energy === 100 && hi.fatigue === 0);
}
// 3-5 idempotence, offline, chronology
{
  const ev = stageWeek(0, [0, 2, 4]);
  const once = catchUp(mk(), -1, 20, { plans: plansFor(3, 1), events: ev });
  const again = catchUp(once.rider, once.lastDay, 20, { plans: plansFor(3, 1), events: ev });
  check('running the catch-up again for the same days changes nothing (idempotent via lastDay)', JSON.stringify(again.rider) === JSON.stringify(once.rider) && again.weeks.length === 0);
  const step = (() => { let r = mk(); let last = -1; const h = new Map<number, number>(); for (let d = 0; d <= 20; d++) { const o = catchUp(r, last, d, { plans: plansFor(3, 1), events: ev }, h); r = o.rider; last = o.lastDay; } return r; })();
  check('offline for 21 days gives the same state as visiting every day (same chronological loop)', JSON.stringify(step) === JSON.stringify(once.rider));
  // wrong (bulk) order: all regeneration first, then the loads -> must differ from the chronological result for a tired rider
  let bulk = mk({ energy: 40, fatigue: 60 }); for (let d = 0; d < 7; d++) bulk = dailyRegen(bulk); bulk = applyLoad(bulk, 16 * 3, 11 * 3);
  const chrono = catchUp(mk({ energy: 40, fatigue: 60 }), -1, 6, { plans: noPlans, events: [0, 1, 2].map((d) => ({ day: d, energy: 16, fatigue: 11, raceUnits: 0.25 })) }).rider;
  check('chronological order differs from "regenerate everything first, load afterwards" (clamps make the order matter)', Math.abs(bulk.energy - chrono.energy) > 1);
  check('a week without a plan processes no training load, regeneration still runs', catchUp(mk({ energy: 60 }), -1, 6, { plans: noPlans, events: [] }).rider.energy === 100);
}
// 6 calendars
{
  const week = (days: number[], n = 6) => catchUp(mk(), -1, 7 * n - 1, { plans: noPlans, events: Array.from({ length: n }, (_, w) => stageWeek(w, days)).flat() }).rider;
  const rookie = week([0, 2, 4]), amateur = week([0, 1, 3, 4]), elite = week([0, 1, 2, 3, 4]), six = week([0, 1, 2, 3, 4, 5]);
  const monotone = rookie.energy >= amateur.energy && amateur.energy >= elite.energy && elite.energy >= six.energy;
  check('Rookie (Mon/Wed/Fri), 4-stage leagues (Mon/Tue/Thu/Fri), Elite (Mon-Fri) and a 6-stage Tour all run on the same loop; more stages -> lower Energy', monotone && rookie.energy > 90 && six.energy < elite.energy, [rookie, amateur, elite, six].map((r) => r.energy.toFixed(1)).join(' '));
  check('a regular Elite rider (5 stages a week, no training) keeps a sustainable state (Energy > 20 after 6 weeks)', elite.energy > 20 && elite.fatigue < 80, `${elite.energy} ${elite.fatigue}`);
}
// 7-10 fitness
const weeks = (r: StateRider, n: number, units: number, stages: number[] = []) => catchUp(r, -1, 7 * n - 1, { plans: plansFor(n, units), events: Array.from({ length: n }, (_, w) => stageWeek(w, stages)).flat() }).rider;
{
  const young = weeks(mk({ age: 19, fitness: 70, fitnessPeak: 70 }), 12, 1), older = weeks(mk({ age: 28, fitness: 70, fitnessPeak: 70 }), 12, 1);
  check('a young rider develops Fitness faster than a 28-year-old with the same plan', young.fitness - 70 > 1.5 * (older.fitness - 70) && young.fitness > 70, `${young.fitness} ${older.fitness}`);
  const thirty = weeks(mk({ age: 30, vitality: 75, fitness: 82, fitnessPeak: 82, recovery: 70 }), 20, C.training.unitsBasic, [0, 2, 4]);
  check('a 30-year-old with regular races and Basic training maintains Fitness (before his decline starts, Vitality 75)', declineOnset(75) > 30 && thirty.fitness >= 81.5, String(thirty.fitness));
  const neverRaces = weeks(mk({ age: 30, vitality: 75, fitness: 82, fitnessPeak: 82 }), 20, 0);
  check('...while a 30-year-old without any training or racing loses Fitness', neverRaces.fitness < 80, String(neverRaces.fitness));
  check('Fitness growth factor ((100-K)/20)^2: 70 -> 2.25, 80 -> 1, 85 -> .5625, 90 -> .25, 95 -> .0625, 98 -> .01', [[70, 2.25], [80, 1], [85, 0.5625], [90, 0.25], [95, 0.0625], [98, 0.01]].every(([k, f]) => Math.abs(growthFactorOfFitness(k) - f) < 1e-12));
  const gain = (k: number) => fitnessWeek(mk({ fitness: k, fitnessPeak: k }), 0.8) - k;
  check('at Fitness 90 growth is far slower than at 80, at 95 extremely slow', gain(90) < 0.4 * gain(80) && gain(95) < 0.08 * gain(80), `${gain(80)} ${gain(90)} ${gain(95)}`);
  let k = mk({ age: 20, fitness: 90, fitnessPeak: 90, trainability: 95, professionalism: 95, vitality: 90 }); k = weeks(k, 400, 1, [0, 2]);
  check('100 is practically unreachable even after 400 weeks of ideal full training + two stages a week (no artificial cap)', k.fitness < 99.5 && k.fitness > 95, String(k.fitness));
  // regaining lost Fitness vs creating a new maximum
  const lost = weeks(mk({ age: 30, vitality: 75, fitness: 82, fitnessPeak: 91 }), 10, 1, [0, 2, 4]);
  const fresh = weeks(mk({ age: 30, vitality: 75, fitness: 82, fitnessPeak: 82 }), 10, 1, [0, 2, 4]);
  check('a rider who lost Fitness (peak 91, now 82) comes back faster than one with the same level whose 82 is his maximum', lost.fitness - 82 > 1.5 * (fresh.fitness - 82), `${lost.fitness} ${fresh.fitness}`);
  check('...and advanced age slows the comeback (low Vitality, 36 years)', weeks(mk({ age: 36, vitality: 20, fitness: 82, fitnessPeak: 91 }), 10, 1, [0, 2, 4]).fitness - 82 < lost.fitness - 82);
  check('five stages do not give five times the stimulus of one stage (diminishing returns) and the weekly Fitness gain stays below 1 point', (() => { const g = (n: number) => fitnessWeek(mk({ fitness: 70, fitnessPeak: 70 }), weeklyStimulus(n * 0.25, 60, 40)) - 70; return weeklyStimulus(1.25, 60, 40) / weeklyStimulus(0.25, 60, 40) < 4 && g(5) > g(1) && g(5) < 1.0; })());
  check('overload (Fatigue 90) turns the week into a Fitness loss instead of a gain', fitnessWeek(mk({ fatigue: 90, energy: 10, fitness: 85, fitnessPeak: 85 }), weeklyStimulus(2, 10, 90)) < 85);
}
// 11-12 form
{
  const rested = (n: number) => { let r = mk({ fitness: 75, fitnessPeak: 75, form: 75 }); return catchUp(r, -1, 7 * n - 1, { plans: noPlans, events: [] }).rider; };
  check('an ordinary rested rider without any training or racing gets nowhere near Form 95-100 (and rest alone does not build peak Form)', rested(12).form < 75, String(rested(12).form));
  const prepared = weeks(mk({ fitness: 80, fitnessPeak: 80, form: 75 }), 12, 1, [0, 2, 4]);
  check('a regular, trained rider of Fitness ~80 sits in the normal-to-good Form band (72-90), nowhere near 95', prepared.form >= 72 && prepared.form < 90, String(prepared.form));
  const base = (stim: [number, number, number], over: Partial<StateRider> = {}) => formWeek(mk({ fitness: 85, fitnessPeak: 85, ...over }), preparedness(stim)).target;
  check('three-week preparation matters: same Fitness/Energy/Fatigue, better preparation -> higher Form', base([0.9, 0.9, 0.9]) > base([0.2, 0.2, 0.2]) + 3);
  check('Form reacts to overload: high Fatigue / low Energy lowers it', formWeek(mk({ fitness: 85, energy: 30, fatigue: 80 }), 80).target < formWeek(mk({ fitness: 85 }), 80).target - 10);
  check('Form ~90 means an excellently prepared rider (Fitness 85, full Energy, no Fatigue, preparedness 90 -> 90+) and 95+ needs Fitness 90+', (() => { const t = formWeek(mk({ fitness: 85 }), 90).target; const t2 = formWeek(mk({ fitness: 85 }), 60).target; const top = formWeek(mk({ fitness: 94 }), 98).target; return t >= 89.5 && t < 95 && t2 < 88 && top >= 95; })());
  check('Form smoothing moves only part of the way each week', Math.abs(formWeek(mk({ form: 60, fitness: 90 }), 90).form - 60) < Math.abs(formWeek(mk({ form: 60, fitness: 90 }), 90).target - 60));
  // taper: a prepared rider reduces to Basic before the Tour and peaks without losing Fitness
  let r = weeks(mk({ fitness: 84, fitnessPeak: 84, form: 75 }), 8, 1, [0, 2, 4]);
  const afterTaper = weeks({ ...r }, 2, C.training.unitsBasic, [0, 2, 4]);
  check('a rider prepared for weeks keeps Fitness through a Basic taper', afterTaper.fitness >= r.fitness - 0.5, `${r.fitness} ${afterTaper.fitness}`);
}
// 13 coefficients and contract
{
  const lo = coefficientsFromUniforms([0, 0, 0, 0, 0, 0]), hi = coefficientsFromUniforms([0.9999, 0.9999, 0.9999, 0.9999, 0.9999, 0.9999]);
  check('coefficients stay inside 0.70-1.30 / 0.70-1.30 / 0.90-1.10 and are a pure function of their inputs', Math.abs(lo.energyEff - 0.7) < 1e-9 && hi.energyEff < 1.3 && Math.abs(lo.recoveryCoef - 0.9) < 1e-9 && hi.recoveryCoef < 1.1 && JSON.stringify(coefficientsFromUniforms([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])) === JSON.stringify(coefficientsFromUniforms([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])));
  check('energy and fatigue coefficients are independent (different uniforms -> different values)', coefficientsFromUniforms([0.1, 0.1, 0.9, 0.9, 0.5, 0.5]).energyEff < 0.9 && coefficientsFromUniforms([0.1, 0.1, 0.9, 0.9, 0.5, 0.5]).fatigueRes > 1.1);
  const pi = performanceInputs(mk({ form: 99, fitness: 70 }), 50);
  check('race contract: Form and OVR are NOT race inputs (no double counting); Energy, Fatigue, Fitness, preparedness, Morale are', !('form' in pi) && EXCLUDED_FROM_RACE_MATHS.includes('form') && EXCLUDED_FROM_RACE_MATHS.includes('ovr') && pi.fitness === 70);
  check('training load has no recovery days inside any more: Full / Basic differ only in load', trainingLoad(C.training.unitsFull).energy > trainingLoad(C.training.unitsBasic).energy && trainingLoad(0).energy === 0);
  check('Morale and OVR are untouched by the A-C state loop', catchUp(mk({ morale: 83 }), -1, 40, { plans: plansFor(6, 1), events: [] }).rider.morale === 83);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
