import type { SkillAttribute } from '@/lib/rider/config';

/**
 * Training V1 — tunable numbers and the growth formula, kept separate from
 * persistence (repository.ts) and UI so the rules can be rebalanced without
 * touching either.
 *
 * IMPORTANT — data model gaps discovered while implementing this (see the
 * PR/report): the requested formula references a `professionalism` rider
 * stat that did not exist before this feature (added in lib/rider/config.ts,
 * same convention as potential/trainability).
 *
 * `timeTrial` is now a real `SkillAttribute` (see lib/rider/config.ts —
 * added in the canonical-attribute migration) and is included below as the
 * 7th Performance focus.
 */

export type TrainingIntensity = 'light' | 'normal' | 'hard';
/**
 * 'technical' is kept only so a pre-existing DB row (week_type check
 * constraint allows it) still reads back without a type error. The
 * "technical week" feature — training Tactics/Technique directly — has been
 * retired: those two families now grow only through race processing (see
 * SECONDARY_ATTRIBUTE below, which is otherwise unaffected), never through a
 * plan a player creates here. Nothing in the app ever writes 'technical'
 * anymore — see saveTrainingPlan in lib/training/repository.ts.
 */
export type WeekType = 'performance' | 'technical';

/** The 7 canonical Performance skills a Rider can pick as a training focus. The only focus family plannable from the Training page. */
export const PERFORMANCE_FOCUS: readonly SkillAttribute[] = [
  'climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance', 'acceleration',
];

export const INTENSITY_MULTIPLIER: Record<TrainingIntensity, number> = {
  light: 1.0,
  normal: 1.5,
  hard: 2.0,
};

/** A secondary skill trains alongside the chosen focus, at ~35% of the primary gain. */
export const SECONDARY_ATTRIBUTE: Partial<Record<SkillAttribute, SkillAttribute>> = {
  // Given examples.
  climbing: 'endurance',
  sprint: 'acceleration',
  // Same reasoning applied to the rest of the Performance set.
  hills: 'climbing',
  flat: 'endurance',
  timeTrial: 'energyManagement',
  endurance: 'energyManagement',
  acceleration: 'sprint',
  // Tactics/Technique: not currently trainable directly (see WeekType above),
  // but the pairing is kept ready for when race-processing growth exists.
  positioning: 'packRiding',
  attackTiming: 'reaction',
  reaction: 'attackTiming',
  energyManagement: 'endurance',
  breakawaySkill: 'energyManagement',
  descending: 'cornering',
  bikeHandling: 'cornering',
  cornering: 'bikeHandling',
  packRiding: 'positioning',
  roughSurface: 'bikeHandling',
  wetHandling: 'descending',
};

export const SECONDARY_GAIN_SHARE = 0.35;

/** Baseline weekly growth before any multiplier. Not specified by the brief; smallest clean assumption. */
export const BASE_TRAINING = 3;

/**
 * Training Progress Accumulator V1 — the whole-point-scale a rider's
 * per-attribute progress must reach before it converts into a real +1
 * (or more) persisted attribute gain. See lib/training/accumulator.ts for
 * the pure floor()-based conversion, and supabase/schema.sql's
 * process_training_plan() for the authoritative DB-side copy of the same
 * math (kept in sync by hand — see that function's own doc comment).
 * V1 keeps this at a simple 1.0 (one "point" of raw growth = one whole
 * attribute point); centralized here instead of a magic number so it can
 * be rebalanced without touching either the pure function or the DB
 * function's call sites.
 */
export const TRAINING_GAIN_THRESHOLD = 1.0;

/**
 * Condition cost of a training week, by intensity. Not specified anywhere in
 * the codebase before Training V1 (no formula existed); smallest clean
 * assumption, kept here — the one place to rebalance — rather than inline in
 * the processing engine. energy/fatigue are the two condition fields a
 * week of training plausibly touches; form/fitness/morale are left alone
 * since nothing in the brief relates them to training.
 */
export const ENERGY_COST: Record<TrainingIntensity, number> = { light: 5, normal: 10, hard: 15 };
export const FATIGUE_GAIN: Record<TrainingIntensity, number> = { light: 5, normal: 10, hard: 18 };

export function trainabilityFactor(trainability: number): number {
  return 0.5 + trainability / 200;
}

export function professionalismFactor(professionalism: number): number {
  return 0.8 + professionalism / 500;
}

/** 17–19 → 1.30 … 35+ → 0.30, exactly the bands given in the brief. */
export function ageFactor(age: number): number {
  if (age <= 19) return 1.30;
  if (age <= 22) return 1.20;
  if (age <= 25) return 1.10;
  if (age <= 28) return 1.00;
  if (age <= 31) return 0.80;
  if (age <= 34) return 0.55;
  return 0.30;
}

// potentialCeiling()/potentialRoomFactor() — REMOVED (see the chat report's
// audit). They translated Potential (55-95) directly into a per-attribute
// ceiling on the 100-160 scale, which meant a rider's OWN Potential could
// functionally cap a single attribute below where the game design says
// Potential should even apply. Replaced by lib/rider/score.ts's
// developmentRoomFactor() — keyed to overallPerformance (all 7 Performance
// attributes together), never a single attribute's own value, and never a
// per-rider hard ceiling below PERFORMANCE_MAX (see lib/rider/config.ts).
