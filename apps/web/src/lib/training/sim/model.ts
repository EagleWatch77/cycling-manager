import { SKILL_ATTRIBUTES, PERFORMANCE_MAX, type SkillAttribute } from '@/lib/rider/config';
import { overallRating, riderOverall } from '@/lib/rider/score';
import { SESSION_COUNT, SECONDARY_ATTRIBUTE, type TrainingIntensity } from '../config';
import { calculatePerformanceRawGrowth } from '../growth';
import { accumulateProgress } from '../accumulator';
import { applyConditionDelta, clamp100, weeklyConditionDelta } from '../condition';
import { readinessEffectiveness, readinessScore } from '../readiness';
import { mapHidden, type HiddenMapping, type SimRider } from './population';

/**
 * EXPERIMENTAL daily-training model + faithful copy of the PRODUCTION weekly
 * model, run on the same population. Nothing here touches a database. The
 * growth maths (BASE_TRAINING, trainability/professionalism/age factors,
 * developmentRoomFactor, readiness, accumulator threshold 12, condition delta)
 * is imported from the production modules, never re-implemented, so the
 * baseline cannot drift from the real game.
 */
export const WEEKS_PER_SEASON = 10;
/** Rookie Tour weeks used by the Tour scenarios: 3 Tours per season (data/tourSchedule.ts weeks 2 / 5 / 7). */
export const TOUR_WEEKS: readonly number[] = [2, 5, 7];

/** Mon..Sun = 0..6, identical to the planner UI (TrainingConfigForm PERFORMANCE_TRAIN_DAYS). */
export const TRAIN_DAYS: Record<TrainingIntensity, readonly number[]> = { light: [1], normal: [1, 3], hard: [1, 3, 5] };
/** PROPOSED per-session load (experimental). */
export const SESSION_LOAD: Record<TrainingIntensity, { energy: number; fatigue: number }> = {
  light: { energy: 12, fatigue: 8 }, normal: { energy: 18, fatigue: 12 }, hard: { energy: 24, fatigue: 18 },
};
/** PROPOSED daily regeneration for innate recovery R (1–100). */
export function dailyRegen(R: number): { energy: number; fatigue: number } {
  return { energy: 8 + Math.round((8 * R) / 100), fatigue: 5 + Math.round((6 * R) / 100) };
}
/** Share of daily regeneration on a training day (after the session). */
export const TRAINING_DAY_REGEN_SHARE = 0.5;
/** Experimental gate: below this energy or above this fatigue the session does not take place. */
export const GATE_MIN_ENERGY = 30;
export const GATE_MAX_FATIGUE = 75;
/** HYPOTHESIS only (real race energy/fatigue is not integrated): a Tour week has 5 race days Tue–Sat. */
export const RACE_DAYS: readonly number[] = [1, 2, 3, 4, 5];
export const RACE_DAY_LOAD = { energy: 15, fatigue: 10 };

export type Policy = 'none' | 'light' | 'normal' | 'hard' | 'rotate' | 'smart';
export type CalendarKind = 'noTour' | 'tour' | 'tourLoad';
/** weekly = production model as it is today; daily = proposed; dailyGate = proposed + session gate. */
export type ModelKind = 'weekly' | 'daily' | 'dailyGate';

export interface ScenarioConfig {
  model: ModelKind;
  policy: Policy;
  calendar: CalendarKind;
  mapping?: HiddenMapping;
  seasons?: number;
  /** Test hook: force the readiness multiplier (removes the readiness difference between weekly and daily). */
  forceReadiness?: number;
  /** Sensitivity hook: replace the proposed per-session load of an intensity (used only to evaluate alternatives, never a rule). */
  loadOverride?: Partial<Record<TrainingIntensity, { energy: number; fatigue: number }>>;
  /** Test hook: record a per-week trace for the first N riders. */
  trace?: number;
}

export interface WeekTrace { season: number; week: number; plan: TrainingIntensity | null; progressAdded: number; sessions: number; age: number; energy: number; fatigue: number }

export interface RunResult {
  cfg: ScenarioConfig;
  n: number;
  ovr0: Float64Array; ovr1: Float64Array; ovr3: Float64Array;
  legacy0: Float64Array; legacy1: Float64Array; legacy3: Float64Array;
  /** Mean attribute change per attribute after season 1 / the last season. */
  attrGain1: number[]; attrGain3: number[];
  /** Mean change of the trained focus attribute (primary) after season 1 / last. */
  focusGain1: Float64Array; focusGain3: Float64Array;
  weekEndEnergy: number[]; weekEndFatigue: number[];
  trainWeekEnergy: number; trainWeekFatigue: number;
  sessionsPlanned: number; sessionsDone: number; sessionsSkipped: number;
  plannedWeeks: number;
  readinessBands: number[];
  exhaustedRiders: number; exhaustedRiderDays: number;
  invalidValues: number;
  trace?: WeekTrace[][];
}

const IDX = Object.fromEntries(SKILL_ATTRIBUTES.map((k, i) => [k, i])) as Record<SkillAttribute, number>;
const ROTATION: readonly TrainingIntensity[] = ['light', 'normal', 'hard'];

export const isTourWeek = (calendar: CalendarKind, week: number): boolean => calendar !== 'noTour' && TOUR_WEEKS.includes(week);
/** Rules: week 1 is preparation (no plan); the plan for week N is made in week N-1, so week 10 is the last trained week; no training in a Tour week. */
export const isTrainableWeek = (calendar: CalendarKind, week: number): boolean => week >= 2 && week <= WEEKS_PER_SEASON && !isTourWeek(calendar, week);

/** Sensible planner: picks the intensity from the rider's readiness at the start of the week (null = rest week, no plan). */
export function smartIntensity(energy: number, fatigue: number): TrainingIntensity | null {
  const s = readinessScore(energy, fatigue);
  if (s >= 75) return 'hard';
  if (s >= 55) return 'normal';
  if (s >= 35) return 'light';
  return null;
}

function bandOf(score: number): number { return score >= 80 ? 0 : score >= 60 ? 1 : score >= 40 ? 2 : score >= 20 ? 3 : 4; }

export function runScenario(pop: readonly SimRider[], cfg: ScenarioConfig): RunResult {
  const seasons = cfg.seasons ?? 3;
  const mapping: HiddenMapping = cfg.mapping ?? 'rescaled';
  const daily = cfg.model !== 'weekly';
  const gate = cfg.model === 'dailyGate';
  const totalWeeks = seasons * WEEKS_PER_SEASON;
  const n = pop.length;
  const res: RunResult = {
    cfg, n,
    ovr0: new Float64Array(n), ovr1: new Float64Array(n), ovr3: new Float64Array(n),
    legacy0: new Float64Array(n), legacy1: new Float64Array(n), legacy3: new Float64Array(n),
    attrGain1: new Array(SKILL_ATTRIBUTES.length).fill(0), attrGain3: new Array(SKILL_ATTRIBUTES.length).fill(0),
    focusGain1: new Float64Array(n), focusGain3: new Float64Array(n),
    weekEndEnergy: new Array(totalWeeks).fill(0), weekEndFatigue: new Array(totalWeeks).fill(0),
    trainWeekEnergy: 0, trainWeekFatigue: 0,
    sessionsPlanned: 0, sessionsDone: 0, sessionsSkipped: 0, plannedWeeks: 0,
    readinessBands: [0, 0, 0, 0, 0], exhaustedRiders: 0, exhaustedRiderDays: 0, invalidValues: 0,
  };
  if (cfg.trace) res.trace = [];
  let trainWeekCount = 0;

  for (let ri = 0; ri < n; ri++) {
    const src = pop[ri];
    const attrs = { ...src.attrs };
    const start = { ...src.attrs };
    const trace: WeekTrace[] | null = cfg.trace && ri < cfg.trace ? [] : null;
    let age = src.age;
    let E = src.energy, F = src.fatigue;
    const R = src.hidden.recovery; // innate, never written
    const tr = mapHidden(src.hidden.trainability, mapping);
    const pr = mapHidden(src.hidden.professionalism, mapping);
    const po = mapHidden(src.hidden.potential, mapping);
    const regen = dailyRegen(R);
    const prog = new Float64Array(SKILL_ATTRIBUTES.length);
    const secondary = SECONDARY_ATTRIBUTE[src.focus];
    res.ovr0[ri] = overallRating(attrs); res.legacy0[ri] = riderOverall(attrs);
    let rotation = 0;
    let exhausted = false;
    let focusStart = attrs[src.focus];

    const addProgress = (k: SkillAttribute, raw: number) => {
      const i = IDX[k];
      const { gain, remainingProgress } = accumulateProgress(prog[i], raw);
      prog[i] = remainingProgress;
      if (gain > 0) attrs[k] = Math.min(PERFORMANCE_MAX, attrs[k] + gain);
    };
    const checkRange = () => { if (!(E >= 0 && E <= 100 && F >= 0 && F <= 100) || !Number.isFinite(E) || !Number.isFinite(F)) res.invalidValues++; };
    const checkExhausted = () => { if (E <= 10 || F >= 90) { res.exhaustedRiderDays++; exhausted = true; } };

    for (let s = 1; s <= seasons; s++) {
      for (let w = 1; w <= WEEKS_PER_SEASON; w++) {
        const gw = (s - 1) * WEEKS_PER_SEASON + w; // 1-based global week
        let plan: TrainingIntensity | null = null;
        if (isTrainableWeek(cfg.calendar, w)) {
          if (cfg.policy === 'light' || cfg.policy === 'normal' || cfg.policy === 'hard') plan = cfg.policy;
          else if (cfg.policy === 'rotate') plan = ROTATION[rotation++ % 3];
          else if (cfg.policy === 'smart') plan = smartIntensity(E, F);
        }
        let weekProgress = 0, weekSessions = 0;
        if (plan) res.plannedWeeks++;

        if (!daily) {
          // PRODUCTION weekly model: readiness from the state before the week, cost applied once, no regeneration without a plan.
          if (plan) {
            const score0 = readinessScore(E, F);
            const rEff = cfg.forceReadiness ?? readinessEffectiveness(score0);
            const g = calculatePerformanceRawGrowth({
              focus: src.focus, intensity: plan, attributes: attrs, trainability: tr, professionalism: pr, age, potential: po,
              facilityMultiplier: 1, readinessFactor: rEff,
            });
            addProgress(src.focus, g.primaryRaw); weekProgress += g.primaryRaw;
            if (g.secondaryAttr && g.secondaryRaw != null) { addProgress(g.secondaryAttr, g.secondaryRaw); weekProgress += g.secondaryRaw; }
            const c = applyConditionDelta({ energy: E, fatigue: F }, weeklyConditionDelta({ weekType: 'performance', intensity: plan, recoveryMultiplier: 1 }));
            E = c.energy; F = c.fatigue;
            res.sessionsPlanned += SESSION_COUNT[plan]; res.sessionsDone += SESSION_COUNT[plan]; weekSessions = SESSION_COUNT[plan];
            res.readinessBands[bandOf(score0)] += SESSION_COUNT[plan];
          }
          checkRange(); checkExhausted();
        } else {
          // PROPOSED daily model. Week factors are frozen at the start of the week (so splitting a week into sessions cannot add growth).
          let perSession = { primary: 0, secondary: 0 };
          if (plan) {
            const g = calculatePerformanceRawGrowth({
              focus: src.focus, intensity: plan, attributes: attrs, trainability: tr, professionalism: pr, age, potential: po,
              facilityMultiplier: 1, readinessFactor: 1,
            });
            perSession = { primary: g.primaryRaw / SESSION_COUNT[plan], secondary: (g.secondaryRaw ?? 0) / SESSION_COUNT[plan] };
          }
          const raceWeek = cfg.calendar === 'tourLoad' && TOUR_WEEKS.includes(w);
          for (let d = 0; d < 7; d++) {
            const isTrain = plan != null && TRAIN_DAYS[plan].includes(d);
            const isRace = raceWeek && RACE_DAYS.includes(d);
            let full = true; // full (100 %) daily regeneration unless a load happened today
            if (isTrain) {
              res.sessionsPlanned++;
              if (gate && (E < GATE_MIN_ENERGY || F > GATE_MAX_FATIGUE)) {
                res.sessionsSkipped++; // no progress, no load, full regeneration
              } else {
                const score = readinessScore(E, F);
                const rEff = cfg.forceReadiness ?? readinessEffectiveness(score);
                res.readinessBands[bandOf(score)]++;
                const p = perSession.primary * rEff, q = perSession.secondary * rEff;
                addProgress(src.focus, p); weekProgress += p;
                if (secondary) { addProgress(secondary, q); weekProgress += q; }
                const load = cfg.loadOverride?.[plan!] ?? SESSION_LOAD[plan!];
                E = clamp100(E - load.energy); F = clamp100(F + load.fatigue);
                res.sessionsDone++; weekSessions++; full = false;
              }
            } else if (isRace) {
              E = clamp100(E - RACE_DAY_LOAD.energy); F = clamp100(F + RACE_DAY_LOAD.fatigue); full = false;
            }
            const share = full ? 1 : TRAINING_DAY_REGEN_SHARE;
            E = clamp100(E + Math.round(regen.energy * share));
            F = clamp100(F - Math.round(regen.fatigue * share));
            checkRange(); checkExhausted();
          }
        }

        res.weekEndEnergy[gw - 1] += E; res.weekEndFatigue[gw - 1] += F;
        if (plan) { res.trainWeekEnergy += E; res.trainWeekFatigue += F; trainWeekCount++; }
        trace?.push({ season: s, week: w, plan, progressAdded: weekProgress, sessions: weekSessions, age, energy: E, fatigue: F });
      }
      if (s === 1) { res.ovr1[ri] = overallRating(attrs); res.legacy1[ri] = riderOverall(attrs); res.focusGain1[ri] = attrs[src.focus] - focusStart; SKILL_ATTRIBUTES.forEach((k, i) => { res.attrGain1[i] += attrs[k] - start[k]; }); }
      age += 1; // production: +1 age at each season start
    }
    res.ovr3[ri] = overallRating(attrs); res.legacy3[ri] = riderOverall(attrs); res.focusGain3[ri] = attrs[src.focus] - focusStart;
    SKILL_ATTRIBUTES.forEach((k, i) => { res.attrGain3[i] += attrs[k] - start[k]; });
    if (exhausted) res.exhaustedRiders++;
    for (const k of SKILL_ATTRIBUTES) if (!Number.isFinite(attrs[k]) || attrs[k] < start[k] || attrs[k] > PERFORMANCE_MAX) res.invalidValues++;
    if (trace && res.trace) res.trace.push(trace);
  }
  for (let i = 0; i < totalWeeks; i++) { res.weekEndEnergy[i] /= n; res.weekEndFatigue[i] /= n; }
  res.attrGain1 = res.attrGain1.map((v) => v / n); res.attrGain3 = res.attrGain3.map((v) => v / n);
  if (trainWeekCount > 0) { res.trainWeekEnergy /= trainWeekCount; res.trainWeekFatigue /= trainWeekCount; }
  return res;
}
