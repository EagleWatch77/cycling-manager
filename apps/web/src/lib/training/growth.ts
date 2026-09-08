import type { SkillAttribute } from '@/lib/rider/config';
import {
  BASE_TRAINING, INTENSITY_MULTIPLIER, SECONDARY_ATTRIBUTE, SECONDARY_GAIN_SHARE,
  trainabilityFactor, professionalismFactor, ageFactor, potentialRoomFactor,
  type TrainingIntensity,
} from './config';

/**
 * Training V1 growth formula — implements exactly the formula given in the
 * brief (growth = baseTraining × trainabilityFactor × professionalismFactor
 * × ageFactor × potentialRoomFactor), confirmed via repo inspection to not
 * exist anywhere before this feature (no training/growth code of any kind
 * was found). Pure function: no I/O, nothing here writes to the database.
 *
 * Invoked by lib/training/engine.ts — the "process training" step that
 * applies a plan's gain once its week has passed.
 */
export interface GrowthResult {
  primaryAttr: SkillAttribute;
  primaryGain: number;
  secondaryAttr?: SkillAttribute;
  secondaryGain?: number;
}

export function calculateGrowth(params: {
  focus: SkillAttribute;
  intensity: TrainingIntensity;
  currentValue: number;
  trainability: number;
  professionalism: number;
  age: number;
  potential: number;
  /**
   * Training Center facility multiplier (1 + TRAINING_BONUS[level], see
   * lib/facilities/config.ts) — applied here, once, to the SAME `raw`
   * progress value both primaryGain and secondaryGain derive from, exactly
   * per the brief's own example (effectiveProgress = baseProgress × 1.12).
   * Defaults to 1 (no bonus) so every existing caller/test not passing it
   * keeps behaving identically.
   */
  facilityMultiplier?: number;
}): GrowthResult {
  const raw = BASE_TRAINING
    * INTENSITY_MULTIPLIER[params.intensity]
    * trainabilityFactor(params.trainability)
    * professionalismFactor(params.professionalism)
    * ageFactor(params.age)
    * potentialRoomFactor(params.currentValue, params.potential)
    * (params.facilityMultiplier ?? 1);

  const primaryGain = Math.max(0, Math.round(raw));
  const secondaryAttr = SECONDARY_ATTRIBUTE[params.focus];

  return {
    primaryAttr: params.focus,
    primaryGain,
    secondaryAttr,
    secondaryGain: secondaryAttr ? Math.max(0, Math.round(raw * SECONDARY_GAIN_SHARE)) : undefined,
  };
}
