/**
 * Rider State model 1.0 - targeted unit tests (A-C). Run: cd apps/web && npx tsx --tsconfig tsconfig.json src/lib/training/state/state.test.ts
 */
import { STATE_CONFIG as C, type StateRider } from './config';
import { catchUp, regen, dailyRegen, applyLoad, WEEK_SECONDS, growthFactorOfFitness, weeklyStimulus, fitnessWeek, formWeek, preparedness, coefficientsFromUniforms, declineOnset, trainingLoad } from './core';
import { performanceInputs, EXCLUDED_FROM_RACE_MATHS } from './contract';
import type { LoadEvent } from './core';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const mk = (o: Partial<StateRider> = {}): StateRider => ({ age: 24, vitality: 50, trainability: 50, professionalism: 50, recovery: 50, energyEff: 1, fatigueRes: 1, recoveryCoef: 1,
  energy: 100, fatigue: 0, form: 75, fitness: 75, fitnessPeak: 75, morale: 75, ...o });
const D = 86400, W = WEEK_SECONDS;
const noPlans = new Map<number, number>();
const plansFor = (n: number, u: number) => new Map(Array.from({ length: n }, (_, w) => [w, u] as [number, number]));
let evId = 0;
/** stages of week w on the given weekdays (0 = Monday) at 09:30 UTC */
const stageWeek = (w: number, days: number[], e = 16, f = 11): LoadEvent[] => days.map((d) => ({ id: ++evId, at: (7 * w + d) * D + 9.5 * 3600, energy: e, fatigue: f, raceUnits: C.stageReference.raceUnits }));
const near = (a: StateRider, b: StateRider, eps = 1e-9) => (['energy', 'fatigue', 'fitness', 'form', 'fitnessPeak'] as const).every((k) => Math.abs(a[k] - b[k]) < eps);

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
// 3-5 continuous time, order of events, idempotence
{
  const six = regen(mk({ energy: 50, fatigue: 50 }), 6 * 3600);
  check('6 hours after the reference day (+11 Energy / -8 Fatigue per 24 h) give +2.75 Energy and -2 Fatigue', Math.abs(six.energy - 52.75) < 1e-12 && Math.abs(six.fatigue - 48) < 1e-12);
  const sec = regen(mk({ energy: 50, fatigue: 50 }), 1), min = regen(mk({ energy: 50, fatigue: 50 }), 90 * 60);
  check('proportional down to seconds and minutes (1 s = 11/86400, 90 min = 0.6875)', Math.abs(sec.energy - 50 - 11 / 86400) < 1e-12 && Math.abs(min.energy - 50 - 0.6875) < 1e-12);
  check('regeneration split into any pieces equals one step (clamps included)', (() => { let r = mk({ energy: 90, fatigue: 5 }); const one = regen(r, 5 * 3600); for (let i = 0; i < 17; i++) r = regen(r, 5 * 3600 / 17); return near(r, one, 1e-9); })());
  const ev = stageWeek(0, [0, 2, 4]);
  const whole = catchUp(mk(), 0, 3 * W, { plans: plansFor(3, 1), events: ev });
  // split at arbitrary instants (profile loads in the middle of everything) must not change the result
  let part = { rider: mk(), lastAt: 0, weeks: [] as unknown[] }; const h = new Map<number, number>(); const app = new Set<number>();
  for (const t of [1234, 5 * 3600, 2 * D + 9.5 * 3600, 2 * D + 9.5 * 3600 + 1, 4.5 * D, W - 1, W, W + 17, 2 * W + 3 * D, 3 * W]) { const o = catchUp(part.rider, part.lastAt, t, { plans: plansFor(3, 1), events: ev }, h, app); part = { rider: o.rider, lastAt: o.lastAt, weeks: [...part.weeks, ...o.weeks] }; }
  check('reading the profile at arbitrary moments in between (incl. exact event and week-end instants) gives the same state as one pass', near(part.rider, whole.rider, 1e-9) && part.weeks.length === 3, JSON.stringify([part.rider.energy, whole.rider.energy]));
  const again = catchUp(whole.rider, whole.lastAt, whole.lastAt, { plans: plansFor(3, 1), events: ev }, new Map(), new Set(ev.map((e) => e.id)));
  check('loading the profile again at the same instant credits nothing (no double regeneration)', JSON.stringify(again.rider) === JSON.stringify(whole.rider) && again.weeks.length === 0);
  const m1 = catchUp(whole.rider, whole.lastAt, whole.lastAt + 60, { plans: noPlans, events: [] }, new Map(), new Set(ev.map((e) => e.id)));
  check('a reload one minute later credits exactly one minute of regeneration', near(m1.rider, regen(whole.rider, 60), 1e-12));
  // exact order: regeneration to the event time, then the load, then regeneration continues
  const start = mk({ energy: 99.8, fatigue: 5 });
  const load: LoadEvent = { id: ++evId, at: 3600, energy: 16, fatigue: 11, raceUnits: 0.25 };
  const o2 = catchUp(start, 0, 7200, { plans: noPlans, events: [load] });
  const manual = regen(applyLoad(regen(start, 3600), 16, 11), 3600);
  check('a stage at an exact time: regenerate to that instant (clamped at 100), apply the load once, regeneration continues', near(o2.rider, manual, 1e-12) && o2.rider.energy < 85);
  const bulk = applyLoad(regen(start, 7200), 16, 11);
  check('...which differs from "regenerate everything first, load afterwards"', Math.abs(bulk.energy - o2.rider.energy) > 0.3);
  const used = new Set<number>(); const first = catchUp(start, 0, 7200, { plans: noPlans, events: [load] }, new Map(), used);
  const second = catchUp(first.rider, 7200, 9000, { plans: noPlans, events: [load] }, new Map(), used);
  check('the load is applied exactly once (a second pass with the same event only regenerates)', near(second.rider, regen(first.rider, 1800), 1e-12) && used.has(load.id));
  const late = catchUp(mk({ energy: 80 }), 5000, 6000, { plans: noPlans, events: [{ id: ++evId, at: 100, energy: 16, fatigue: 11, raceUnits: 0.25 }] });
  check('a load reported late (its time already passed) is applied once, at the cursor', near(late.rider, regen(applyLoad(mk({ energy: 80 }), 16, 11), 1000), 1e-12));
  // A stage that arrives AFTER its week was evaluated is DEFERRED: not applied, not counted, never moved into another week.
  {
    const base: LoadEvent = { id: 9001, at: 2 * D, energy: 16, fatigue: 11, raceUnits: 0.25 };
    const lateEv: LoadEvent = { id: 9002, at: 3 * D, energy: 16, fatigue: 11, raceUnits: 0.25 };           // belongs to week 0, reported during week 2
    const h = new Map<number, number>(), app = new Set<number>(), def = new Set<number>(), ss = new Map<number, { n: number; sum: number }>();
    const a = catchUp(mk(), 0, 2 * W + D, { plans: noPlans, events: [base] }, h, app, ss, def);
    const week0 = a.weeks.find((w) => w.week === 0)!;
    const b = catchUp(a.rider, a.lastAt, 3 * W + 5 * 3600, { plans: noPlans, events: [base, lateEv] }, h, app, ss, def);
    const without = catchUp(a.rider, a.lastAt, 3 * W + 5 * 3600, { plans: noPlans, events: [base] }, new Map(h), new Set(app), new Map(ss), new Set());
    check('late stage: it is marked deferred (not applied)', def.has(9002) && !app.has(9002));
    check('late stage: the result is IDENTICAL to a world where it never arrived (no Energy/Fatigue, no race units, no Fitness/Form change)', JSON.stringify(b.rider) === JSON.stringify(without.rider) && b.weeks.every((w, i) => w.raceUnits === without.weeks[i].raceUnits));
    check('late stage: week 0 keeps its own stage; the weeks after have no race units from it', week0.raceUnits === 0.25 && b.weeks.every((w) => w.raceUnits === 0));
    const c = catchUp(b.rider, b.lastAt, b.lastAt + 3600, { plans: noPlans, events: [base, lateEv] }, h, app, ss, def);
    check('late stage: a repeated pass adds nothing but regeneration and the stage stays deferred', near(c.rider, regen(b.rider, 3600), 1e-12) && c.weeks.length === 0 && def.has(9002) && !app.has(9002));
    const ap2 = new Set<number>(), df2 = new Set<number>();
    const inWeek = catchUp(mk({ energy: 50 }), W + 2 * D, W + 3 * D, { plans: noPlans, events: [{ id: 9003, at: W + D, energy: 16, fatigue: 11, raceUnits: 0.25 }] }, new Map(), ap2, new Map(), df2);
    check('a stage reported late but still INSIDE its own open week is not deferred: it is applied once (at the cursor)', ap2.has(9003) && !df2.has(9003) && inWeek.weeks.length === 0);
  }
  // offline rider at the start of a stage
  const offline = catchUp(mk({ energy: 30, fatigue: 70 }), 0, 4 * D + 9 * 3600, { plans: noPlans, events: [] }).rider;
  check('an offline rider arrives at the stage start (4 days later) with the regenerated state: Energy 30 + 4.375 days x 11, capped at 100', offline.energy === 78.125 + 0 || Math.abs(offline.energy - Math.min(100, 30 + 11 * 4.375)) < 1e-9);
  const evAfter: LoadEvent = { id: ++evId, at: 4 * D + 12 * 3600, energy: 16, fatigue: 11, raceUnits: 0.25 };
  const atStart = catchUp(mk({ energy: 30, fatigue: 70 }), 0, 4 * D + 9 * 3600, { plans: noPlans, events: [evAfter] });
  const afterStage = catchUp(atStart.rider, atStart.lastAt, 4 * D + 13 * 3600, { plans: noPlans, events: [evAfter] });
  check('stage starts at 09:00 with the correct state; its load (12:00) is applied once and regeneration goes on until 13:00', near(afterStage.rider, regen(applyLoad(regen(atStart.rider, 3 * 3600), 16, 11), 3600), 1e-12));
  check('a week without a plan processes no training load, regeneration still runs', catchUp(mk({ energy: 60 }), 0, W, { plans: noPlans, events: [] }).rider.energy === 100);
  // week boundary ordering
  const atEnd: LoadEvent = { id: ++evId, at: W, energy: 16, fatigue: 11, raceUnits: 0.25 };
  const bo = catchUp(mk(), 0, 2 * W, { plans: noPlans, events: [atEnd] });
  check('a stage exactly at the week boundary belongs to the NEW week (week 0 has no race units, week 1 has)', bo.weeks[0].raceUnits === 0 && bo.weeks[1].raceUnits === 0.25);
  const training = catchUp(mk({ energy: 100, fatigue: 0 }), 0, W + 1, { plans: new Map([[0, 1]]), events: [] });
  check('the weekly training load is applied at the instant the week ends (Monday 00:00 UTC), before the weekly evaluation', training.weeks[0].trainingUnits === 1 && training.weeks[0].energyEnd < 100 && Math.abs(training.weeks[0].energyEnd - (100 - C.training.energyPerUnit)) < 1e-9);
}
// 6 calendars
{
  const week = (days: number[], n = 6) => catchUp(mk(), 0, n * W, { plans: noPlans, events: Array.from({ length: n }, (_, w) => stageWeek(w, days)).flat() }).rider;
  const rookie = week([0, 2, 4]), amateur = week([0, 1, 3, 4]), elite = week([0, 1, 2, 3, 4]), six = week([0, 1, 2, 3, 4, 5]);
  const monotone = rookie.energy >= amateur.energy && amateur.energy >= elite.energy && elite.energy >= six.energy;
  check('Rookie (Mon/Wed/Fri), 4-stage leagues (Mon/Tue/Thu/Fri), Elite (Mon-Fri) and a 6-stage Tour all run on the same loop; more stages -> lower Energy', monotone && rookie.energy > 90 && six.energy < elite.energy, [rookie, amateur, elite, six].map((r) => r.energy.toFixed(1)).join(' '));
  check('a regular Elite rider (5 stages a week, no training) keeps a sustainable state (Energy > 20 after 6 weeks)', elite.energy > 20 && elite.fatigue < 80, `${elite.energy} ${elite.fatigue}`);
}
// 7-10 fitness
const weeks = (r: StateRider, n: number, units: number, stages: number[] = []) => catchUp(r, 0, n * W, { plans: plansFor(n, units), events: Array.from({ length: n }, (_, w) => stageWeek(w, stages)).flat() }).rider;
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
  const rested = (n: number) => { let r = mk({ fitness: 75, fitnessPeak: 75, form: 75 }); return catchUp(r, 0, n * W, { plans: noPlans, events: [] }).rider; };
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
  check('Morale and OVR are untouched by the A-C state loop', catchUp(mk({ morale: 83 }), 0, 6 * W, { plans: plansFor(6, 1), events: [] }).rider.morale === 83);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
