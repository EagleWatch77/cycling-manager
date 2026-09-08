import { TECHNIQUE_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';

/**
 * Unified Weekly Training V1 — tunable numbers and the growth formula, kept
 * separate from persistence (repository.ts) and UI so the rules can be
 * rebalanced without touching either.
 *
 * A rider has exactly ONE training plan per week, of exactly one of two
 * types (see the chat report "UNIFIED WEEKLY TRAINING V1"):
 *   - PERFORMANCE: focus is one of PERFORMANCE_FOCUS, intensity picks a
 *     session count (Light=1/Normal=2/Hard=3 sessions/week — see
 *     SESSION_COUNT). Uses the full Development Model V2 authoritative
 *     formula (BASE_TRAINING × trainability × professionalism × age ×
 *     facility × developmentRoomFactor × readiness × sessionCount).
 *   - TECHNICAL: focus is one of TECHNICAL_FOCUS, always exactly 1 session
 *     (no player-facing intensity). Uses a simpler formula (TECHNICAL_BASE ×
 *     trainability × professionalism × age × readiness — no facility bonus,
 *     no Development Model V2, no secondary gain) and is HARD-CAPPED at +1
 *     integer attribute point per processed plan, regardless of how much
 *     accumulator progress is available (see accumulator.ts's `maxGain`).
 *
 * Tactics is not trainable by either type (see the chat report, item 29) —
 * it will grow only through a future race-situations system.
 */

export type TrainingIntensity = 'light' | 'normal' | 'hard';
export type WeekType = 'performance' | 'technical';

/** The 7 canonical Performance skills a Rider can pick as a Performance training focus. */
export const PERFORMANCE_FOCUS: readonly SkillAttribute[] = [
  'climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance', 'acceleration',
];

/** The 6 canonical Technique skills a Rider can pick as a Technical training focus — same set as lib/rider/config.ts's TECHNIQUE_ATTRIBUTES. */
export const TECHNICAL_FOCUS: readonly SkillAttribute[] = TECHNIQUE_ATTRIBUTES;

/**
 * Weekly Training V1 session-count model (see the chat report — REPLACES
 * the old flat INTENSITY_MULTIPLIER 1.0/1.5/2.0 growth multiplier, which
 * would have double-counted against this session count: 1×1.0 vs 2×1.5 vs
 * 3×2.0 is a 6x Light-to-Hard spread, far too steep). Session QUALITY is
 * uniform (1.0, i.e. no separate multiplier) — the only thing that differs
 * between Light/Normal/Hard is how many of the week's sessions happen.
 * Applies to Performance training only; Technical training is always
 * exactly 1 session (see TECHNICAL_BASE below), with no player-facing
 * intensity choice at all.
 */
export const SESSION_COUNT: Record<TrainingIntensity, number> = {
  light: 1,
  normal: 2,
  hard: 3,
};

/** A secondary skill trains alongside the chosen Performance focus, at ~35% of the primary gain. Performance training only — Technical training has NO secondary gain (see the chat report, item 10). */
export const SECONDARY_ATTRIBUTE: Partial<Record<SkillAttribute, SkillAttribute>> = {
  // The 7 active Performance-primary mappings — all Performance-only.
  climbing: 'endurance',
  hills: 'acceleration',
  flat: 'timeTrial',
  sprint: 'acceleration',
  timeTrial: 'endurance',
  endurance: 'timeTrial',
  acceleration: 'sprint',
  // Tactics/Technique: not currently trainable directly (Tactics never;
  // Technical training deliberately has no secondary gain — see above),
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

/** Baseline weekly growth before any multiplier, Performance training. */
export const BASE_TRAINING = 3;

/**
 * Technical training's own base constant — deliberately much smaller in
 * effect than Performance's, since Technical training has no facility
 * bonus and no Development Model V2 throttling, and is hard-capped at +1
 * integer point per week regardless. Chosen via simulation (see the chat
 * report, item 5/"TECHNICAL BASE / THRESHOLD"): at 2.0, a 10-week technical
 * block yields ~1 point for an average young rider, ~2 for a high-quality
 * young rider, and ~0 for an older rider — slow, specialized development,
 * not a fast route to maxing a Technique attribute. Candidates 1.0-3.0 were
 * simulated; 2.0 was picked as the smallest value that still gives a
 * genuinely "high-quality" rider more than a single point over a full
 * 10-week block while keeping an "average" rider well under 1 point/week.
 */
export const TECHNICAL_BASE = 2.0;

/** Technical training's hard weekly cap (see the chat report, item 9): a single processed technical plan can never apply more than this many integer Technique points, no matter how much accumulator progress is available. */
export const TECHNICAL_WEEKLY_GAIN_CAP = 1;

/**
 * Training Progress Accumulator — the whole-point-scale a rider's
 * per-attribute progress must reach before it converts into a real +1
 * (or more, Performance only — Technical is capped, see
 * TECHNICAL_WEEKLY_GAIN_CAP) persisted attribute gain. See
 * lib/training/accumulator.ts for the pure floor()-based conversion, and
 * supabase/schema.sql's process_training_plan() for the authoritative
 * DB-side copy of the same math (kept in sync by hand — see that
 * function's own doc comment).
 *
 * Raised from 1.0 to 12 for Unified Weekly Training V1 (see the chat
 * report): the old threshold of 1.0 was calibrated for a single-session
 * weekly model without a session-count multiplier — at the new session
 * counts (1/2/3) it would have converted almost every week's raw progress
 * into a full integer point immediately, defeating the accumulator's
 * purpose. 12 was chosen so a session's raw progress (see BASE_TRAINING/
 * TECHNICAL_BASE above) takes several weeks to convert into a real point —
 * see the chat report's 10-week simulations for real numbers across rider
 * qualities and intensities.
 */
export const TRAINING_GAIN_THRESHOLD = 12;

/**
 * Condition cost of a training week, by intensity — applied ONCE per
 * processed weekly plan, never once per session (see the chat report,
 * item 13: Hard is NOT 3x the Light cost). Performance training only.
 */
export const ENERGY_COST: Record<TrainingIntensity, number> = { light: 5, normal: 10, hard: 15 };
export const FATIGUE_GAIN: Record<TrainingIntensity, number> = { light: 5, normal: 10, hard: 18 };

/** Technical training's fixed condition cost — always this single value, no intensity choice (see the chat report, item 14). */
export const TECHNICAL_ENERGY_COST = 5;
export const TECHNICAL_FATIGUE_GAIN = 5;

/**
 * Passive weekly recovery (see the chat report, item 15) — the number of
 * non-training/recovery days in a training week, by plan type/intensity.
 * Performance: Light=6, Normal=5, Hard=4 (Tue/Thu/Sat are training days at
 * Normal/Hard). Technical: always 6 (only Tuesday trains).
 */
export const PERFORMANCE_RECOVERY_DAYS: Record<TrainingIntensity, number> = { light: 6, normal: 5, hard: 4 };
export const TECHNICAL_RECOVERY_DAYS = 6;

/** Baseline passive recovery per non-training day, before the Recovery Center multiplier (see lib/facilities/config.ts's RECOVERY_MULTIPLIER). */
export const RECOVERY_DAY_ENERGY = 5;
/** Magnitude of the fatigue REDUCTION per recovery day (subtracted from fatigue, not added). */
export const RECOVERY_DAY_FATIGUE = 4;

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
// Technical training deliberately does NOT use developmentRoomFactor at all
// (see the chat report, item 11) — Technique stays on the canonical 100-160
// scale and Potential does not govern it.
