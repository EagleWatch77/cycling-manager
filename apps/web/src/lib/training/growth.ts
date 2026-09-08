import type { SkillAttribute } from '@/lib/rider/config';
import { PERFORMANCE_FOCUS } from './config';
import { developmentRoomFactor, overallPerformance } from '@/lib/rider/score';
import {
  BASE_TRAINING, INTENSITY_MULTIPLIER, SECONDARY_ATTRIBUTE, SECONDARY_GAIN_SHARE,
  trainabilityFactor, professionalismFactor, ageFactor,
  type TrainingIntensity,
} from './config';

/**
 * Training V1 raw growth formula — implements exactly the formula given in
 * the brief (growth = baseTraining × trainabilityFactor × professionalismFactor
 * × ageFactor × developmentRoomFactor). Pure function: no I/O, nothing here
 * writes to the database.
 *
 * DEVELOPMENT MODEL V2 (see the chat report): `potentialRoomFactor`
 * (single-attribute vs. an implied per-attribute Potential ceiling) is
 * REMOVED. Replaced by lib/rider/score.ts's `developmentRoomFactor()` —
 * keyed to the rider's overallPerformance (mean of all 7 Performance
 * attributes) and the attribute's own value, never a Potential-derived
 * per-attribute ceiling. See lib/rider/score.ts's own doc comment for the
 * full rationale.
 *
 * SECONDARY_ATTRIBUTE is Performance-only for every focus reachable from the
 * Training page (game-design decision — see chat report "Weekly Training V1
 * zostáva PERFORMANCE-ONLY"): Performance training must never be a backdoor
 * way to raise Tactics/Technique, so timeTrial/endurance no longer map to
 * energyManagement. The `isPerformance` branch below (secondary gets no
 * developmentRoomFactor throttling) is dead code for any focus actually
 * selectable today — SECONDARY_ATTRIBUTE still keeps Tactics/Technique-keyed
 * entries for attributes that can never be a `focus` (see
 * lib/training/config.ts), so the branch is kept as a safety net for that
 * future case rather than removed.
 *
 * Training Progress Accumulator V1: this returns UNROUNDED raw progress;
 * lib/training/accumulator.ts's accumulateProgress() (backed by the
 * persistent rider_training_progress table) turns accumulated raw
 * progress into a real whole-number attribute gain.
 *
 * SECURITY HARDENING ROUND 2: lib/training/engine.ts no longer calls this
 * function — the authoritative computation lives ONLY inside
 * process_training_plan() (see supabase/schema.sql), reading trusted
 * persisted data. This function remains the pure, unit-tested REFERENCE
 * copy (see growth.test.ts) — kept in sync by hand with the SQL version.
 * If you change the formula here, you must update process_training_plan()
 * too.
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
  /** Full attribute set — needed to derive overallPerformance, not just the one attribute being trained. */
  attributes: Record<SkillAttribute, number>;
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
  const overall = overallPerformance(params.attributes);
  const currentValue = params.attributes[params.focus];
  const devFactor = developmentRoomFactor(currentValue, overall, params.potential);

  const base = BASE_TRAINING
    * INTENSITY_MULTIPLIER[params.intensity]
    * trainabilityFactor(params.trainability)
    * professionalismFactor(params.professionalism)
    * ageFactor(params.age)
    * (params.facilityMultiplier ?? 1);

  const primaryRaw = Math.max(0, base * devFactor);
  const secondaryAttr = SECONDARY_ATTRIBUTE[params.focus];

  let secondaryRaw: number | undefined;
  if (secondaryAttr) {
    const isPerformance = (PERFORMANCE_FOCUS as readonly SkillAttribute[]).includes(secondaryAttr);
    const secondaryDevFactor = isPerformance
      ? developmentRoomFactor(params.attributes[secondaryAttr], overall, params.potential)
      : 1;
    secondaryRaw = Math.max(0, base * secondaryDevFactor * SECONDARY_GAIN_SHARE);
  }

  return {
    primaryAttr: params.focus,
    primaryRaw,
    secondaryAttr,
    secondaryRaw,
  };
}
