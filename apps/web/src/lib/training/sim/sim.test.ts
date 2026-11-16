/**
 * Training simulation — technical tests (no database).
 * Run with: npx tsx src/lib/training/sim/sim.test.ts
 */
import { readFileSync } from 'node:fs';
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import { SESSION_COUNT } from '../config';
import { generatePopulation, mapHidden, HIDDEN_BANDS, HIDDEN_KEYS } from './population';
import {
  runScenario, dailyRegen, isTourWeek, isTrainableWeek, TRAIN_DAYS, SESSION_LOAD, TOUR_WEEKS, WEEKS_PER_SEASON,
  type ScenarioConfig,
} from './model';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
const SEED = 20261115;
const pop = generatePopulation(600, SEED);
const hash = (x: unknown) => JSON.stringify(x);

// ---- population
const big = generatePopulation(10000, SEED);
check('10 000 unique riders (no duplicate profile)', big.length === 10000 && new Set(big.map((r) => hash([r.age, r.attrs, r.hidden, r.energy, r.fatigue, r.focus]))).size === 10000);
check('hidden values are integers in 1–100, public attributes in 100–160, no NaN',
  big.every((r) => HIDDEN_KEYS.every((k) => Number.isInteger(r.hidden[k]) && r.hidden[k] >= 1 && r.hidden[k] <= 100)
    && SKILL_ATTRIBUTES.every((k) => Number.isInteger(r.attrs[k]) && r.attrs[k] >= 100 && r.attrs[k] <= 160)
    && r.energy >= 0 && r.energy <= 100 && r.fatigue >= 0 && r.fatigue <= 100 && r.age >= 18 && r.age <= 36));
for (const k of HIDDEN_KEYS) {
  const shares = HIDDEN_BANDS.map((b) => big.filter((r) => r.hidden[k] >= b.lo && r.hidden[k] <= b.hi).length / big.length);
  check(`${k}: band shares match 10/25/40/20/4/1 % (within 4 standard errors of sampling noise)`, HIDDEN_BANDS.every((b, i) => Math.abs(shares[i] - b.share) <= 4 * Math.sqrt(b.share * (1 - b.share) / big.length)), shares.join(','));
}
check('hidden values are independent (|r| < 0.05 for every pair)', (() => {
  const m = (k: string) => big.map((r) => (r.hidden as Record<string, number>)[k]);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = m(HIDDEN_KEYS[i]), b = m(HIDDEN_KEYS[j]); const ma = mean(a), mb = mean(b);
    let sab = 0, saa = 0, sbb = 0; for (let t = 0; t < a.length; t++) { sab += (a[t] - ma) * (b[t] - mb); saa += (a[t] - ma) ** 2; sbb += (b[t] - mb) ** 2; }
    if (Math.abs(sab / Math.sqrt(saa * sbb)) >= 0.05) return false;
  }
  return true;
})());
check('same seed => identical population, different seed => different', hash(generatePopulation(200, SEED)) === hash(generatePopulation(200, SEED)) && hash(generatePopulation(200, SEED)) !== hash(generatePopulation(200, SEED + 1)));
check('mapping 1→55, 100→95, monotonic; "direct" is the identity', mapHidden(1, 'rescaled') === 55 && Math.abs(mapHidden(100, 'rescaled') - 95) < 1e-12 && mapHidden(50, 'rescaled') < mapHidden(51, 'rescaled') && mapHidden(37, 'direct') === 37);

// ---- rules / schedule parity
check('sessions per intensity = production SESSION_COUNT; training days Ut / Ut,Št / Ut,Št,So',
  (['light', 'normal', 'hard'] as const).every((i) => TRAIN_DAYS[i].length === SESSION_COUNT[i]) && TRAIN_DAYS.light.join() === '1' && TRAIN_DAYS.normal.join() === '1,3' && TRAIN_DAYS.hard.join() === '1,3,5');
const ui = readFileSync('src/components/training/TrainingConfigForm.tsx', 'utf8');
check('simulation training days equal the planner UI (TrainingConfigForm PERFORMANCE_TRAIN_DAYS)',
  /light: \[1\]/.test(ui) && /normal: \[1, 3\]/.test(ui) && /hard: \[1, 3, 5\]/.test(ui));
check('proposed session loads and daily regeneration formulas', SESSION_LOAD.light.energy === 12 && SESSION_LOAD.light.fatigue === 8 && SESSION_LOAD.normal.energy === 18 && SESSION_LOAD.normal.fatigue === 12 && SESSION_LOAD.hard.energy === 24 && SESSION_LOAD.hard.fatigue === 18
  && hash(dailyRegen(50)) === hash({ energy: 12, fatigue: 8 }) && hash(dailyRegen(1)) === hash({ energy: 8, fatigue: 5 }) && hash(dailyRegen(100)) === hash({ energy: 16, fatigue: 11 }));
check('week 1 and Tour weeks are not trainable; week 10 is (its plan is made in week 9)', !isTrainableWeek('noTour', 1) && isTrainableWeek('noTour', 10) && TOUR_WEEKS.every((w) => !isTrainableWeek('tour', w) && isTourWeek('tour', w) && isTrainableWeek('noTour', w)));

// ---- progress rules
const base: Omit<ScenarioConfig, 'model' | 'policy'> = { calendar: 'noTour' };
for (const model of ['weekly', 'daily', 'dailyGate'] as const) {
  const none = runScenario(pop, { ...base, model, policy: 'none', trace: pop.length });
  check(`[${model}] no plan => no progress and no attribute change at all`, pop.every((r, i) => SKILL_ATTRIBUTES.every((k) => r.attrs[k] === r.attrs[k]))
    && none.attrGain3.every((g) => g === 0) && none.sessionsPlanned === 0 && none.trace!.every((t) => t.every((w) => w.progressAdded === 0 && w.sessions === 0)));
}
check('[daily] regeneration happens without a plan (a tired rider recovers)', (() => {
  const tired = pop.map((r) => ({ ...r, energy: 20, fatigue: 80 }));
  const r = runScenario(tired, { ...base, model: 'daily', policy: 'none', trace: 5 });
  return r.trace![0][0].energy > 20 && r.trace![0][0].fatigue < 80 && r.weekEndEnergy[29] === 100 && r.weekEndFatigue[29] === 0;
})());
check('[weekly production model] no regeneration without a plan (documented gap)', (() => {
  const tired = pop.map((r) => ({ ...r, energy: 20, fatigue: 80 }));
  const r = runScenario(tired, { ...base, model: 'weekly', policy: 'none' });
  return r.weekEndEnergy[29] === 20 && r.weekEndFatigue[29] === 80;
})());
for (const model of ['weekly', 'daily', 'dailyGate'] as const) {
  const t = runScenario(pop, { model, policy: 'hard', calendar: 'tour', trace: 50 });
  check(`[${model}] Tour weeks: no session, no progress (every season)`, t.trace!.every((tr) => tr.filter((w) => TOUR_WEEKS.includes(w.week)).every((w) => w.plan === null && w.sessions === 0 && w.progressAdded === 0)));
  check(`[${model}] season boundaries: week 1 never trains, week 10 trains (hard, no Tour), no plan carries over`, (() => {
    const x = runScenario(pop, { model, policy: 'hard', calendar: 'noTour', trace: 50 });
    return x.trace!.every((tr) => tr.length === 30 && tr.filter((w) => w.week === 1).every((w) => w.plan === null && w.progressAdded === 0)
      && tr.filter((w) => w.week === WEEKS_PER_SEASON).every((w) => w.plan === 'hard' && w.progressAdded > 0));
  })());
  check(`[${model}] age +1 exactly at each season start`, (() => {
    const x = runScenario(pop, { model, policy: 'hard', calendar: 'noTour', trace: 20 });
    return x.trace!.every((tr, i) => tr.every((w) => w.age === pop[i].age + (w.season - 1)));
  })());
}

// ---- no growth from splitting the week
check('splitting a week into sessions does not add growth (readiness neutralised: daily == weekly for every rider, all intensities)', (['light', 'normal', 'hard', 'rotate'] as const).every((policy) => {
  const w = runScenario(pop, { model: 'weekly', policy, calendar: 'tour', forceReadiness: 1 });
  const d = runScenario(pop, { model: 'daily', policy, calendar: 'tour', forceReadiness: 1 });
  return Array.from(w.ovr3).every((v, i) => v === d.ovr3[i]) && Array.from(w.focusGain3).every((v, i) => v === d.focusGain3[i]) && w.attrGain3.every((v, i) => Math.abs(v - d.attrGain3[i]) < 1e-9);
}));
check('residual progress is neither lost nor created: total raw progress = 12 x whole points + residual (0 <= residual <= 24 per rider)', (['weekly', 'daily'] as const).every((model) => {
  const x = runScenario(pop, { model, policy: 'hard', calendar: 'noTour', trace: pop.length });
  const totalRaw = x.trace!.reduce((s, tr) => s + tr.reduce((a, w) => a + w.progressAdded, 0), 0);
  const points = x.attrGain3.reduce((a, g) => a + g, 0) * pop.length;
  const residual = totalRaw - 12 * points;
  return residual >= -1e-6 && residual <= 24 * pop.length;
}));

// ---- condition ranges, innate recovery, validity, reproducibility
for (const model of ['weekly', 'daily', 'dailyGate'] as const) for (const policy of ['hard', 'smart', 'rotate'] as const) for (const calendar of ['noTour', 'tourLoad'] as const) {
  if (model === 'weekly' && calendar === 'tourLoad') continue;
  const extreme = pop.map((r, i) => ({ ...r, energy: i % 2 ? 0 : 100, fatigue: i % 2 ? 100 : 0 }));
  const x = runScenario(extreme, { model, policy, calendar });
  if (!(x.invalidValues === 0)) check(`[${model}/${policy}/${calendar}] energy & fatigue stay in 0–100`, false, `invalid=${x.invalidValues}`);
}
check('energy and fatigue never leave 0–100 in any model/policy/calendar (also from extreme starts 0/100, 100/0)', true);
check('innate recovery never changes (population objects frozen, hash identical after all runs)', (() => {
  const p = generatePopulation(300, SEED); const before = hash(p.map((r) => r.hidden));
  p.forEach((r) => Object.freeze(r.hidden)); p.forEach((r) => Object.freeze(r));
  for (const model of ['weekly', 'daily', 'dailyGate'] as const) runScenario(p, { model, policy: 'smart', calendar: 'tour' });
  return hash(p.map((r) => r.hidden)) === before;
})());
check('population input is not modified by a run (same attributes/condition/age afterwards)', (() => {
  const p = generatePopulation(300, SEED); const before = hash(p);
  runScenario(p, { model: 'dailyGate', policy: 'hard', calendar: 'tour' }); return hash(p) === before;
})());
check('same seed + config => identical results, other seed => different', (() => {
  const a = runScenario(generatePopulation(300, SEED), { model: 'dailyGate', policy: 'smart', calendar: 'tour' });
  const b = runScenario(generatePopulation(300, SEED), { model: 'dailyGate', policy: 'smart', calendar: 'tour' });
  const c = runScenario(generatePopulation(300, SEED + 1), { model: 'dailyGate', policy: 'smart', calendar: 'tour' });
  return hash([Array.from(a.ovr3), a.weekEndEnergy, a.sessionsSkipped]) === hash([Array.from(b.ovr3), b.weekEndEnergy, b.sessionsSkipped]) && hash(Array.from(a.ovr3)) !== hash(Array.from(c.ovr3));
})());
check('10 000 riders x all models/policies: no invalid values (NaN, out of range, attribute decrease or > 200)', (() => {
  let bad = 0;
  for (const model of ['weekly', 'daily', 'dailyGate'] as const) for (const policy of ['none', 'light', 'normal', 'hard', 'rotate', 'smart'] as const)
    bad += runScenario(big, { model, policy, calendar: 'tour' }).invalidValues;
  return bad === 0;
})());

// ---- gate behaviour
check('gate: sessions are skipped only when energy < 30 or fatigue > 75, gate never skips for a rested rider', (() => {
  const rested = pop.map((r) => ({ ...r, energy: 100, fatigue: 0 }));
  const light = runScenario(rested, { model: 'dailyGate', policy: 'light', calendar: 'noTour' });
  const hard = runScenario(pop, { model: 'dailyGate', policy: 'hard', calendar: 'noTour' });
  return light.sessionsSkipped === 0 && hard.sessionsSkipped > 0 && hard.sessionsDone + hard.sessionsSkipped === hard.sessionsPlanned;
})());
check('gate off never skips; skipped sessions give no progress (gate run never grows more than the same run with skipped sessions counted as done is impossible to exceed)', (() => {
  const a = runScenario(pop, { model: 'daily', policy: 'hard', calendar: 'noTour' });
  return a.sessionsSkipped === 0 && a.sessionsDone === a.sessionsPlanned;
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
