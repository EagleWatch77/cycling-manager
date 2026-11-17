/**
 * Reference values for supabase/tests/rider_state.test.sh.
 *   tsx stateParity.cli.ts            -> scenarios + TypeScript results as JSON
 *   tsx stateParity.cli.ts coef <id>... -> TypeScript individual coefficients derived from md5(id) (same salts as SQL rst_*())
 */
import { createHash } from 'node:crypto';
import { STATE_CONFIG as C, CALENDAR_ANCHOR, type StateRider } from './config';
import { catchUp, coefficientsFromUniforms, SECONDS_PER_DAY, type LoadEvent } from './core';

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
console.log(JSON.stringify({ anchor: CALENDAR_ANCHOR, calls, scenarios, out }));
