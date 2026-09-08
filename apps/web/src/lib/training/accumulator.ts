import { TRAINING_GAIN_THRESHOLD } from './config';

/**
 * Training Progress Accumulator V1 — pure math, no I/O (mirrors this
 * codebase's established pure-formula/DB-plumbing split: growth.ts vs
 * engine.ts, bikeCalc.ts vs bike.ts, capMath.ts vs repository.ts).
 *
 * Real accumulation happens atomically inside process_training_plan()
 * (see supabase/schema.sql) — this function exists so that EXACT same
 * floor()-based conversion rule is independently unit-testable without a
 * database, and so the two implementations can be checked against each
 * other for drift. They must be kept in sync by hand.
 */
export interface AccumulateResult {
  /** Whole attribute points earned this training — 0, 1, or more. */
  gain: number;
  /** The leftover fractional progress, carried into the next training. */
  remainingProgress: number;
}

/**
 * Floating-point-safe epsilon for the floor() threshold crossing. Repeated
 * `number` (float64) additions of a non-exactly-representable value like
 * 0.3 can land a hair below the true threshold (e.g. 2.9999999999999996
 * instead of 3.0) — without this, that single training's whole point would
 * be missed and only picked up on the NEXT training instead (self-correcting,
 * but still wrong for that one week). Found via accumulator.test.ts's own
 * 10x-accumulation drift check — kept small enough to never falsely credit
 * a gain that a real, intentional threshold undershoot shouldn't earn.
 */
const EPSILON = 1e-9;

/**
 * `maxGain` (default: unlimited) caps the WHOLE-POINT gain a single call may
 * apply — used by Technical training's hard +1/week cap (see the chat
 * report, item 9): if accumulated progress would otherwise convert into 2+
 * points, only `maxGain` is applied and consumed; the rest of the raw total
 * stays in `remainingProgress` for a future call (never lost, never
 * inflating a single week's gain above the cap).
 */
export function accumulateProgress(
  existingProgress: number,
  rawGrowth: number,
  threshold: number = TRAINING_GAIN_THRESHOLD,
  maxGain: number = Infinity,
): AccumulateResult {
  const total = existingProgress + rawGrowth;
  const uncappedGain = Math.floor((total + EPSILON) / threshold);
  const gain = Math.min(uncappedGain, maxGain);
  const remainingProgress = Math.max(0, total - gain * threshold);
  return { gain, remainingProgress };
}
