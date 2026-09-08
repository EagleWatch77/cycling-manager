import type { SkillAttribute } from '@/lib/rider/config';
import {
  BASE_TRAINING, INTENSITY_MULTIPLIER, SECONDARY_ATTRIBUTE, SECONDARY_GAIN_SHARE,
  trainabilityFactor, professionalismFactor, ageFactor, potentialRoomFactor,
  type TrainingIntensity,
} from './config';

/**
 * Training V1 raw growth formula — implements exactly the formula given in
 * the brief (growth = baseTraining × trainabilityFactor × professionalismFactor
 * × ageFactor × potentialRoomFactor). Pure function: no I/O, nothing here
 * writes to the database.
 *
 * IMPORTANT (Training Progress Accumulator V1): this used to round its own
 * output into a final integer gain. It no longer does — see the chat
 * report: Math.round()-ing raw progress every week silently discarded the
 * fractional remainder, which made a facility bonus like +3–5% invisible
 * most weeks (confirmed by simulation). `calculateRawGrowth` now returns
 * the UNROUNDED progress values; lib/training/accumulator.ts's
 * accumulateProgress() (backed by the persistent rider_training_progress
 * table — see supabase/schema.sql's process_training_plan()) is what turns
 * accumulated raw progress into a real whole-number attribute gain.
 *
 * Invoked by lib/training/engine.ts — the "process training" step that
 * applies a plan's gain once its week has passed.
 */
export interface RawGrowthResult {
  primaryAttr: SkillAttribute;
  /** Unrounded raw progress for this week — feed into accumulateProgress(), never applied to an attribute directly. */
  primaryRaw: number;
  secondaryAttr?: SkillAttribute;
  secondaryRaw?: number;
}

export function calculateRawGrowth(params: {
  focus: SkillAttribute;
  intensity: TrainingIntensity;
  currentValue: number;
  trainability: number;
  professionalism: number;
  age: number;
  potential: number;
  /**
   * Training Center facility multiplier (1 + TRAINING_BONUS[level], see
   * lib/facilities/config.ts) — applied here, once, to the SAME raw
   * progress value both primaryRaw and secondaryRaw derive from, exactly
   * per the brief's own example (effectiveProgress = baseProgress × 1.12).
   * Defaults to 1 (no bonus) so every existing caller/test not passing it
   * keeps behaving identically.
   */
  facilityMultiplier?: number;
}): RawGrowthResult {
  const raw = BASE_TRAINING
    * INTENSITY_MULTIPLIER[params.intensity]
    * trainabilityFactor(params.trainability)
    * professionalismFactor(params.professionalism)
    * ageFactor(params.age)
    * potentialRoomFactor(params.currentValue, params.potential)
    * (params.facilityMultiplier ?? 1);

  const primaryRaw = Math.max(0, raw);
  const secondaryAttr = SECONDARY_ATTRIBUTE[params.focus];

  return {
    primaryAttr: params.focus,
    primaryRaw,
    secondaryAttr,
    secondaryRaw: secondaryAttr ? Math.max(0, raw * SECONDARY_GAIN_SHARE) : undefined,
  };
}
