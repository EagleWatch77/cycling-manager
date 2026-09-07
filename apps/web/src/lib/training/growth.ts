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
 * NOT currently invoked by anything. Applying a gain requires a season/week
 * "process training" step — analogous to race simulation — which does not
 * exist yet and is out of scope here (see report). This function exists so
 * that future step can call it without inventing the formula again.
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
}): GrowthResult {
  const raw = BASE_TRAINING
    * INTENSITY_MULTIPLIER[params.intensity]
    * trainabilityFactor(params.trainability)
    * professionalismFactor(params.professionalism)
    * ageFactor(params.age)
    * potentialRoomFactor(params.currentValue, params.potential);

  const primaryGain = Math.max(0, Math.round(raw));
  const secondaryAttr = SECONDARY_ATTRIBUTE[params.focus];

  return {
    primaryAttr: params.focus,
    primaryGain,
    secondaryAttr,
    secondaryGain: secondaryAttr ? Math.max(0, Math.round(raw * SECONDARY_GAIN_SHARE)) : undefined,
  };
}
