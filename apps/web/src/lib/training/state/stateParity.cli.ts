/**
 * Reference values for supabase/tests/rider_state.test.sh.
 *   tsx stateParity.cli.ts            -> scenarios + TypeScript results as JSON
 *   tsx stateParity.cli.ts coef <id>... -> TypeScript individual coefficients derived from md5(id) (same salts as SQL rst_*())
 */
import { createHash } from 'node:crypto';
import { STATE_CONFIG as C, CALENDAR_ANCHOR, type StateRider } from './config';
import { catchUp, coefficientsFromUniforms, SECONDS_PER_DAY, sessionDaysOf, type LoadEvent, type PlanLoad } from './core';

const unit = (id: string, salt: string) => parseInt(createHash('md5').update(`${id}:${salt}`).digest('hex').slice(0, 8), 16) / 4294967296;
if (process.argv[2] === 'coef') {
  console.log(JSON.stringify(process.argv.slice(3).map((id) => coefficientsFromUniforms(['ee1', 'ee2', 'fr1', 'fr2', 'rc1', 'rc2'].map((s) => unit(id, s))))));
  process.exit(0);
}

const unitsOf = (intensity: string, technical: boolean) => technical ? C.training.unitsV1Technical : ({ hard: C.training.unitsV1Hard, normal: C.training.unitsV1Normal, light: C.training.unitsV1Light } as Record<string, number>)[intensity];
interface Sc { name: string; age: number; vitality: number; trainability: number; professionalism: number; recovery: number; coef: [number, number, number]; energy: number; fatigue: number; form: number; fitness: number; peak: number;
  plans: [number, string, string, string][]; stageAt: number[] }
/** stage load instants (seconds since the anchor): weekday d of week w at 09:30:00 UTC; an optional exact instant is added as is */
const stageWeek = (w: number, d: number[]) => d.map((x) => (7 * w + x) * SECONDS_PER_DAY + 34200);
const scenarios: Sc[] = [
  { name: 'young', age: 19, vitality: 80, trainability: 80, professionalism: 70, recovery: 70, coef: [0.8, 1.2, 1.05], energy: 60, fatigue: 40, form: 75, fitness: 78, peak: 78,
    plans: [[2, 'performance', 'climbing', 'hard'], [3, 'performance', 'sprint', 'normal'], [4, 'performance', 'climbing', 'light'], [5, 'technical', 'cornering', 'normal'], [7, 'performance', 'hills', 'normal'], [8, 'performance', 'hills', 'hard'], [9, 'performance', 'flat', 'normal']],
    stageAt: [...stageWeek(3, [0, 2, 4]), ...stageWeek(7, [0, 1, 3, 4])] },
  { name: 'veteran', age: 30, vitality: 75, trainability: 50, professionalism: 60, recovery: 40, coef: [1.2, 0.8, 0.95], energy: 90, fatigue: 10, form: 70, fitness: 80, peak: 88,
    plans: [2, 3, 4, 5, 6, 7, 8, 9].map((w) => [w, 'performance', 'endurance', 'light'] as [number, string, string, string]), stageAt: [...stageWeek(2, [0, 2, 4]), ...stageWeek(4, [0, 2, 4]), ...stageWeek(6, [0, 2, 4])] },
  { name: 'rester', age: 24, vitality: 50, trainability: 50, professionalism: 50, recovery: 50, coef: [1, 1, 1], energy: 40, fatigue: 60, form: 75, fitness: 72, peak: 72, plans: [], stageAt: [...stageWeek(4, [0, 1, 2, 3, 4]), ...stageWeek(5, [0, 1, 2, 3, 4, 5]), 6 * 7 * SECONDS_PER_DAY /* exactly a week boundary: belongs to the NEW week */, 6 * 7 * SECONDS_PER_DAY + 0.5] },
];
const secs = (iso: string) => (Date.parse(iso) - Date.parse(`${CALENDAR_ANCHOR}T00:00:00Z`)) / 1000;
const calls = ['2026-10-19T06:00:00.000Z', '2026-10-20T12:34:56.789Z', '2026-10-21T03:00:00.000Z', '2026-11-17T14:03:09.250Z'].map((iso) => ({ now: iso.replace('T', ' ').replace('Z', '+00'), at: secs(iso) }));
const out: Record<string, unknown> = {};
for (const s of scenarios) {
  const plans = new Map<number, number>(s.plans.map(([w, t, , i]) => [w - 1, unitsOf(i, t === 'technical')] as [number, number]));
  const events: LoadEvent[] = s.stageAt.map((at, i) => ({ id: i + 1, at, energy: 16, fatigue: 11, raceUnits: C.stageReference.raceUnits }));
  const r: StateRider = { age: s.age, vitality: s.vitality, trainability: s.trainability, professionalism: s.professionalism, recovery: s.recovery,
    energyEff: s.coef[0], fatigueRes: s.coef[1], recoveryCoef: s.coef[2], energy: s.energy, fatigue: s.fatigue, form: s.form, fitness: s.fitness, fitnessPeak: s.peak, morale: 70 };
  const res = calls.map((c) => catchUp(r, 0, c.at, { plans, events }));
  out[s.name] = { after: res.map((x) => x.rider), weeks: res.map((x) => x.weeks.length) };
}
// ---- V2 plans: sessions (Full Tue/Thu/Sat, Basic Tue/Fri at 12:00 UTC) in training weeks, stages in race weeks (1-based weeks) ----
interface V2 { name: string; age: number; vitality: number; trainability: number; professionalism: number; recovery: number; coef: [number, number, number]; energy: number; fatigue: number; form: number; fitness: number; peak: number;
  plans: [number, 'full' | 'basic'][]; stageAt: number[] }
const v2scenarios: V2[] = [
  { name: 'cycle_full', age: 22, vitality: 60, trainability: 70, professionalism: 60, recovery: 55, coef: [0.9, 1.1, 1.0], energy: 80, fatigue: 20, form: 75, fitness: 74, peak: 80,
    plans: [[3, 'full'], [5, 'full'], [7, 'basic']], stageAt: [...stageWeek(3, [0, 2, 4]), ...stageWeek(5, [0, 1, 3, 4]), ...stageWeek(7, [0, 1, 2, 3, 4])] },
  { name: 'cycle_basic', age: 28, vitality: 40, trainability: 50, professionalism: 50, recovery: 40, coef: [1.25, 0.75, 0.95], energy: 55, fatigue: 45, form: 70, fitness: 70, peak: 76,
    plans: [[1, 'basic'], [3, 'basic'], [5, 'full'], [9, 'basic']], stageAt: [...stageWeek(1, [0, 2, 4]), ...stageWeek(7, [0, 1, 3, 4])] },
];
const v2calls = ['2026-09-01T11:59:59.000Z', '2026-09-01T12:00:00.000Z', '2026-09-02T00:00:00.000Z', '2026-09-03T12:00:00.000Z', '2026-09-05T12:00:01.000Z', '2026-09-07T00:00:00.000Z', '2026-09-21T10:11:12.000Z', '2026-10-19T06:00:00.000Z', '2026-11-17T14:03:09.250Z']
  .map((iso) => ({ now: iso.replace('T', ' ').replace('Z', '+00'), at: secs(iso) }));
const outV2: Record<string, unknown> = {};
for (const s of v2scenarios) {
  const plans = new Map<number, PlanLoad>(s.plans.map(([w, m]) => [w - 1, { units: m === 'full' ? C.training.unitsFull : C.training.unitsBasic, days: sessionDaysOf(m) }] as [number, PlanLoad]));
  const events: LoadEvent[] = s.stageAt.map((at, i) => ({ id: i + 1, at, energy: 16, fatigue: 11, raceUnits: C.stageReference.raceUnits }));
  const r: StateRider = { age: s.age, vitality: s.vitality, trainability: s.trainability, professionalism: s.professionalism, recovery: s.recovery,
    energyEff: s.coef[0], fatigueRes: s.coef[1], recoveryCoef: s.coef[2], energy: s.energy, fatigue: s.fatigue, form: s.form, fitness: s.fitness, fitnessPeak: s.peak, morale: 70 };
  const res = v2calls.map((c) => catchUp(r, 0, c.at, { plans, events }));
  outV2[s.name] = { after: res.map((x) => x.rider), weeks: res.map((x) => x.weeks.map((w) => ({ week: w.week, trainingUnits: w.trainingUnits, sessionsDone: w.sessionsDone, readinessAvg: w.readinessAvg }))) };
}
// LATE STAGE: a stage of week 0 reported while the rider is already in week 2 (its week was evaluated). Two calls: before and after the late report.
const lateStart: StateRider = { age: 25, vitality: 60, trainability: 60, professionalism: 60, recovery: 50, energyEff: 1.1, fatigueRes: 0.9, recoveryCoef: 1.05, energy: 85, fatigue: 15, form: 70, fitness: 68, fitnessPeak: 72, morale: 70 };
const W7 = 7 * SECONDS_PER_DAY, anchorMs = Date.parse(`${CALENDAR_ANCHOR}`.length > 10 ? CALENDAR_ANCHOR : `${CALENDAR_ANCHOR}T00:00:00Z`);
const isoAt = (sec: number) => new Date(anchorMs + sec * 1000).toISOString().replace('T', ' ').replace('Z', '+00');
const evBase: LoadEvent = { id: 1, at: 2 * SECONDS_PER_DAY, energy: 16, fatigue: 11, raceUnits: C.stageReference.raceUnits };
const evLate: LoadEvent = { id: 2, at: 3 * SECONDS_PER_DAY, energy: 16, fatigue: 11, raceUnits: C.stageReference.raceUnits };
const lh = new Map<number, number>(), la = new Set<number>(), ls = new Map<number, { n: number; sum: number }>(), lc = new Map<number, number>();
const noPl = new Map<number, PlanLoad>();
const lt1 = 2 * W7 + SECONDS_PER_DAY, lt2 = 3 * W7 + 5 * 3600;
const l1 = catchUp(lateStart, 0, lt1, { plans: noPl, events: [evBase] }, lh, la, ls, lc);
const l2 = catchUp(l1.rider, l1.lastAt, lt2, { plans: noPl, events: [evBase, evLate] }, lh, la, ls, lc);
const late = { start: lateStart, atBase: evBase.at, atLate: evLate.at, t1: isoAt(lt1), t2: isoAt(lt2), after1: l1.rider, after2: l2.rider,
  raceUnits: [...l1.weeks, ...l2.weeks].map((w) => ({ week: w.week, raceUnits: w.raceUnits })) };
console.log(JSON.stringify({ anchor: CALENDAR_ANCHOR, calls, scenarios, out, v2calls, v2scenarios, outV2, late }));
