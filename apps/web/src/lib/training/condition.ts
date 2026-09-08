import {
  ENERGY_COST, FATIGUE_GAIN, TECHNICAL_ENERGY_COST, TECHNICAL_FATIGUE_GAIN,
  PERFORMANCE_RECOVERY_DAYS, TECHNICAL_RECOVERY_DAYS,
  RECOVERY_DAY_ENERGY, RECOVERY_DAY_FATIGUE,
  type TrainingIntensity, type WeekType,
} from './config';

/**
 * Weekly condition delta — Unified Weekly Training V1 (see the chat report,
 * items 13-16). Pure function, no I/O; the authoritative computation lives
 * in process_training_plan() (supabase/schema.sql), which now owns
 * Energy/Fatigue entirely (see item 25: "SQL musí sám čítať... condition").
 * This file is the unit-tested TS mirror, kept in sync by hand.
 *
 * Training cost is applied ONCE per processed weekly plan regardless of
 * session count (item 13). Passive recovery (item 15) applies to every
 * non-training day of the week, scaled by the Recovery Center's
 * RECOVERY_MULTIPLIER (item 16) — never to the training cost itself.
 */
export interface WeeklyConditionDelta {
  energyDelta: number;
  fatigueDelta: number;
}

export function weeklyConditionDelta(params: {
  weekType: WeekType;
  intensity: TrainingIntensity;
  recoveryMultiplier: number;
}): WeeklyConditionDelta {
  const isTechnical = params.weekType === 'technical';
  const trainingEnergyCost = isTechnical ? TECHNICAL_ENERGY_COST : ENERGY_COST[params.intensity];
  const trainingFatigueGain = isTechnical ? TECHNICAL_FATIGUE_GAIN : FATIGUE_GAIN[params.intensity];
  const recoveryDays = isTechnical ? TECHNICAL_RECOVERY_DAYS : PERFORMANCE_RECOVERY_DAYS[params.intensity];

  const energyDelta = -trainingEnergyCost + recoveryDays * RECOVERY_DAY_ENERGY * params.recoveryMultiplier;
  const fatigueDelta = trainingFatigueGain - recoveryDays * RECOVERY_DAY_FATIGUE * params.recoveryMultiplier;

  return { energyDelta, fatigueDelta };
}

export function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}
