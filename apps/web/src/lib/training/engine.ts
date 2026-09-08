import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getMyRider, applyConditionResult } from '@/lib/rider/repository';
import type { SeasonInfo } from '@/lib/calendar/season';
import { listUnprocessedTrainingPlans, type TrainingPlan } from './repository';
import { ENERGY_COST, FATIGUE_GAIN } from './config';
import { getMyFacilities, getFacilityCaps, getEffectiveFacilities, getMyLeague } from '@/lib/facilities/repository';
import { RECOVERY_BONUS } from '@/lib/facilities/config';

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
 * Training Progress Accumulator V1 + Security Hardening Round 2 (see the
 * chat report): the ENTIRE raw growth calculation — focus, intensity,
 * trainability/professionalism/age/potential, and the effective Training
 * Center level — now happens INSIDE process_training_plan() (a
 * security-definer Postgres function, see supabase/schema.sql), reading
 * only trusted persisted data. This file no longer computes raw growth at
 * all: an earlier version computed it here and sent it as an RPC
 * parameter, which meant any authenticated client could bypass this
 * Next.js code entirely and call the same RPC directly with a fabricated
 * raw value (this project has no service-role key, so this server code
 * has no more trust than any other authenticated caller hitting the RPC
 * via PostgREST). The RPC is now the sole source of truth for gains; this
 * loop only tracks the resulting attribute/condition deltas locally so
 * the UI-facing `attributes`/`condition` objects stay consistent across
 * multiple plans processed in the same run.
 *
 * Idempotency: the plan row is locked and its applied_at checked FIRST
 * inside the RPC, so two concurrent runs (two tabs, a retry) can never
 * both consume the same plan's progress — the loser's call simply returns
 * already_processed = true and mutates nothing.
 */
export async function processCompletedTrainings(season: SeasonInfo): Promise<void> {
  const rider = await getMyRider();
  if (!rider) return;

  const pending = (await listUnprocessedTrainingPlans(rider.id))
    .filter((plan) => isWeekOver(plan, season));
  if (pending.length === 0) return;

  // Recovery Center still applies here (not part of the security fix's
  // scope — see the chat report: only the training GAIN calculation moved
  // into SQL; condition/energy/fatigue handling is unchanged). Uses
  // EFFECTIVE level, not raw stored level — see
  // lib/facilities/capMath.ts's effectiveFacilityLevel doc comment.
  const [facilities, league] = await Promise.all([getMyFacilities(), getMyLeague()]);
  const caps = await getFacilityCaps(league, facilities);
  const effective = getEffectiveFacilities(facilities, caps);
  const recoveryFactor = 1 - RECOVERY_BONUS[effective.recovery];

  const supabase = await createClient();

  // Condition is still tracked locally across the loop (written once at
  // the end) — attributes are NOT: each RPC call below reads the rider's
  // CURRENT attributes fresh from the DB itself (which already reflects
  // any earlier plan in this same loop, since each call commits its own
  // write), so there is nothing for this file to mirror locally anymore.
  // An earlier version DID track attributes locally here — that became
  // dead code once raw growth moved fully into SQL (Security Hardening
  // Round 2) and was removed as part of the Development Model V2 change
  // (see the chat report) rather than papering over it with a stale local
  // clamp that no longer matched the new Performance ceiling (200).
  let condition: Record<'energy' | 'fatigue' | 'form' | 'fitness' | 'morale', number> = rider.condition;
  // Snapshot of condition as it stood before this run — written back as
  // condition_previous so the UI can compute a real trend, not a guess.
  const previousCondition = rider.condition;

  for (const plan of pending) {
    // The only parameter this RPC takes is the plan id — see this
    // function's own doc comment and process_training_plan()'s in
    // supabase/schema.sql for why: nothing about the gain (focus,
    // intensity, raw growth, secondary attribute) is client-controlled
    // anymore.
    const { data, error } = await supabase.rpc('process_training_plan', { p_plan_id: plan.id });

    if (error || !data || data.length === 0) continue; // Best-effort: a failed plan is retried on the next lazy run (still applied_at IS NULL).

    const result = data[0] as { primary_gain: number; secondary_gain: number; already_processed: boolean };
    if (result.already_processed) continue; // A concurrent run already handled this exact plan.

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

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}
