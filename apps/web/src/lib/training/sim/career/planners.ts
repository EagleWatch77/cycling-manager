import { readinessScore } from '@/lib/training/readiness';
import type { TrainingIntensity } from '@/lib/training/config';
import { DAYS_FOR, LOADS_BASE, PERF_IDX, TECHNICAL_FOCUS_IDX, TECH_LOAD, type HardLoadId, HARD_LOADS } from './params';

/**
 * EXPERIMENTAL career strategies. A planner picks the plan of the NEXT week and is only ever
 * given a PlannerView: public attributes, the visible energy/fatigue, the calendar and what the
 * manager can OBSERVE (rHat = recovery speed read from the daily energy gain). It NEVER receives
 * hidden values. (Test: this file must not mention hidden values; the 'oracle' lives in oracle.ts.)
 */
export type StrategyId =
  | 'specialist' | 'allrounder' | 'complex' | 'racer' | 'maxTraining' | 'smart'
  | 'noTrainRace' | 'noTrainNoRace' | 'oracle';
export interface Plan { kind: 'perf' | 'tech'; intensity: TrainingIntensity; focus: number }

export interface PlannerView {
  season: number;
  /** current week (the plan is for week + 1) */
  week: number;
  target: number;
  targetIsTour: boolean;
  currentIsTour: boolean;
  currentPlan: Plan | null;
  /** weeks from the target week to the next Tour week strictly after the target (Infinity if none this season) */
  weeksToTourAfterTarget: number;
  age: number;
  attrs: ArrayLike<number>;
  energy: number;
  fatigue: number;
  /** estimated innate recovery, derived only from observed daily energy gains */
  rHat: number;
  startFocus: number;
  hardLoad: { energy: number; fatigue: number };
  gate: boolean;
  /** stage loads of the current week's Tour (empty when it is not a Tour week) — public calendar info */
  currentStageLoads: ReadonlyArray<{ energy: number; fatigue: number }>;
  counter: number;
}

/** EXP thresholds of the 'smart' manager on the PROJECTED readiness score at the start of the planned week. */
export const SMART_THRESHOLDS = { hard: 75, normal: 55, light: 35, oldAge: 29 };

export interface PlannerState { counter: number }

const lowest = (attrs: ArrayLike<number>, idx: readonly number[]): number => {
  let best = idx[0];
  for (const i of idx) if (attrs[i] < attrs[best]) best = i;
  return best;
};
const mean = (attrs: ArrayLike<number>, idx: readonly number[]): number => idx.reduce((s, i) => s + attrs[i], 0) / idx.length;

export function loadOf(plan: Plan, hard: { energy: number; fatigue: number }): { energy: number; fatigue: number } {
  if (plan.kind === 'tech') return TECH_LOAD;
  return plan.intensity === 'hard' ? hard : LOADS_BASE[plan.intensity];
}
export const daysOf = (plan: Plan): readonly number[] => (plan.kind === 'tech' ? [1] : DAYS_FOR[plan.intensity]);

/** Dry run of one week of condition only (no growth) — used by planners with an ESTIMATED regeneration. */
export function projectWeek(
  E: number, F: number, rIdxRegen: { energy: number; fatigue: number }, plan: Plan | null,
  stageLoads: ReadonlyArray<{ energy: number; fatigue: number }>, hard: { energy: number; fatigue: number }, gate: boolean,
): { energy: number; fatigue: number; doneSessions: number; sumRE: number; minEnergy: number; maxFatigue: number } {
  let done = 0, sumRE = 0, minE = E, maxF = F;
  const days = plan ? daysOf(plan) : [];
  const load = plan ? loadOf(plan, hard) : null;
  for (let d = 0; d < 7; d++) {
    let share = 1;
    const stage = stageLoads.length > 0 ? STAGE_DAYS_LOCAL.indexOf(d) : -1;
    if (stage >= 0) {
      E = clamp(E - stageLoads[stage].energy); F = clamp(F + stageLoads[stage].fatigue); share = 0.5;
    } else if (plan && stageLoads.length === 0 && days.includes(d)) {
      if (gate && (E < 30 || F > 75)) { /* skipped: full regeneration */ }
      else {
        const sc = readinessScore(E, F);
        sumRE += sc >= 80 ? 1 : sc >= 60 ? 0.95 : sc >= 40 ? 0.85 : sc >= 20 ? 0.7 : 0.5;
        E = clamp(E - load!.energy); F = clamp(F + load!.fatigue); share = 0.5; done++;
      }
    }
    E = clamp(E + Math.round(rIdxRegen.energy * share)); F = clamp(F - Math.round(rIdxRegen.fatigue * share));
    if (E < minE) minE = E; if (F > maxF) maxF = F;
  }
  return { energy: E, fatigue: F, doneSessions: done, sumRE, minEnergy: minE, maxFatigue: maxF };
}
const STAGE_DAYS_LOCAL = [1, 2, 3];
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function regenFor(R: number): { energy: number; fatigue: number } {
  return { energy: 8 + Math.round((8 * R) / 100), fatigue: 5 + Math.round((6 * R) / 100) };
}

export function decide(strategy: StrategyId, v: PlannerView, st: PlannerState): Plan | null {
  if (v.targetIsTour || v.target > 10) return null; // no training in a Tour week; week 10's decision would target the next season
  switch (strategy) {
    case 'noTrainRace': case 'noTrainNoRace': return null;
    case 'specialist': return { kind: 'perf', intensity: 'normal', focus: v.startFocus };
    case 'maxTraining': return { kind: 'perf', intensity: 'hard', focus: v.startFocus };
    case 'allrounder': return { kind: 'perf', intensity: 'normal', focus: lowest(v.attrs, PERF_IDX) };
    case 'complex': {
      const c = st.counter++ % 3; // two performance weeks (weakest attribute), then one technical week (weakest technique)
      return c < 2 ? { kind: 'perf', intensity: 'normal', focus: lowest(v.attrs, PERF_IDX) }
        : { kind: 'tech', intensity: 'light', focus: lowest(v.attrs, TECHNICAL_FOCUS_IDX) };
    }
    case 'racer': {
      // Tour readiness first: rest right before a Tour, light after one and when the next Tour is close.
      if (v.weeksToTourAfterTarget === 1 || v.targetIsTour) return null;
      const afterTour = v.currentIsTour;
      if (afterTour || v.weeksToTourAfterTarget === 2) return { kind: 'perf', intensity: 'light', focus: lowest(v.attrs, PERF_IDX) };
      return { kind: 'perf', intensity: 'normal', focus: lowest(v.attrs, PERF_IDX) };
    }
    case 'smart': {
      const proj = projectWeek(v.energy, v.fatigue, regenFor(v.rHat), v.currentPlan, v.currentStageLoads, v.hardLoad, v.gate);
      const score = readinessScore(proj.energy, proj.fatigue);
      const focus = lowest(v.attrs, PERF_IDX);
      let intensity: TrainingIntensity | null = score >= SMART_THRESHOLDS.hard ? 'hard' : score >= SMART_THRESHOLDS.normal ? 'normal' : score >= SMART_THRESHOLDS.light ? 'light' : null;
      if (intensity === 'hard' && v.age >= SMART_THRESHOLDS.oldAge) intensity = 'normal'; // old riders return little for a hard week
      if (v.weeksToTourAfterTarget === 1 && intensity) intensity = 'light'; // taper into a Tour
      if (!intensity) return null;
      if (intensity === 'light' && mean(v.attrs, [...PERF_IDX]) > mean(v.attrs, [...TECHNICAL_FOCUS_IDX])) {
        return { kind: 'tech', intensity: 'light', focus: lowest(v.attrs, TECHNICAL_FOCUS_IDX) }; // low readiness: a technical session costs only 5/5
      }
      return { kind: 'perf', intensity, focus };
    }
    case 'oracle': throw new Error('oracle is planned by oracle.ts');
  }
}
export { HARD_LOADS, type HardLoadId };
