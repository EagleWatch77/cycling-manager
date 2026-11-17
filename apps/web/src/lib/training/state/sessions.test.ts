/**
 * Training sessions (Full Tue/Thu/Sat, Basic Tue/Fri at 12:00 UTC) inside the Rider State loop: load at the exact time, equal parts, individual
 * coefficients per session, readiness measured before each session, offline catch-up in any pieces, race weeks without training, long offline.
 * Run: cd apps/web && npx tsx --tsconfig tsconfig.json src/lib/training/state/sessions.test.ts
 */
import { STATE_CONFIG as C, type StateRider } from './config';
import { catchUp, regen, applyLoad, trainingLoad, sessionTimes, sessionDaysOf, WEEK_SECONDS, type DayInputs, type LoadEvent, type WeekRecord } from './core';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const mk = (o: Partial<StateRider> = {}): StateRider => ({ age: 24, vitality: 50, trainability: 50, professionalism: 50, recovery: 50, energyEff: 1, fatigueRes: 1, recoveryCoef: 1,
  energy: 100, fatigue: 0, form: 75, fitness: 75, fitnessPeak: 75, morale: 75, ...o });
const D = 86400, W = WEEK_SECONDS, H = 3600;
const close = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;
const full = { units: C.training.unitsFull, days: sessionDaysOf('full') }, basic = { units: C.training.unitsBasic, days: sessionDaysOf('basic') };
const inputs = (plans: [number, DayInputs['plans'] extends ReadonlyMap<number, infer P> ? P : never][], events: LoadEvent[] = []): DayInputs => ({ plans: new Map(plans), events });

// 1. the agreed schedule and the equal parts
check('Full sessions are Tue, Thu, Sat; Basic Tue, Fri; all at 12:00 UTC', sessionDaysOf('full').join() === '1,3,5' && sessionDaysOf('basic').join() === '1,4' && C.training.sessionHourUtc === 12);
check('weekly load Full = 30 E / 22 F, Basic = 18 E / 13.2 F', close(trainingLoad(1).energy, 30) && close(trainingLoad(1).fatigue, 22) && close(trainingLoad(0.6).energy, 18) && close(trainingLoad(0.6).fatigue, 13.2));
check('one Full session = 10 E / 7.33 F, one Basic session = 9 E / 6.6 F', close(trainingLoad(1 / 3).energy, 10) && close(trainingLoad(1 / 3).fatigue, 22 / 3) && close(trainingLoad(0.6 / 2).energy, 9) && close(trainingLoad(0.6 / 2).fatigue, 6.6));
check('session times: Tuesday 12:00 of week 2 = 2 weeks + 1 day + 12 h', sessionTimes(2, [1])[0] === 2 * W + D + 12 * H);

// 2. exact times: nothing before the first session, load at each session, regeneration between them
{
  const s0 = mk({ energy: 80, fatigue: 20 });
  const tue = sessionTimes(0, full.days)[0];
  const beforeFirst = catchUp(s0, 0, tue - 1, inputs([[0, full]]));
  check('before the first session the rider only regenerates', close(beforeFirst.rider.energy, regen(s0, tue - 1).energy) && beforeFirst.weeks.length === 0);
  const afterFirst = catchUp(s0, 0, tue, inputs([[0, full]]));
  const expect = applyLoad(regen(s0, tue), 10, 22 / 3);
  check('at Tuesday 12:00 the first part (10 E / 7.33 F) is applied', close(afterFirst.rider.energy, expect.energy) && close(afterFirst.rider.fatigue, expect.fatigue));
  const week = catchUp(s0, 0, W, inputs([[0, full]]));
  let m = s0, at = 0; const readiness: number[] = [];
  for (const t of sessionTimes(0, full.days)) { m = regen(m, t - at); at = t; readiness.push((m.energy + (100 - m.fatigue)) / 2); m = applyLoad(m, 10, 22 / 3); }
  check('three sessions, regeneration between them, same as the hand calculation', close(week.weeks[0].energyEnd, regen(m, W - at).energy) && week.weeks[0].sessionsDone === 3);
  check('readiness average = mean of the readiness measured just before each session', close(week.weeks[0].readinessAvg!, readiness.reduce((a, b) => a + b, 0) / 3));
  check('weekly training units = 1.0 (Full) and 0.6 (Basic): the number of sessions does not change the weekly total',
    close(week.weeks[0].trainingUnits, 1) && close(catchUp(s0, 0, W, inputs([[0, basic]])).weeks[0].trainingUnits, 0.6));
}

// 3. individual coefficients at every session
{
  const a = catchUp(mk({ energyEff: 0.7, fatigueRes: 0.7 }), 0, 2 * D + 13 * H, inputs([[0, full]])), b = catchUp(mk({ energyEff: 1.3, fatigueRes: 1.3 }), 0, 2 * D + 13 * H, inputs([[0, full]]));
  check('an economical rider loses less Energy per session, a fatigue-resistant one gains less Fatigue', a.rider.energy > b.rider.energy && a.rider.fatigue < b.rider.fatigue);
}

// 4. offline: any split of the time gives the same state, each session counted once, reading again credits nothing
{
  const plans = inputs([[0, full], [1, basic], [2, full]]);
  const start = mk({ energy: 70, fatigue: 30 });
  const whole = catchUp(start, 0, 3 * W, plans);
  const hist = new Map<number, number>(), used = new Set<number>(), sess = new Map<number, { n: number; sum: number }>();
  const stops = [1000, sessionTimes(0, full.days)[0] - 1, sessionTimes(0, full.days)[0], sessionTimes(0, full.days)[0] + 1, 3 * D, sessionTimes(0, full.days)[2], W, W + D + 12 * H, W + 6 * D, 2 * W + 3 * D + 12 * H, 3 * W];
  let part = { rider: start, lastAt: 0, weeks: [] as WeekRecord[] };
  for (const t of stops) { const o = catchUp(part.rider, part.lastAt, t, plans, hist, used, sess); part = { rider: o.rider, lastAt: o.lastAt, weeks: [...part.weeks, ...o.weeks] }; }
  check('offline in 11 pieces (incl. exact session instants) equals one pass', (['energy', 'fatigue', 'fitness', 'form'] as const).every((k) => close(part.rider[k], whole.rider[k], 1e-9)) && part.weeks.length === 3);
  check('every week records its sessions exactly once (3 / 2 / 3)', part.weeks.map((w) => w.sessionsDone).join() === '3,2,3');
  const again = catchUp(whole.rider, whole.lastAt, whole.lastAt, plans, new Map(), new Set(), new Map());
  check('reading the state again at the same moment credits nothing', again.rider.energy === whole.rider.energy && again.weeks.length === 0);
  const tue = sessionTimes(0, full.days)[0];
  const x = catchUp(start, 0, tue, plans, hist, used, new Map()), y = catchUp(x.rider, x.lastAt, tue + 60, plans, new Map(), new Set(), new Map());
  check('a session at exactly the processed-up-to instant is not applied a second time', close(y.rider.energy, regen(x.rider, 60).energy));
}

// 5. race week: no plan -> no session, stages at their exact time, regeneration continues between them
{
  const stage = (id: number, d: number): LoadEvent => ({ id, at: d * D + 9.5 * H, energy: 16, fatigue: 11, raceUnits: 0.25 });
  const ev = [stage(1, 0), stage(2, 2), stage(3, 4)];
  const o = catchUp(mk(), 0, W, inputs([], ev));
  check('a race week without plan has no training load, only the three stages (0.75 race units)', o.weeks[0].trainingUnits === 0 && close(o.weeks[0].raceUnits, 0.75) && o.weeks[0].sessionsDone === 0 && o.weeks[0].readinessAvg === null);
  let m = mk(), at = 0;
  for (const e of ev) { m = applyLoad(regen(m, e.at - at), 16, 11); at = e.at; }
  check('stage by stage with regeneration between them equals the hand calculation', close(o.weeks[0].energyEnd, regen(m, W - at).energy));
  const both = catchUp(mk(), 0, 2 * W, inputs([[0, full]], [stage(4, 7 + 0)]));
  check('training week then race week: the training sessions and the stage are all applied, in time order', both.weeks.length === 2 && both.weeks[0].sessionsDone === 3 && both.weeks[1].raceUnits > 0);
}

// 6. a plan whose sessions are already behind the processed-up-to instant (state model switched on late) is not charged retroactively
{
  const late = catchUp(mk(), 4 * D, W, inputs([[0, full]]));
  check('only the sessions after the processed-up-to instant count (Saturday only: 1 of 3)', late.weeks[0].sessionsDone === 1 && close(late.weeks[0].trainingUnits, 1 / 3));
}

// 7. very long offline: nothing is skipped, the state is saved at the cursor and the next call continues
{
  const n = 1100;
  const plans = inputs(Array.from({ length: n }, (_, w) => [w, full] as [number, typeof full]));
  const hist = new Map<number, number>(), used = new Set<number>(), sess = new Map<number, { n: number; sum: number }>();
  const first = catchUp(mk(), 0, n * W, plans, hist, used, sess);
  check('a pass is limited (4000 items): the first call stops at the cursor, not at "now"', first.lastAt < n * W && first.lastAt > 0, `${first.lastAt}`);
  let cur = first, calls = 1; const all = [...first.weeks];
  while (cur.lastAt < n * W && calls < 10) { const o = catchUp(cur.rider, cur.lastAt, n * W, plans, hist, used, sess); all.push(...o.weeks); cur = o; calls++; }
  check('the following calls finish it and every one of the 1100 weeks is evaluated exactly once', cur.lastAt === n * W && all.length === n && new Set(all.map((w) => w.week)).size === n, `${all.length} weeks, ${calls} calls`);
  const steps = (() => { let r = mk(), at = 0; const h = new Map<number, number>(), u = new Set<number>(), s = new Map<number, { n: number; sum: number }>(); for (let t = 100 * W; t <= n * W; t += 100 * W) { const o = catchUp(r, at, t, plans, h, u, s); r = o.rider; at = o.lastAt; } return r; })();
  check('long offline gives the same result as regular visits every 100 weeks', close(cur.rider.fitness, steps.fitness, 1e-6) && close(cur.rider.form, steps.form, 1e-6) && close(cur.rider.energy, steps.energy, 1e-6));
}
console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
