import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getMyRider, applyConditionResult } from '@/lib/rider/repository';
import { ATTR_MIN, ATTR_MAX, type SkillAttribute } from '@/lib/rider/config';
import type { SeasonInfo } from '@/lib/calendar/season';
import { listUnprocessedTrainingPlans, type TrainingPlan } from './repository';
import { calculateRawGrowth } from './growth';
import { ENERGY_COST, FATIGUE_GAIN, TRAINING_GAIN_THRESHOLD } from './config';
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
 * Training Progress Accumulator V1 (see the chat report): each plan's
 * attribute gain(s) and its applied_at stamp are now written atomically,
 * per plan, inside process_training_plan() (a security-definer Postgres
 * function — see supabase/schema.sql). That function itself is the
 * idempotency boundary: it locks the plan row and checks applied_at FIRST,
 * so two concurrent runs (two tabs, a retry) can never both consume the
 * same plan's raw progress — the loser's call simply returns
 * already_processed = true and mutates nothing. This is a strict
 * improvement over the previous shape (attributes were accumulated in JS
 * across the whole loop and written ONCE at the very end), which had a
 * latent last-write-wins race between two concurrent runs; per-plan atomic
 * writes close that gap as a side effect.
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

  const supabase = await createClient();

  // Local mirror of attributes/condition, updated after each plan so the
  // NEXT plan's potentialRoomFactor() sees an up-to-date currentValue —
  // the authoritative write for attributes happens inside the RPC per
  // plan, this is only for computing subsequent inputs correctly.
  let attributes: Record<SkillAttribute, number> = rider.attributes;
  let condition: Record<'energy' | 'fatigue' | 'form' | 'fitness' | 'morale', number> = rider.condition;
  // Snapshot of condition as it stood before this run — written back as
  // condition_previous so the UI can compute a real trend, not a guess.
  const previousCondition = rider.condition;

  for (const plan of pending) {
    const focus = plan.focus as SkillAttribute;
    const growth = calculateRawGrowth({
      focus,
      intensity: plan.intensity,
      currentValue: attributes[focus],
      trainability: rider.trainability,
      professionalism: rider.professionalism,
      age: rider.age,
      potential: rider.potential,
      facilityMultiplier: trainingMultiplier,
    });

    const { data, error } = await supabase.rpc('process_training_plan', {
      p_plan_id: plan.id,
      p_primary_attr: growth.primaryAttr,
      p_primary_raw: growth.primaryRaw,
      p_secondary_attr: growth.secondaryAttr ?? null,
      p_secondary_raw: growth.secondaryRaw ?? null,
      p_threshold: TRAINING_GAIN_THRESHOLD,
    });

    if (error || !data || data.length === 0) continue; // Best-effort: a failed plan is retried on the next lazy run (still applied_at IS NULL).

    const result = data[0] as { primary_gain: number; secondary_gain: number; already_processed: boolean };
    if (result.already_processed) continue; // A concurrent run already handled this exact plan.

    const nextAttributes = { ...attributes };
    nextAttributes[growth.primaryAttr] = clampAttr(nextAttributes[growth.primaryAttr] + result.primary_gain);
    if (growth.secondaryAttr && result.secondary_gain) {
      nextAttributes[growth.secondaryAttr] = clampAttr(nextAttributes[growth.secondaryAttr] + result.secondary_gain);
    }
    attributes = nextAttributes;

    condition = {
      ...condition,
      energy: clamp100(condition.energy - ENERGY_COST[plan.intensity] * recoveryFactor),
      fatigue: clamp100(condition.fatigue + FATIGUE_GAIN[plan.intensity] * recoveryFactor),
    };
  }

  // Attributes are already persisted (per plan, inside the RPC above) —
  // this call only writes condition/condition_previous, never attributes,
  // so it can't clobber a concurrent run's attribute write with a stale
  // local copy.
  await applyConditionResult(rider.id, condition, previousCondition);
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
