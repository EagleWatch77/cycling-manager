import 'server-only';
import { getMyRider, applyTrainingResult } from '@/lib/rider/repository';
import { ATTR_MIN, ATTR_MAX, type SkillAttribute } from '@/lib/rider/config';
import type { SeasonInfo } from '@/lib/calendar/season';
import { listUnprocessedTrainingPlans, applyTrainingPlanResult, type TrainingPlan } from './repository';
import { calculateGrowth } from './growth';
import { ENERGY_COST, FATIGUE_GAIN } from './config';
import { getMyFacilities, getFacilityCaps, getEffectiveFacilities, getMyLeague } from '@/lib/facilities/repository';
import { TRAINING_BONUS, RECOVERY_BONUS } from '@/lib/facilities/config';

/**
 * Training V1 processing engine.
 *
 * There is no separate week-advance/tick job anywhere in this codebase —
 * season/week is a pure function of real time (lib/calendar/season.ts), so
 * "the game advancing to the next week" already happens on its own as the
 * calendar date moves forward. This function is the piece that was missing:
 * it resolves any training plan whose week has passed but that has never
 * been applied. It is called lazily, once, at the top of the Training page
 * load — the natural equivalent of "when the game resolves the current
 * week" for a calendar with no separate tick step.
 *
 * Each plan is processed at most once: applyTrainingPlanResult only updates
 * rows where applied_at is still null, so re-entering this function (e.g.
 * two tabs loading the page around the same time) is a no-op for any plan
 * the first call already finished.
 */
export async function processCompletedTrainings(season: SeasonInfo): Promise<void> {
  const rider = await getMyRider();
  if (!rider) return;

  const pending = (await listUnprocessedTrainingPlans(rider.id))
    .filter((plan) => isWeekOver(plan, season));
  if (pending.length === 0) return;

  // Zázemie V1: Training Center raises effective training progress; Recovery
  // Center reduces how much energy/fatigue a week of training actually
  // costs. Read once per run, not per plan — a facility level can't change
  // mid-loop. See lib/facilities/config.ts for both tables and the chat
  // report for why Recovery Center is applied to the training cost/gain
  // deltas rather than a separate "weekly passive recovery" tick: no such
  // tick exists anywhere in this codebase today (energy/fatigue only ever
  // change here, as a direct result of training), so reducing the training
  // depletion is the smallest safe change that matches the spirit of
  // "better recovery" without inventing a new mechanic.
  //
  // Uses EFFECTIVE level, not raw stored level: a rider who built Training
  // Center L3 in Amateur but is currently back in Rookie must train at the
  // L1 rate, not the banked L3 rate — see lib/facilities/capMath.ts's
  // effectiveFacilityLevel doc comment.
  const [facilities, league] = await Promise.all([getMyFacilities(), getMyLeague()]);
  const caps = await getFacilityCaps(league, facilities);
  const effective = getEffectiveFacilities(facilities, caps);
  const trainingMultiplier = 1 + TRAINING_BONUS[effective.training];
  const recoveryFactor = 1 - RECOVERY_BONUS[effective.recovery];

  let attributes: Record<SkillAttribute, number> = rider.attributes;
  let condition: Record<'energy' | 'fatigue' | 'form' | 'fitness' | 'morale', number> = rider.condition;
  // Snapshot of condition as it stood before this run — written back as
  // condition_previous so the UI can compute a real trend, not a guess.
  const previousCondition = rider.condition;

  for (const plan of pending) {
    const focus = plan.focus as SkillAttribute;
    const growth = calculateGrowth({
      focus,
      intensity: plan.intensity,
      currentValue: attributes[focus],
      trainability: rider.trainability,
      professionalism: rider.professionalism,
      age: rider.age,
      potential: rider.potential,
      facilityMultiplier: trainingMultiplier,
    });

    const nextAttributes = { ...attributes };
    nextAttributes[growth.primaryAttr] = clampAttr(nextAttributes[growth.primaryAttr] + growth.primaryGain);
    if (growth.secondaryAttr && growth.secondaryGain) {
      nextAttributes[growth.secondaryAttr] = clampAttr(nextAttributes[growth.secondaryAttr] + growth.secondaryGain);
    }
    attributes = nextAttributes;

    condition = {
      ...condition,
      energy: clamp100(condition.energy - ENERGY_COST[plan.intensity] * recoveryFactor),
      fatigue: clamp100(condition.fatigue + FATIGUE_GAIN[plan.intensity] * recoveryFactor),
    };

    await applyTrainingPlanResult(plan.id, {
      primaryAttr: growth.primaryAttr,
      primaryGain: growth.primaryGain,
      secondaryAttr: growth.secondaryAttr ?? null,
      secondaryGain: growth.secondaryGain ?? null,
    });
  }

  await applyTrainingResult(rider.id, attributes, condition, previousCondition);
}

/** A plan's week has ended once its season is behind the current one, or it's an earlier week of the current season. */
function isWeekOver(plan: TrainingPlan, season: SeasonInfo): boolean {
  return plan.seasonId !== season.seasonId || plan.weekNumber < season.currentWeek;
}

function clampAttr(v: number): number {
  return Math.max(ATTR_MIN, Math.min(ATTR_MAX, v));
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}
