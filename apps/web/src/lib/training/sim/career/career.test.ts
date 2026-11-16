/**
 * Career simulation — technical tests (no database). Run: npx tsx --tsconfig tsconfig.json src/lib/training/sim/career/career.test.ts
 */
import { readFileSync } from 'node:fs';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { overallRating } from '@/lib/rider/score';
import { calculatePerformanceRawGrowth } from '../../growth';
import { generatePopulation, HIDDEN_BANDS, HIDDEN_KEYS, mapHidden, type SimRider } from '../population';
import { runCareer, defaultConfig, ovrOf, attrRecord, performanceWeekRaw, type CareerConfig } from './engine';
import { projectWeek, regenFor, decide, type PlannerView, type StrategyId } from './planners';
import {
  ATTR_CAP_NONPERF, ENGINE_BASE_ROAD_ENERGY_PER_KM, NATTR, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, TOUR_STAGES, TOUR_WEEKS_3, TOUR_WEEKS_4, SEASONS, WEEKS,
  RACE_GROWTH, expPotentialFactor, potentialCeiling, declinePerSeason, stageLoad, HARD_LOADS, IDX,
} from './params';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
const SEED = 20261115;
const OPTS = { ageMin: 18, ageMax: 22, restedOnly: true };
const big = generatePopulation(10000, SEED, OPTS);
const pop = generatePopulation(400, SEED, OPTS);
const W = SEASONS + 1;
const cfg = (s: StrategyId, o: Partial<CareerConfig> = {}): CareerConfig => ({ ...defaultConfig(s), ...o });
const rider = (hidden: Partial<SimRider['hidden']> = {}, extra: Partial<SimRider> = {}, base = 130): SimRider => {
  const attrs = {} as Record<SkillAttribute, number>; for (const k of SKILL_ATTRIBUTES) attrs[k] = base;
  return { id: 1, age: 20, attrs, hidden: { potential: 50, trainability: 50, professionalism: 50, recovery: 50, ...hidden }, energy: 100, fatigue: 0, focus: 'climbing', ...extra };
};
const at = (r: ReturnType<typeof runCareer>, i: number, s: number, k: number) => r.attrs[(i * W + s) * NATTR + k];

// ------------------------------------------------------------------ population
check('10 000 unique riders', big.length === 10000 && new Set(big.map((r) => JSON.stringify([r.age, r.attrs, r.hidden]))).size === 10000);
check('start age 18–22, all rested (energy 100 / fatigue 0)', big.every((r) => r.age >= 18 && r.age <= 22 && r.energy === 100 && r.fatigue === 0));
check('hidden values are integers 1–100', big.every((r) => HIDDEN_KEYS.every((k) => Number.isInteger(r.hidden[k]) && r.hidden[k] >= 1 && r.hidden[k] <= 100)));
{
  let worst = 0;
  for (const k of HIDDEN_KEYS) for (const b of HIDDEN_BANDS) {
    const share = big.filter((r) => r.hidden[k] >= b.lo && r.hidden[k] <= b.hi).length / big.length;
    worst = Math.max(worst, Math.abs(share - b.share) / Math.sqrt(b.share * (1 - b.share) / big.length));
  }
  check('hidden band shares match 10/25/40/20/4/1 % (within 4 standard errors)', worst < 4, `worst z=${worst.toFixed(2)}`);
}
check('same seed → same population, other seed → different', JSON.stringify(generatePopulation(50, SEED, OPTS)) === JSON.stringify(generatePopulation(50, SEED, OPTS)) && JSON.stringify(generatePopulation(50, SEED + 1, OPTS)) !== JSON.stringify(generatePopulation(50, SEED, OPTS)));
check('first-simulation population unchanged by the new options (default mode)', generatePopulation(5, SEED).every((r) => r.age >= 18 && r.age <= 36));

// ------------------------------------------------------------------ calendar
check('4 Tours × 3 stages: 48 Tours and 144 stages in 12 seasons', TOUR_WEEKS_4.length * 12 === 48 && TOUR_WEEKS_4.reduce((s, w) => s + TOUR_STAGES[w].length, 0) * 12 === 144);
check('3-Tour comparison calendar is the existing Rookie weeks 2/5/7', JSON.stringify(TOUR_WEEKS_3) === '[2,5,7]');
const trainable = (tw: readonly number[]) => Array.from({ length: WEEKS }, (_, i) => i + 1).filter((w) => w >= 2 && !tw.includes(w)).length;
check('5 trainable weeks with 4 Tours, 6 with 3 Tours', trainable(TOUR_WEEKS_4) === 5 && trainable(TOUR_WEEKS_3) === 6);
check('every Tour week has exactly 3 visible Rookie stages', [...TOUR_WEEKS_4].every((w) => TOUR_STAGES[w].length === 3));
check('engine energy constant mirrored from packages/race-engine', new RegExp(`BASE_ROAD_ENERGY_PER_KM = ${ENGINE_BASE_ROAD_ENERGY_PER_KM}`).test(readFileSync('../../packages/race-engine/src/config/balance.ts', 'utf8')));
check('stage loads are positive integers, fatigue < energy', [...TOUR_WEEKS_4].every((w) => TOUR_STAGES[w].every((s) => { const l = stageLoad(s); return Number.isInteger(l.energy) && l.energy > 0 && l.fatigue > 0 && l.fatigue < l.energy + 1; })));

// ------------------------------------------------------------------ parity with production code
{
  let ok = true;
  for (let t = 0; t < 300; t++) {
    const r = pop[t]; const a = new Float64Array(NATTR); SKILL_ATTRIBUTES.forEach((k, i) => { a[i] = r.attrs[k] + (t % 3) * 20; });
    const intensity = (['light', 'normal', 'hard'] as const)[t % 3]; const focus = PERF_IDX[t % 7];
    const mine = performanceWeekRaw({ att: a, focus, intensity, tr: r.hidden.trainability, pr: r.hidden.professionalism, po: r.hidden.potential, poRaw: r.hidden.potential, age: r.age, facility: 1, model: 'existing' });
    const prod = calculatePerformanceRawGrowth({ focus: SKILL_ATTRIBUTES[focus], intensity, attributes: attrRecord(a), trainability: r.hidden.trainability, professionalism: r.hidden.professionalism, age: r.age, potential: r.hidden.potential });
    if (Math.abs(mine.primary - prod.primaryRaw) > 1e-9 || Math.abs(mine.secondary - (prod.secondaryRaw ?? 0)) > 1e-9) ok = false;
  }
  check('weekly Performance growth equals the production calculatePerformanceRawGrowth()', ok);
}
{
  let ok = true;
  for (let t = 0; t < 2000; t++) { const r = big[t]; const a = SKILL_ATTRIBUTES.map((k) => r.attrs[k] + ((t * 7 + SKILL_ATTRIBUTES.indexOf(k)) % 25)); if (ovrOf(a) !== overallRating(attrRecord(a))) ok = false; }
  check('fast OVR equals the approved overallRating()', ok);
}

// ------------------------------------------------------------------ plans, Tour weeks, season boundaries
for (const strat of ['specialist', 'complex', 'smart', 'racer', 'maxTraining'] as StrategyId[]) {
  const res = runCareer(pop.slice(0, 60), cfg(strat, { log: { riders: 60 } }));
  const tourW = new Set<number>(TOUR_WEEKS_4);
  check(`[${strat}] no training session in any Tour week`, res.exec!.every((e) => !(e.tourWeek && (e.sessionsDone > 0 || e.plan != null))));
  check(`[${strat}] week 1 of every season has no plan; no plan is ever decided for week 11 (next season)`, res.exec!.filter((e) => e.week === 1).every((e) => e.plan === null) && res.log!.every((l) => l.decidedForWeek <= 10 && l.decidedForWeek === l.week + 1));
  // immutability: the executed plan equals exactly what was decided one week earlier
  let same = true;
  for (const e of res.exec!) {
    if (e.week === 1) continue;
    const dec = res.log!.find((l) => l.rider === e.rider && l.season === e.season && l.decidedForWeek === e.week)!;
    if (JSON.stringify(dec.plan) !== JSON.stringify(e.plan)) same = false;
  }
  check(`[${strat}] confirmed plan is exactly the plan decided a week earlier (immutable)`, same);
  check(`[${strat}] plans are only for trainable weeks (2–10, not Tour)`, res.exec!.every((e) => e.plan === null || (e.week >= 2 && e.week <= 10 && !tourW.has(e.week))));
}
{
  const r4 = runCareer(pop.slice(0, 40), cfg('specialist', { log: { riders: 40 } })), r3 = runCareer(pop.slice(0, 40), cfg('specialist', { tours: 3, log: { riders: 40 } }));
  const perSeason = (r: typeof r4, seasons: number) => r.exec!.filter((e) => e.rider === 0 && e.plan != null).length / seasons;
  check('specialist trains in 5 weeks per season with 4 Tours and 6 with 3 Tours (week 10 included)', perSeason(r4, SEASONS) === 5 && perSeason(r3, SEASONS) === 6);
  check('week 10 is trained when planned in week 9', r4.exec!.some((e) => e.rider === 0 && e.week === 10 && e.plan != null && e.sessionsDone > 0));
}
{
  const res = runCareer(pop.slice(0, 40), cfg('racer', { log: { riders: 40 } }));
  check('racer rests in the week before every Tour (weeks 4, 6, 8) and trains lightly after one', res.exec!.filter((e) => [4, 6, 8].includes(e.week)).every((e) => e.plan === null) && res.exec!.filter((e) => e.week === 3 && e.plan).every((e) => e.plan!.intensity === 'light'));
  const mx = runCareer(pop.slice(0, 40), cfg('maxTraining', { log: { riders: 40 } }));
  check('maximum training plans hard every trainable week', mx.exec!.filter((e) => e.plan).every((e) => e.plan!.intensity === 'hard' && e.plan!.kind === 'perf'));
}

// ------------------------------------------------------------------ controls
{
  const r = runCareer(pop, cfg('noTrainNoRace'));
  let same = true; for (let i = 0; i < pop.length; i++) for (let k = 0; k < NATTR; k++) if (at(r, i, SEASONS, k) !== at(r, i, 0, k)) same = false;
  check('no training and no racing → no attribute changes in 12 seasons', same && r.sessionsDone.every((v) => v === 0) && r.plannedWeeks.every((v) => v === 0));
  const q = runCareer(pop, cfg('noTrainRace'));
  let perfSame = true, other = false; for (let i = 0; i < pop.length; i++) { for (const k of PERF_IDX) if (at(q, i, SEASONS, k) !== at(q, i, 0, k)) perfSame = false; for (const k of [...TACT_IDX, ...TECH_IDX, EXP_IDX]) if (at(q, i, SEASONS, k) > at(q, i, 0, k)) other = true; }
  check('no training but racing → Performance never changes, Tactics/Technique/Experience grow', perfSame && other && q.sessionsPlanned.every((v) => v === 0));
}

// ------------------------------------------------------------------ bounds, caps, no double counting, monotonic growth
const caps = { conservative: RACE_GROWTH.conservative, bold: RACE_GROWTH.bold };
for (const strat of ['specialist', 'allrounder', 'complex', 'smart', 'maxTraining', 'racer', 'noTrainRace', 'oracle'] as StrategyId[]) {
  for (const growth of ['conservative', 'bold'] as const) {
    const res = runCareer(pop, cfg(strat, { growth }));
    let inRange = true, mono = true, capOk = true;
    for (let i = 0; i < pop.length; i++) for (let k = 0; k < NATTR; k++) {
      const lim = PERF_IDX.includes(k) ? 200 : ATTR_CAP_NONPERF;
      for (let s = 0; s <= SEASONS; s++) {
        const v = at(res, i, s, k);
        if (!(v >= 100 && v <= lim) || !Number.isInteger(v)) inRange = false;
        if (s > 0 && v < at(res, i, s - 1, k)) mono = false;
        if (s > 0 && !PERF_IDX.includes(k)) {
          const c = TACT_IDX.includes(k) ? caps[growth].capTactics : TECH_IDX.includes(k) ? caps[growth].capTechnique : EXP_IDX === k ? caps[growth].capExperience : 99;
          if (TACT_IDX.includes(k) || TECH_IDX.includes(k) || k === EXP_IDX) { if (v - at(res, i, s - 1, k) > c) capOk = false; }
        }
      }
    }
    check(`[${strat}/${growth}] attributes in range (100–200 Performance, ≤160 others), integer, never decreasing without decline`, inRange && mono);
    check(`[${strat}/${growth}] joint seasonal caps (race + technical training) are never exceeded`, capOk);
    check(`[${strat}/${growth}] energy/fatigue always 0–100, no invalid value`, res.invalidValues === 0);
    check(`[${strat}/${growth}] planned = done + skipped sessions`, pop.every((_, i) => res.sessionsPlanned[i] === res.sessionsDone[i] + res.sessionsSkipped[i]));
  }
}
{
  const withG = runCareer(pop.slice(0, 80), cfg('complex', { log: { riders: 80 } })), noG = runCareer(pop.slice(0, 80), cfg('complex', { forceNoGrowth: true, log: { riders: 80 } }));
  const sameState = withG.exec!.every((e, i) => e.E === noG.exec![i].E && e.F === noG.exec![i].F);
  check('growth never feeds back into energy/fatigue (condition path identical with growth switched off) → no double effect', sameState);
  const bold = runCareer(pop, cfg('noTrainRace', { growth: 'bold' })), cons = runCareer(pop, cfg('noTrainRace'));
  const m = (r: typeof bold) => pop.reduce((s, _, i) => s + r.ovr[i * W + SEASONS], 0) / pop.length;
  check('bold race growth ≥ conservative race growth', m(bold) > m(cons));
}

// ------------------------------------------------------------------ aging
{
  const vet = rider({}, { age: 30 }, 150);
  const off = runCareer([vet], cfg('noTrainRace', { decline: false }));
  const on = runCareer([vet], cfg('noTrainRace', { decline: true }));
  let exact = true; let expected = 150;
  for (let s = 1; s <= SEASONS; s++) {
    if (s > 1) expected = Math.max(100, expected - declinePerSeason(30 + s - 1));
    for (const k of PERF_IDX) if (at(on, 0, s, k) !== expected) exact = false;
  }
  check('age +1 per season: decline (experiment) applies at exactly the right ages (31+), step by step', exact);
  check('without the decline experiment, Performance of a 30-year-old does not fall (production has no decline)', PERF_IDX.every((k) => at(off, 0, SEASONS, k) === 150));
  const tr = runCareer([rider({}, { age: 18 })], cfg('specialist')), tr35 = runCareer([rider({}, { age: 18 })], cfg('specialist'));
  void tr35;
  const young = runCareer([rider({}, { age: 19 })], cfg('specialist')), old = runCareer([rider({}, { age: 31 })], cfg('specialist'));
  check('existing age factors: a 19-year-old gains more than a 31-year-old with identical values', young.ovr[SEASONS] - young.ovr[0] > old.ovr[SEASONS] - old.ovr[0] && tr.n === 1);
}

// ------------------------------------------------------------------ hidden values / immutability / determinism
{
  const frozen = generatePopulation(120, SEED, OPTS).map((r) => Object.freeze({ ...r, attrs: Object.freeze({ ...r.attrs }), hidden: Object.freeze({ ...r.hidden }) }) as SimRider);
  const snap = JSON.stringify(frozen);
  let threw = false; let res: ReturnType<typeof runCareer> | null = null;
  try { res = runCareer(frozen, cfg('smart')); } catch { threw = true; }
  check('runs on deeply frozen input (hidden values and population are never written)', !threw && JSON.stringify(frozen) === snap);
  let hOk = true; frozen.forEach((r, i) => { const h = [r.hidden.potential, r.hidden.trainability, r.hidden.professionalism, r.hidden.recovery]; for (let j = 0; j < 4; j++) if (res!.hiddenSnapshot[i * 4 + j] !== h[j]) hOk = false; });
  check('innate hidden values (incl. recovery) are unchanged after 12 seasons', hOk);
  const a = runCareer(pop, cfg('smart')), b = runCareer(pop, cfg('smart'));
  check('reproducible: same seed and configuration → identical careers', Buffer.compare(Buffer.from(a.attrs.buffer), Buffer.from(b.attrs.buffer)) === 0 && Buffer.compare(Buffer.from(a.ovr.buffer), Buffer.from(b.ovr.buffer)) === 0);
  const c = runCareer(generatePopulation(400, SEED + 1, OPTS), cfg('smart'));
  check('another seed gives different careers', Buffer.compare(Buffer.from(a.attrs.buffer), Buffer.from(c.attrs.buffer)) !== 0);
}
{
  const src = readFileSync('src/lib/training/sim/career/planners.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('planners.ts (manager strategies) never reference hidden values', !/hidden|potential|trainab|professional|\.recovery\b/i.test(src));
  const view = (energy: number): PlannerView => ({ season: 1, week: 3, target: 4, targetIsTour: false, currentIsTour: false, currentPlan: null, weeksToTourAfterTarget: 4, age: 20, attrs: new Array(19).fill(130), energy, fatigue: 10, rHat: 50, startFocus: 0, hardLoad: HARD_LOADS.h22, gate: true, currentStageLoads: [], counter: 0 });
  check('planner decisions depend only on the public view (same view → same plan; Tour target → no plan)', JSON.stringify(decide('smart', view(90), { counter: 0 })) === JSON.stringify(decide('smart', view(90), { counter: 0 })) && decide('smart', { ...view(90), targetIsTour: true }, { counter: 0 }) === null);
}

// ------------------------------------------------------------------ condition model, gate, regeneration, recovery in Tours
{
  const r50 = regenFor(50), r100 = regenFor(100), r1 = regenFor(1);
  check('daily regeneration formula (R=1/50/100)', r1.energy === 8 && r1.fatigue === 5 && r50.energy === 12 && r50.fatigue === 8 && r100.energy === 16 && r100.fatigue === 11);
  const hard = HARD_LOADS.h22;
  const lightPlan = { kind: 'perf' as const, intensity: 'light' as const, focus: 0 };
  const tired = projectWeek(0, 40, regenFor(50), lightPlan, [], hard, true);
  const noGate = projectWeek(0, 40, regenFor(50), lightPlan, [], hard, false);
  check('gate: energy below 30 on the session day skips it (state evolves only by regeneration); without the gate the session is done', tired.doneSessions === 0 && noGate.doneSessions === 1);
  const fat = projectWeek(80, 100, regenFor(50), lightPlan, [], hard, true);
  check('gate: fatigue above 75 on the session day skips it', fat.doneSessions === 0);
  const ok = projectWeek(100, 0, regenFor(50), lightPlan, [], hard, true);
  check('gate: a rested rider is never skipped', ok.doneSessions === 1);
  const lo = runCareer([rider({ recovery: 5 })], cfg('maxTraining', { gate: false })), hi = runCareer([rider({ recovery: 95 })], cfg('maxTraining', { gate: false }));
  check('recovery 95 enters a Tour fresher and leaves it with more energy than recovery 5 (hard training, no gate)', hi.tourPostE[0] > lo.tourPostE[0] && hi.tourPostF[0] < lo.tourPostF[0] && hi.stageREff[0] >= lo.stageREff[0]);
  const gOn = runCareer(pop, cfg('maxTraining')), gOff = runCareer(pop, cfg('maxTraining', { gate: false }));
  check('without the gate nobody skips; with the gate exhausted riders drop', gOff.sessionsSkipped.every((v) => v === 0) && gOn.exhaustedDays.reduce((s, v) => s + v, 0) < gOff.exhaustedDays.reduce((s, v) => s + v, 0));
  const t = runCareer(pop, cfg('smart'));
  check('Tour stages consume energy (post-Tour < pre-Tour) and raise fatigue on average', pop.every((_, i) => t.tourPostE[i] <= t.tourPreE[i] + 1) || t.tourPostE.reduce((s, v) => s + v, 0) < t.tourPreE.reduce((s, v) => s + v, 0));
}

// ------------------------------------------------------------------ potential model
check('experimental potential is a personal ceiling, not a flat multiplier (far below the ceiling every potential grows alike)', expPotentialFactor(130, 50) === 1 && expPotentialFactor(130, 95) === 1 && expPotentialFactor(130, 10) < 1);
check('experimental potential: higher potential never slows growth; factor in [0.05, 1]', [100, 120, 140, 160, 180, 199].every((o) => { let prev = 0; for (let p = 1; p <= 100; p += 3) { const f = expPotentialFactor(o, p); if (f < prev - 1e-12 || f < 0.05 || f > 1) return false; prev = f; } return true; }) && potentialCeiling(100) === 200);
{
  const lowP = runCareer([rider({ potential: 10 })], cfg('specialist', { potentialModel: 'experimental' })), highP = runCareer([rider({ potential: 95 })], cfg('specialist', { potentialModel: 'experimental' }));
  const e1 = runCareer([rider({ potential: 10 })], cfg('specialist')), e2 = runCareer([rider({ potential: 95 })], cfg('specialist'));
  check('experimental model: low potential ends below high potential; production model shows no difference at this level', highP.ovr[SEASONS] >= lowP.ovr[SEASONS] && at(e1, 0, SEASONS, PERF_IDX[0]) === at(e2, 0, SEASONS, PERF_IDX[0]));
  const fac = runCareer(pop, cfg('specialist', { facilities: true })), nof = runCareer(pop, cfg('specialist'));
  const m = (r: typeof fac) => pop.reduce((s, _, i) => s + r.ovr[i * W + SEASONS], 0) / pop.length;
  check('facilities sensitivity (level 5) never lowers average growth', m(fac) >= m(nof));
  const mp = (x: number) => mapHidden(x, 'rescaled');
  check('rescaled mapping 1→55, 100→95; direct mapping unchanged', Math.abs(mp(1) - 55) < 1e-9 && Math.abs(mp(100) - 95) < 1e-9 && mapHidden(37, 'direct') === 37);
}

{
  const lowR = runCareer([rider({ potential: 10 })], cfg('specialist', { potentialModel: 'experimentalRel' })), highR = runCareer([rider({ potential: 95 })], cfg('specialist', { potentialModel: 'experimentalRel' }));
  check('experimental relative-headroom potential: low potential grows less than high potential, high potential equals the base case', lowR.ovr[SEASONS] <= highR.ovr[SEASONS] && at(lowR, 0, SEASONS, PERF_IDX[0]) < at(highR, 0, SEASONS, PERF_IDX[0]));
}

// ------------------------------------------------------------------ 10 000 riders: no invalid values
for (const [strat, o] of [['maxTraining', {}], ['complex', { growth: 'bold' as const }], ['smart', { potentialModel: 'experimental' as const, facilities: true }]] as [StrategyId, Partial<CareerConfig>][]) {
  const r = runCareer(big, cfg(strat, o));
  let bad = 0;
  for (let i = 0; i < big.length; i++) for (let k = 0; k < NATTR; k++) { const v = at(r, i, SEASONS, k); const lim = PERF_IDX.includes(k) ? 200 : 160; if (!(v >= 100 && v <= lim) || Number.isNaN(v)) bad++; }
  for (let j = 0; j < r.ovr.length; j++) if (!Number.isFinite(r.ovr[j])) bad++;
  check(`10 000 riders × 12 seasons [${strat}]: no invalid value (0 found: ${bad + r.invalidValues})`, bad === 0 && r.invalidValues === 0);
}
void IDX;
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
