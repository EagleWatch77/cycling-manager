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

/**
 * Applies a condition delta to a rider's CURRENT Energy/Fatigue — the one
 * canonical rounding + clamp step (see the chat report, "REGENERAČNÉ
 * CENTRUM CLOSE-OUT", items 12-13). Deliberately generic (no training/plan
 * concept anywhere in its signature) so it is reusable for a future
 * race/Tour recovery event without inventing a second condition math —
 * item 11's explicit requirement: one canonical recovery model, never two.
 *
 * ROUNDING AUDIT (item 12): the Recovery Center's multiplier (1.05-1.20)
 * makes weeklyConditionDelta() produce genuinely fractional deltas — e.g.
 * 5 recovery days × 5 Energy × 1.15 = 28.75. Before this close-out, nothing
 * rounded that before it reached riders.condition, while every OTHER
 * condition field (STARTER_CONDITION, attribute gains via the training
 * accumulator) is a whole integer by convention, and the UI (ConditionRow)
 * renders the raw number with no formatting — a fractional Energy/Fatigue
 * value would have been a real, player-visible inconsistency. Resolved
 * with ONE deterministic rule, identical in TS and SQL: round the new
 * total (current + delta) to the nearest whole number FIRST, THEN clamp to
 * [0, 100] — `Math.round()` here, `round()` in
 * process_training_plan() (supabase/schema.sql) — both round-half-up for
 * the non-negative values this system ever produces, so the two can never
 * diverge. See condition.test.ts's canary and
 * recoveryCenterSql.test.ts's SQL/TS comparison.
 */
export function applyConditionDelta(
  current: { energy: number; fatigue: number },
  delta: WeeklyConditionDelta,
): { energy: number; fatigue: number } {
  return {
    energy: clamp100(Math.round(current.energy + delta.energyDelta)),
    fatigue: clamp100(Math.round(current.fatigue + delta.fatigueDelta)),
  };
}
