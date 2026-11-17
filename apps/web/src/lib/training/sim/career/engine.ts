import { SKILL_ATTRIBUTES, PERFORMANCE_MAX, type SkillAttribute } from '@/lib/rider/config';
import { developmentRoomFactor, localAttributeFactor, overallRating } from '@/lib/rider/score';
import { BASE_TRAINING, SESSION_COUNT, SECONDARY_ATTRIBUTE, SECONDARY_GAIN_SHARE, TECHNICAL_BASE, TRAINING_GAIN_THRESHOLD, trainabilityFactor, professionalismFactor, ageFactor } from '@/lib/training/config';
import { readinessEffectiveness, readinessScore } from '@/lib/training/readiness';
import { trainingCenterMultiplier, recoveryCenterMultiplier } from '@/lib/facilities/config';
import { mulberry32 } from '../rng';
import { mapHidden, type HiddenMapping, type SimRider } from '../population';
import {
  IDX, NATTR, PERF_IDX, TACT_IDX, TECH_IDX, EXP_IDX, TECH_W, TACT_W, STAGE_DAYS, TOUR_STAGES, TOUR_WEEKS_3, TOUR_WEEKS_4, SEASONS, WEEKS,
  RACE_GROWTH, raceRoom, stageLoad, RAIN_CHANCE, STAGE_PERF, ATTR_CAP_NONPERF, HARD_LOADS, LOADS_BASE, TECH_LOAD, DAYS_FOR,
  expPotentialFactor, expPotentialFactorRel, declinePerSeason, type HardLoadId, type GrowthVariant,
} from './params';
import { decide, regenFor, projectWeek, type Plan, type PlannerState, type PlannerView, type StrategyId } from './planners';

/** EXPERIMENTAL career engine: daily simulation of all 19 public attributes over many seasons. Nothing here touches a database. */
export interface CareerConfig {
  strategy: StrategyId;
  tours: 3 | 4;
  hardLoad: HardLoadId;
  gate: boolean;
  growth: GrowthVariant;
  potentialModel: 'existing' | 'experimental' | 'experimentalRel';
  mapping: HiddenMapping;
  /** sensitivity: facilities at level 5 (Training Center + Recovery Center); Rookie itself is capped at level 1 */
  facilities: boolean;
  decline: boolean;
  seasons: number;
  raceLoadScale: number;
  /** test hooks */
  log?: { riders: number };
  forceNoGrowth?: boolean;
}
export const defaultConfig = (strategy: StrategyId): CareerConfig => ({
  strategy, tours: 4, hardLoad: 'h22', gate: true, growth: 'conservative', potentialModel: 'existing', mapping: 'direct',
  facilities: false, decline: false, seasons: SEASONS, raceLoadScale: 1,
});

export interface CareerLogEntry { rider: number; season: number; week: number; decidedForWeek: number; plan: Plan | null }
export interface CareerExecEntry { rider: number; season: number; week: number; sessionsDone: number; tourWeek: boolean; plan: Plan | null; E: number; F: number }

export interface CareerResult {
  cfg: CareerConfig;
  n: number;
  seasons: number;
  /** attrs[rider][season (0..S)][attr]  — season 0 = start; Int16 */
  attrs: Int16Array;
  ovr: Float32Array; // n * (S+1)
  sessionsPlanned: Int32Array; sessionsDone: Int32Array; sessionsSkipped: Int32Array;
  plannedWeeks: Int32Array; restWeeks: Int32Array;
  exhaustedDays: Int32Array;
  tourCount: Int32Array;
  tourPreE: Float32Array; tourPreF: Float32Array; tourPostE: Float32Array; tourPostF: Float32Array; tourWeekEndE: Float32Array; tourWeekEndF: Float32Array;
  nextWeekScore: Float32Array; stageREff: Float32Array; stageTiredShare: Float32Array;
  formAtTour: Float32Array; moraleAtTour: Float32Array; fitnessAtTour: Float32Array;
  finalForm: Float32Array; finalFitness: Float32Array; finalMorale: Float32Array;
  sumStageIndex: Float32Array;
  invalidValues: number;
  hiddenSnapshot: Float64Array; // checksum of hidden values (they must never change)
  log?: CareerLogEntry[]; exec?: CareerExecEntry[];
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));
const bestPerfIdx = (a: ArrayLike<number>) => { let b = PERF_IDX[0]; for (const i of PERF_IDX) if (a[i] > a[b]) b = i; return b; };
const PERF_SET = new Set(PERF_IDX);

function perfMean(a: Float64Array): number { let s = 0; for (const i of PERF_IDX) s += a[i]; return s / PERF_IDX.length; }
function groupMean(a: ArrayLike<number>, idx: readonly number[]): number { let s = 0; for (const i of idx) s += a[i]; return s / idx.length; }
/** Fast twin of the official OVR (overallRating(), C-083 / model F4); the career test asserts equality. */
export function ovrOf(a: ArrayLike<number>): number {
  const p = PERF_IDX.map((i) => a[i]).sort((x, y) => y - x);
  let t = -Infinity, te = -Infinity;
  for (const i of TACT_IDX) if (a[i] > t) t = a[i];
  for (const i of TECH_IDX) if (a[i] > te) te = a[i];
  return Math.max(1, Math.min(200, Math.round((84 * (p[0] + p[1] + p[2]) + 24 * p.reduce((x, y) => x + y, 0) + 105 * t + 70 * te + 105 * a[EXP_IDX]) / 700)));
}
export const attrRecord = (a: ArrayLike<number>): Record<SkillAttribute, number> => {
  const r = {} as Record<SkillAttribute, number>;
  SKILL_ATTRIBUTES.forEach((k, i) => { r[k] = a[i]; });
  return r;
};

/** Stage weather: deterministic, identical for every rider and scenario. */
const rainTable: Record<string, boolean> = {};
function raining(season: number, week: number, stage: number): boolean {
  const key = `${season}|${week}|${stage}`;
  if (!(key in rainTable)) rainTable[key] = mulberry32(season * 10007 + week * 101 + stage * 7 + 20261115)() < RAIN_CHANCE;
  return rainTable[key];
}


/** Raw weekly Performance progress at readiness 1 (production formula; potential model switchable). Exported for parity tests. */
export function performanceWeekRaw(p: {
  att: ArrayLike<number>; focus: number; intensity: 'light' | 'normal' | 'hard'; tr: number; pr: number; po: number; poRaw: number;
  age: number; facility: number; model: 'existing' | 'experimental' | 'experimentalRel'; startOverall?: number;
}): { primary: number; secondary: number; secIdx: number } {
  let overall = 0; for (const i of PERF_IDX) overall += p.att[i]; overall /= PERF_IDX.length;
  const base = BASE_TRAINING * SESSION_COUNT[p.intensity] * trainabilityFactor(p.tr) * professionalismFactor(p.pr) * ageFactor(p.age) * p.facility;
  const room = (i: number): number => {
    const cur = p.att[i];
    if (cur >= PERFORMANCE_MAX) return 0;
    if (p.model === 'existing') return developmentRoomFactor(cur, overall, p.po);
    if (p.model === 'experimentalRel') return Math.max(0.05, localAttributeFactor(cur) * expPotentialFactorRel(overall, p.poRaw, p.startOverall ?? overall));
    return Math.max(0.05, localAttributeFactor(cur) * expPotentialFactor(overall, p.poRaw));
  };
  const secKey = SECONDARY_ATTRIBUTE[SKILL_ATTRIBUTES[p.focus]];
  const secIdx = secKey != null ? IDX[secKey] : -1;
  return {
    primary: Math.max(0, base * room(p.focus)), secIdx,
    secondary: secIdx >= 0 ? Math.max(0, base * (PERF_SET.has(secIdx) ? room(secIdx) : 1) * SECONDARY_GAIN_SHARE) : 0,
  };
}

export function runCareer(pop: readonly SimRider[], cfg: CareerConfig): CareerResult {
  const n = pop.length, S = cfg.seasons;
  const tourWeeks = cfg.tours === 4 ? TOUR_WEEKS_4 : TOUR_WEEKS_3;
  const isTour = (w: number) => tourWeeks.includes(w);
  const racing = cfg.strategy !== 'noTrainNoRace';
  const hard = HARD_LOADS[cfg.hardLoad];
  const rg = RACE_GROWTH[cfg.growth];
  const res: CareerResult = {
    cfg, n, seasons: S,
    attrs: new Int16Array(n * (S + 1) * NATTR), ovr: new Float32Array(n * (S + 1)),
    sessionsPlanned: new Int32Array(n), sessionsDone: new Int32Array(n), sessionsSkipped: new Int32Array(n),
    plannedWeeks: new Int32Array(n), restWeeks: new Int32Array(n), exhaustedDays: new Int32Array(n), tourCount: new Int32Array(n),
    tourPreE: new Float32Array(n), tourPreF: new Float32Array(n), tourPostE: new Float32Array(n), tourPostF: new Float32Array(n),
    tourWeekEndE: new Float32Array(n), tourWeekEndF: new Float32Array(n), nextWeekScore: new Float32Array(n),
    stageREff: new Float32Array(n), stageTiredShare: new Float32Array(n),
    formAtTour: new Float32Array(n), moraleAtTour: new Float32Array(n), fitnessAtTour: new Float32Array(n),
    finalForm: new Float32Array(n), finalFitness: new Float32Array(n), finalMorale: new Float32Array(n),
    sumStageIndex: new Float32Array(n),
    invalidValues: 0, hiddenSnapshot: new Float64Array(n * 4),
  };
  if (cfg.log) { res.log = []; res.exec = []; }
  const a = new Float64Array(NATTR), prog = new Float64Array(NATTR), seasonGain = new Int32Array(NATTR);
  const stageLoadsByWeek: Record<number, { energy: number; fatigue: number }[]> = {};
  for (const w of tourWeeks) stageLoadsByWeek[w] = TOUR_STAGES[w].map((s) => stageLoad(s, cfg.raceLoadScale));

  for (let ri = 0; ri < n; ri++) {
    const src = pop[ri];
    for (let i = 0; i < NATTR; i++) { a[i] = src.attrs[SKILL_ATTRIBUTES[i]]; prog[i] = 0; }
    const R = src.hidden.recovery; // innate — read-only
    const trRaw = src.hidden.trainability, prRaw = src.hidden.professionalism, poRaw = src.hidden.potential;
    const tr = mapHidden(trRaw, cfg.mapping), pr = mapHidden(prRaw, cfg.mapping), po = mapHidden(poRaw, cfg.mapping);
    res.hiddenSnapshot.set([poRaw, trRaw, prRaw, R], ri * 4);
    const recMult = cfg.facilities ? recoveryCenterMultiplier(5) : 1;
    const regen = { energy: 0, fatigue: 0 };
    { const r = regenFor(R); regen.energy = r.energy; regen.fatigue = r.fatigue; }
    const regE = Math.round(regen.energy * recMult), regF = Math.round(regen.fatigue * recMult);
    const trF = trainabilityFactor(tr), prF = professionalismFactor(pr);
    let E = src.energy, F = src.fatigue, form = 50, fitness = 60, morale = 70;
    let age = src.age;
    const startFocus = bestPerfIdx(a);
    const startOverall = perfMean(a);
    const pst: PlannerState = { counter: 0 };
    let rHat = 50;
    let planNow: Plan | null = null;
    const base = ri * (S + 1);
    const snap = (s: number) => { for (let i = 0; i < NATTR; i++) res.attrs[(base + s) * NATTR + i] = a[i]; res.ovr[base + s] = ovrOf(a); };
    snap(0);
    let tourN = 0, stageN = 0, stageRSum = 0, stageTired = 0, stageIdxSum = 0;
    let exhaustedDays = 0;

    const credit = (i: number, raw: number, cap: number, perCallMax: number): void => {
      if (cfg.forceNoGrowth) return;
      if (seasonGain[i] >= cap) return;
      const p = prog[i] + raw;
      let g = Math.floor((p + 1e-9) / TRAINING_GAIN_THRESHOLD);
      g = Math.min(g, cap - seasonGain[i], Math.max(0, ATTR_CAP_NONPERF - a[i]), perCallMax);
      if (g < 0) g = 0;
      a[i] += g; seasonGain[i] += g;
      let rest = p - g * TRAINING_GAIN_THRESHOLD;
      if (seasonGain[i] >= cap) rest = Math.min(rest, TRAINING_GAIN_THRESHOLD - 1e-6);
      prog[i] = Math.max(0, rest);
    };
    const perfCredit = (i: number, raw: number): void => { // production Performance accumulator (no seasonal cap; 200 ceiling)
      if (cfg.forceNoGrowth) return;
      const p = prog[i] + raw;
      let g = Math.floor((p + 1e-9) / TRAINING_GAIN_THRESHOLD);
      g = Math.min(g, Math.max(0, PERFORMANCE_MAX - a[i]));
      a[i] += g; prog[i] = Math.max(0, p - g * TRAINING_GAIN_THRESHOLD);
    };

    const perfWeekRaw = (focus: number, intensity: 'light' | 'normal' | 'hard', att: Float64Array, ageNow: number) =>
      performanceWeekRaw({ att, focus, intensity, tr, pr, po, poRaw, age: ageNow, facility: cfg.facilities ? trainingCenterMultiplier(5, ageNow) : 1, model: cfg.potentialModel, startOverall });

    for (let s = 1; s <= S; s++) {
      seasonGain.fill(0);
      if (s > 1) {
        age += 1; // production: +1 age at the start of each season
        if (cfg.decline) { const d = declinePerSeason(age); if (d > 0) for (const i of PERF_IDX) a[i] = Math.max(100, a[i] - d); }
      }
      planNow = null; // the plan of week 1 does not exist (preparation week)
      for (let w = 1; w <= WEEKS; w++) {
        const tourNow = isTour(w) && racing;
        const stageLoads = isTour(w) ? stageLoadsByWeek[w] : [];
        // ----- decide the plan of the NEXT week (made now, immutable afterwards) -----
        let planNext: Plan | null = null;
        if (w < WEEKS) {
          const target = w + 1;
          let toTour = Infinity;
          for (const tw of tourWeeks) if (tw > target) { toTour = tw - target; break; }
          const view: PlannerView = {
            season: s, week: w, target, targetIsTour: isTour(target), currentIsTour: isTour(w), currentPlan: planNow,
            weeksToTourAfterTarget: toTour, age, attrs: a, energy: E, fatigue: F, rHat, startFocus, hardLoad: hard, gate: cfg.gate,
            currentStageLoads: racing ? stageLoads : [], counter: pst.counter,
          };
          if (cfg.strategy === 'oracle') planNext = decideOracle(view, { R, regE, regF, perf: (f, it) => perfWeekRaw(f, it, a, age), tourWeeks, stageLoadsByWeek, hard, gate: cfg.gate }, a);
          else planNext = decide(cfg.strategy, view, pst);
          if (res.log && ri < cfg.log!.riders) res.log.push({ rider: ri, season: s, week: w, decidedForWeek: target, plan: planNext ? { ...planNext } : null });
        }
        const plan = planNow; // the confirmed plan of THIS week
        if (plan && isTour(w)) throw new Error('plan inside a Tour week'); // planners must never produce this
        if (plan) res.plannedWeeks[ri]++; else if (w >= 2 && !isTour(w)) res.restWeeks[ri]++;

        // frozen weekly factors
        let perPrimary = 0, perSecondary = 0, secIdx = -1, techPerSession = 0;
        if (plan?.kind === 'perf') {
          const g = perfWeekRaw(plan.focus, plan.intensity, a, age);
          perPrimary = g.primary / SESSION_COUNT[plan.intensity]; perSecondary = g.secondary / SESSION_COUNT[plan.intensity]; secIdx = g.secIdx;
        } else if (plan?.kind === 'tech') {
          techPerSession = TECHNICAL_BASE * trF * prF * ageFactor(age);
        }
        const sessionDays = plan ? (plan.kind === 'tech' ? [1] : DAYS_FOR[plan.intensity]) : [];
        const sessionLoad = plan ? (plan.kind === 'tech' ? TECH_LOAD : plan.intensity === 'hard' ? hard : LOADS_BASE[plan.intensity]) : null;
        let doneThisWeek = 0;
        let weekRainStages = 0; void weekRainStages;

        for (let d = 0; d < 7; d++) {
          let share = 1;
          const stageIdx = tourNow ? STAGE_DAYS.indexOf(d) : -1;
          if (stageIdx >= 0) {
            const st = TOUR_STAGES[w][stageIdx];
            const sc = readinessScore(E, F);
            const rEff = readinessEffectiveness(sc);
            if (stageIdx === 0) { res.tourPreE[ri] += E; res.tourPreF[ri] += F; res.formAtTour[ri] += form; res.moraleAtTour[ri] += morale; res.fitnessAtTour[ri] += fitness; tourN++; }
            stageN++; stageRSum += rEff; if (rEff <= 0.70) stageTired++;
            // hypothetical stage-performance index (EXP, not a race result): relevant public attributes x readiness
            let idxSum = 0; for (const k of STAGE_PERF[st.kind]) idxSum += a[IDX[k]]; stageIdxSum += (idxSum / STAGE_PERF[st.kind].length) * rEff;
            // ---- race growth (EXP): relevance-weighted, shares the accumulators with training, joint seasonal caps ----
            const size = st.kind === 'tt' ? 0.6 : Math.max(0.3, Math.min(1.2, st.km / 150));
            const ageF = ageFactor(age);
            const rain = raining(s, w, stageIdx);
            for (let j = 0; j < TACT_IDX.length; j++) {
              const wt = TACT_W[st.kind][j]; if (wt <= 0) continue;
              credit(TACT_IDX[j], rg.tactics * wt * size * rEff * trF * ageF * raceRoom(a[TACT_IDX[j]]), rg.capTactics, Infinity);
            }
            for (let j = 0; j < TECH_IDX.length; j++) {
              let wt = TECH_W[st.kind][j];
              if (j === 4) wt = rain ? 1 : 0; else if (j === 5) wt = st.rough ? 1 : 0;
              if (wt <= 0) continue;
              credit(TECH_IDX[j], rg.technique * wt * size * rEff * trF * ageF * raceRoom(a[TECH_IDX[j]]), rg.capTechnique, Infinity);
            }
            credit(EXP_IDX, rg.experience * size * raceRoom(a[EXP_IDX]), rg.capExperience, Infinity);
            const L = stageLoads[stageIdx];
            E = clamp100(E - L.energy); F = clamp100(F + L.fatigue); share = 0.5;
            fitness = Math.min(100, fitness + 1.0);
            morale = Math.max(0, Math.min(100, morale + (rEff >= 0.85 ? 0.5 : rEff >= 0.7 ? -0.5 : rEff > 0.5 ? -1 : -2)));
          } else if (plan && sessionDays.includes(d)) {
            res.sessionsPlanned[ri]++;
            if (cfg.gate && (E < 30 || F > 75)) { res.sessionsSkipped[ri]++; morale = Math.max(0, morale - 0.5); }
            else {
              const rEff = readinessEffectiveness(readinessScore(E, F));
              if (plan.kind === 'perf') {
                perfCredit(plan.focus, perPrimary * rEff);
                if (secIdx >= 0 && perSecondary > 0) { if (PERF_SET.has(secIdx)) perfCredit(secIdx, perSecondary * rEff); else credit(secIdx, perSecondary * rEff, 99, Infinity); }
              } else {
                credit(plan.focus, techPerSession * rEff, RACE_GROWTH[cfg.growth].capTechnique, 1); // production cap: +1 per technical plan
              }
              E = clamp100(E - sessionLoad!.energy); F = clamp100(F + sessionLoad!.fatigue); share = 0.5;
              res.sessionsDone[ri]++; doneThisWeek++; fitness = Math.min(100, fitness + 0.8);
            }
          }
          // regeneration
          const e0 = E;
          E = clamp100(E + Math.round(regE * share)); F = clamp100(F - Math.round(regF * share));
          if (share === 1 && e0 + regE <= 100 && regE > 0) rHat = Math.max(1, Math.min(100, ((E - e0) - 8) / 8 * 100)); // observable free-day energy gain
          fitness = Math.max(0, fitness - 0.15);
          form += 0.25 * (0.5 * readinessScore(E, F) + 0.5 * fitness - form);
          morale += 0.03 * (70 - morale);
          if (!(E >= 0 && E <= 100 && F >= 0 && F <= 100) || !Number.isFinite(E) || !Number.isFinite(F)) res.invalidValues++;
          if (E <= 10 || F >= 90) exhaustedDays++;
          if (tourNow && d === STAGE_DAYS[STAGE_DAYS.length - 1]) { res.tourPostE[ri] += E; res.tourPostF[ri] += F; morale = Math.min(100, morale + 2); }
        }
        if (tourNow) { res.tourWeekEndE[ri] += E; res.tourWeekEndF[ri] += F; res.nextWeekScore[ri] += readinessScore(E, F); res.tourCount[ri]++; }
        if (res.exec && ri < cfg.log!.riders) res.exec.push({ rider: ri, season: s, week: w, sessionsDone: doneThisWeek, tourWeek: isTour(w), plan: plan ? { ...plan } : null, E, F });
        planNow = planNext;
      }
      snap(s);
    }
    res.exhaustedDays[ri] = exhaustedDays;
    if (res.tourCount[ri] > 0) {
      const c = res.tourCount[ri];
      res.tourPreE[ri] /= c; res.tourPreF[ri] /= c; res.tourPostE[ri] /= c; res.tourPostF[ri] /= c; res.tourWeekEndE[ri] /= c; res.tourWeekEndF[ri] /= c; res.nextWeekScore[ri] /= c;
      res.formAtTour[ri] /= c; res.moraleAtTour[ri] /= c; res.fitnessAtTour[ri] /= c;
    }
    if (stageN > 0) { res.stageREff[ri] = stageRSum / stageN; res.stageTiredShare[ri] = stageTired / stageN; res.sumStageIndex[ri] = stageIdxSum / stageN; }
    res.finalForm[ri] = form; res.finalFitness[ri] = fitness; res.finalMorale[ri] = morale;
    for (let i = 0; i < NATTR; i++) {
      const lim = PERF_SET.has(i) ? PERFORMANCE_MAX : ATTR_CAP_NONPERF;
      const start = src.attrs[SKILL_ATTRIBUTES[i]];
      if (!Number.isFinite(a[i]) || a[i] > lim || a[i] < (cfg.decline ? 100 : start) || a[i] < 100) res.invalidValues++;
    }
  }
  return res;
}

// ------------------------------------------------------------------ oracle (theoretical control only)
interface OracleTruth {
  R: number; regE: number; regF: number;
  perf: (focus: number, intensity: 'light' | 'normal' | 'hard') => { primary: number; secondary: number };
  tourWeeks: readonly number[];
  stageLoadsByWeek: Record<number, { energy: number; fatigue: number }[]>;
  hard: { energy: number; fatigue: number }; gate: boolean;
}
/** Knows the exact innate recovery and the exact state: picks the plan with the largest 2-week progress. NOT a playable strategy. */
function decideOracle(v: PlannerView, t: OracleTruth, a: Float64Array): Plan | null {
  if (v.targetIsTour || v.target > 10) return null;
  const regen = { energy: t.regE, fatigue: t.regF };
  const cur = projectWeek(v.energy, v.fatigue, regen, v.currentPlan, v.currentStageLoads, t.hard, t.gate);
  let focus = PERF_IDX[0]; for (const i of PERF_IDX) if (a[i] < a[focus]) focus = i;
  const nextIsTourAfter = v.weeksToTourAfterTarget === 1;
  let best: Plan | null = null, bestScore = 0;
  for (const it of ['light', 'normal', 'hard'] as const) {
    const p: Plan = { kind: 'perf', intensity: it, focus };
    const w1 = projectWeek(cur.energy, cur.fatigue, regen, p, [], t.hard, t.gate);
    const raw = t.perf(focus, it); const per = (raw.primary + raw.secondary) / SESSION_COUNT[it];
    let score = per * w1.sumRE;
    const nextStages = nextIsTourAfter ? t.stageLoadsByWeek[v.target + 1] ?? [] : [];
    if (v.target < 9) {
      const p2: Plan = { kind: 'perf', intensity: 'normal', focus };
      const w2 = projectWeek(w1.energy, w1.fatigue, regen, nextIsTourAfter ? null : p2, nextStages, t.hard, t.gate);
      score += nextIsTourAfter ? 0 : (t.perf(focus, 'normal').primary + t.perf(focus, 'normal').secondary) / 2 * w2.sumRE;
      // penalise ending exhausted
      if (w2.minEnergy <= 10 || w2.maxFatigue >= 90) score -= 1e3;
    }
    if (w1.minEnergy <= 10 || w1.maxFatigue >= 90) score -= 1e3;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}
