import { TOURS } from '@/data/tours';
import { visibleStageCount } from '@/lib/leagues';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { PERFORMANCE_FOCUS, TECHNICAL_FOCUS } from '@/lib/training/config';
import type { TrainingIntensity } from '@/lib/training/config';

/**
 * CAREER SIMULATION — every constant in this file marked EXP is an EXPERIMENTAL proposal
 * (not production, not approved). Constants marked PROD are imported or mirrored from the game.
 */
export const SEASONS = 12;
export const WEEKS = 10;
export const SNAPSHOT_SEASONS = [1, 3, 6, 9, 12] as const;
export const NATTR = SKILL_ATTRIBUTES.length;
export const IDX = Object.fromEntries(SKILL_ATTRIBUTES.map((k, i) => [k, i])) as Record<SkillAttribute, number>;
export const PERF_IDX = PERFORMANCE_FOCUS.map((k) => IDX[k]);
export const TACT_IDX = (['positioning', 'attackTiming', 'reaction', 'energyManagement', 'breakawaySkill'] as SkillAttribute[]).map((k) => IDX[k]);
export const TECH_IDX = (['descending', 'bikeHandling', 'cornering', 'packRiding', 'wetHandling', 'roughSurface'] as SkillAttribute[]).map((k) => IDX[k]);
export const TECHNICAL_FOCUS_IDX = TECHNICAL_FOCUS.map((k) => IDX[k]);
export const EXP_IDX = IDX.experience;
export const ATTR_CAP_NONPERF = 160; // PROD (ATTR_MAX)

/** Tour weeks: PROD calendar data/tourSchedule.ts has Tours in weeks 2, 5 (two alternatives), 7, 9. 4-Tour main experiment = 2,5,7,9 (EXP assumption), 3-Tour = 2,5,7. */
export const TOUR_WEEKS_4: readonly number[] = [2, 5, 7, 9];
export const TOUR_WEEKS_3: readonly number[] = [2, 5, 7];
/** A Tour chosen per week (week 5 has two alternatives; Danube is used). */
export const TOUR_ID_BY_WEEK: Record<number, string> = { 2: 'highlands-tour', 5: 'danube-tour', 7: 'northern-crown-tour', 9: 'silver-horizon-tour' };
/** EXP: the three visible Rookie stages are ridden on Tue, Wed, Thu (the calendar has no stage dates yet). */
export const STAGE_DAYS: readonly number[] = [1, 2, 3];
/** Stages that are time trials by name in data/tours.ts (the data has no 'tt' flag). */
const TT_NAMES = new Set(['Koruna severu', 'Časovka Obzor']);
const ROUGH_NAMES = new Set(['Kamenné cesty']);

export type StageKind = 'flat' | 'hilly' | 'mountain' | 'tt';
export interface Stage { tourId: string; number: number; name: string; km: number; kind: StageKind; rough: boolean }
export const TOUR_STAGES: Record<number, Stage[]> = {};
for (const w of [2, 5, 7, 9]) {
  // the simulation keeps its own historical calendar (weeks 2/5/7/9); it does not read the live tour schedule (2/4/6/8/10)
  const tour = TOURS.find((t) => t.id === TOUR_ID_BY_WEEK[w])!;
  TOUR_STAGES[w] = tour.masterStages.slice(0, visibleStageCount('rookie')).map((st) => ({
    tourId: tour.id, number: st.number, name: st.name, km: st.distanceKm,
    kind: TT_NAMES.has(st.name) ? 'tt' : (st.difficulty as StageKind), rough: ROUGH_NAMES.has(st.name),
  }));
}

/** MIRROR of packages/race-engine BASE_ROAD_ENERGY_PER_KM (parity is checked by a test). */
export const ENGINE_BASE_ROAD_ENERGY_PER_KM = 0.2125;
/** EXP stage load model derived from the engine constant (the engine has no web integration and no fatigue/form/morale). */
export const STAGE_DRAFT = 0.80;
export const STAGE_KIND_ENERGY: Record<StageKind, number> = { flat: 1.0, hilly: 1.10, mountain: 1.25, tt: 1.10 };
export const STAGE_FATIGUE_RATIO = 0.75; // same ratio as a hard training session (18/24)
export function stageLoad(st: Stage, scale = 1): { energy: number; fatigue: number } {
  const draft = st.kind === 'tt' ? 1 : STAGE_DRAFT;
  const e = st.km * ENGINE_BASE_ROAD_ENERGY_PER_KM * draft * STAGE_KIND_ENERGY[st.kind] * scale;
  return { energy: Math.round(e), fatigue: Math.round(e * STAGE_FATIGUE_RATIO) };
}
/** EXP: probability that a given stage is rained on (same weather for every rider; seeded). */
export const RAIN_CHANCE = 0.2;

/** Weights (EXP): which tactical/technical abilities a stage exercises. Order = TACT_IDX / TECH_IDX. */
export const TACT_W: Record<StageKind, number[]> = {
  flat: [1.0, 0.5, 0.8, 0.5, 0.7], hilly: [0.8, 1.0, 1.0, 0.8, 1.0], mountain: [0.5, 0.8, 0.7, 1.0, 0.4], tt: [0, 0, 0, 1.0, 0],
};
// [descending, bikeHandling, cornering, packRiding, wetHandling (rain only), roughSurface (rough stage only)]
export const TECH_W: Record<StageKind, number[]> = {
  flat: [0, 0.5, 0.4, 1.0, 1, 1], hilly: [0.6, 0.7, 0.8, 0.6, 1, 1], mountain: [1.0, 0.6, 0.8, 0.3, 1, 1], tt: [0, 0.5, 0.5, 0, 1, 0],
};
/** Which Performance attributes a stage kind uses (only for the hypothetical stage-performance index). */
export const STAGE_PERF: Record<StageKind, SkillAttribute[]> = {
  flat: ['flat', 'sprint', 'acceleration'], hilly: ['hills', 'acceleration', 'endurance'], mountain: ['climbing', 'endurance'], tt: ['timeTrial', 'endurance'],
};

export type GrowthVariant = 'conservative' | 'bold';
/** EXP race-growth coefficients. Raw progress per stage goes into the same threshold-12 accumulators as training. */
export interface RaceGrowth { tactics: number; technique: number; experience: number; capTactics: number; capTechnique: number; capExperience: number }
export const RACE_GROWTH: Record<GrowthVariant, RaceGrowth> = {
  conservative: { tactics: 1.5, technique: 1.0, experience: 1.5, capTactics: 2, capTechnique: 3, capExperience: 2 },
  bold: { tactics: 3.0, technique: 2.0, experience: 3.0, capTactics: 3, capTechnique: 4, capExperience: 3 },
};
export const RACE_ROOM_SPAN = 30; // EXP: room = clamp((160 - value) / 30, 0, 1) for Tactics/Technique/Experience
export const raceRoom = (v: number): number => Math.max(0, Math.min(1, (ATTR_CAP_NONPERF - v) / RACE_ROOM_SPAN));

export type HardLoadId = 'h24' | 'h22' | 'h20';
export const HARD_LOADS: Record<HardLoadId, { energy: number; fatigue: number }> = {
  h24: { energy: 24, fatigue: 18 }, h22: { energy: 22, fatigue: 16 }, h20: { energy: 20, fatigue: 15 },
};
export const LOADS_BASE = {
  light: { energy: 12, fatigue: 8 }, normal: { energy: 18, fatigue: 12 },
} as const;
/** PROD: a technical session costs the production technical-week cost (5/5). */
export const TECH_LOAD = { energy: 5, fatigue: 5 };
export const DAYS_FOR: Record<TrainingIntensity, readonly number[]> = { light: [1], normal: [1, 3], hard: [1, 3, 5] };

/** EXP potential model (replaces the production overall-potential factor; NOT an extra multiplier): personal soft ceiling of overall Performance. */
export const POT_CEILING_BASE = 140;
export const POT_CEILING_SLOPE = 0.6;
export const POT_SLOWDOWN_SPAN = 25;
export const potentialCeiling = (p: number): number => POT_CEILING_BASE + POT_CEILING_SLOPE * p;
export const expPotentialFactor = (overallPerf: number, p: number): number =>
  Math.max(0.05, Math.min(1, (potentialCeiling(p) - overallPerf) / POT_SLOWDOWN_SPAN));

/** EXP decline (tested separately only): per-season loss of every Performance attribute. */
export const declinePerSeason = (age: number): number => (age >= 37 ? 3 : age >= 34 ? 2 : age >= 31 ? 1 : 0);

/**
 * EXP potential model B ("relative headroom"): potential = how much a rider can still grow ABOVE his own starting
 * Performance level. ceiling = startOverallPerformance + REL_BASE + REL_SLOPE x potential (1..100); growth slows linearly over the last
 * POT_SLOWDOWN_SPAN points below that personal ceiling. Not a multiplier: far from the ceiling every potential grows alike.
 */
export const POT_REL_BASE = 5;
export const POT_REL_SLOPE = 0.45;
export const relativeCeiling = (startOverall: number, p: number): number => startOverall + POT_REL_BASE + POT_REL_SLOPE * p;
export const expPotentialFactorRel = (overallPerf: number, p: number, startOverall: number): number =>
  Math.max(0.05, Math.min(1, (relativeCeiling(startOverall, p) - overallPerf) / POT_SLOWDOWN_SPAN));
