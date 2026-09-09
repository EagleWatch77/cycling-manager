import type { SkillAttribute } from '@/lib/rider/config';
import { PERFORMANCE_FOCUS } from './config';
import { developmentRoomFactor, overallPerformance } from '@/lib/rider/score';
import {
  BASE_TRAINING, TECHNICAL_BASE, SESSION_COUNT, SECONDARY_ATTRIBUTE, SECONDARY_GAIN_SHARE,
  trainabilityFactor, professionalismFactor, ageFactor,
  type TrainingIntensity,
} from './config';

/**
 * Unified Weekly Training V1 raw growth formulas (see the chat report). Pure
 * functions: no I/O, nothing here writes to the database.
 *
 * PERFORMANCE: growth = BASE_TRAINING × trainabilityFactor ×
 * professionalismFactor × ageFactor × facilityMultiplier × sessionCount ×
 * readinessFactor × developmentRoomFactor. sessionCount (SESSION_COUNT —
 * Light=1/Normal=2/Hard=3) REPLACES the old flat INTENSITY_MULTIPLIER
 * (1.0/1.5/2.0): stacking both would have produced a 6x Light-to-Hard
 * spread instead of the intended 3x (see the chat report's "DÔLEŽITÉ —
 * INTENSITY MULTIPLIER" section).
 *
 * TECHNICAL: growth = TECHNICAL_BASE × trainabilityFactor ×
 * professionalismFactor × ageFactor × readinessFactor — deliberately no
 * facility multiplier (Training Center support for Technical training is
 * an explicitly deferred decision — item 11) and no Development Model V2
 * (Technique stays on the canonical 100-160 scale; Potential does not
 * govern it — item 11). No secondary gain at all (item 10) — Technical
 * training trains ONLY the chosen focus.
 *
 * Development Model V2 (Performance only — see the chat report):
 * `potentialRoomFactor` (single-attribute vs. an implied per-attribute
 * Potential ceiling) is REPLACED by lib/rider/score.ts's
 * `developmentRoomFactor()` — keyed to the rider's overallPerformance (mean
 * of all 7 Performance attributes) and the attribute's own value, never a
 * Potential-derived per-attribute ceiling. See lib/rider/score.ts's own doc
 * comment for the full rationale.
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
 * Training Progress Accumulator: this returns UNROUNDED raw progress;
 * lib/training/accumulator.ts's accumulateProgress() (backed by the
 * persistent rider_training_progress table) turns accumulated raw
 * progress into a real whole-number attribute gain.
 *
 * SECURITY HARDENING: lib/training/engine.ts no longer calls either of
 * these functions — the authoritative computation lives ONLY inside
 * process_training_plan() (see supabase/schema.sql), reading trusted
 * persisted data. These remain the pure, unit-tested REFERENCE copies (see
 * growth.test.ts) — kept in sync by hand with the SQL version. If you
 * change either formula here, you must update process_training_plan() too.
 */
export interface RawGrowthResult {
  primaryAttr: SkillAttribute;
  /** Unrounded raw progress for this week — feed into accumulateProgress(), never applied to an attribute directly. */
  primaryRaw: number;
  secondaryAttr?: SkillAttribute;
  secondaryRaw?: number;
}

export function calculatePerformanceRawGrowth(params: {
  focus: SkillAttribute;
  intensity: TrainingIntensity;
  /** Full attribute set — needed to derive overallPerformance, not just the one attribute being trained. */
  attributes: Record<SkillAttribute, number>;
  trainability: number;
  professionalism: number;
  age: number;
  potential: number;
  /**
   * Training Center facility multiplier — the caller passes
   * `trainingCenterMultiplier(effectiveLevel, age)` (see
   * lib/facilities/config.ts, the age-banded FINAL Training Center V1
   * model: e.g. 1.15/1.10/1.05/1.03 for a rider whose own age band has
   * been unlocked, else 1.00) — applied here, once, to the SAME raw
   * progress value both primaryRaw and secondaryRaw derive from. Defaults
   * to 1 (no bonus).
   */
  facilityMultiplier?: number;
  /** Readiness effectiveness (lib/training/readiness.ts's readinessEffectiveness()) — defaults to 1 (fully rested) so existing callers/tests keep behaving identically. */
  readinessFactor?: number;
}): RawGrowthResult {
  const overall = overallPerformance(params.attributes);
  const currentValue = params.attributes[params.focus];
  const devFactor = developmentRoomFactor(currentValue, overall, params.potential);

  const base = BASE_TRAINING
    * SESSION_COUNT[params.intensity]
    * trainabilityFactor(params.trainability)
    * professionalismFactor(params.professionalism)
    * ageFactor(params.age)
    * (params.facilityMultiplier ?? 1)
    * (params.readinessFactor ?? 1);

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

export interface TechnicalRawGrowthResult {
  focus: SkillAttribute;
  raw: number;
}

export function calculateTechnicalRawGrowth(params: {
  focus: SkillAttribute;
  trainability: number;
  professionalism: number;
  age: number;
  readinessFactor?: number;
}): TechnicalRawGrowthResult {
  const raw = TECHNICAL_BASE
    * trainabilityFactor(params.trainability)
    * professionalismFactor(params.professionalism)
    * ageFactor(params.age)
    * (params.readinessFactor ?? 1);

  return { focus: params.focus, raw: Math.max(0, raw) };
}
