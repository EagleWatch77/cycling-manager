import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getMyRider } from '@/lib/rider/repository';
import type { SeasonInfo } from '@/lib/calendar/season';
import { listUnprocessedTrainingPlans, type TrainingPlan } from './repository';

/**
 * Unified Weekly Training V1 processing engine.
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
 * SECURITY + Unified Weekly Training V1 (see the chat report, item 25):
 * process_training_plan() (a security-definer Postgres function, see
 * supabase/schema.sql) is now the SOLE authoritative source for
 * EVERYTHING a processed plan changes — attribute gains (Performance AND
 * Technical), Energy/Fatigue/condition_previous, and readiness — reading
 * only trusted persisted data (week_type, focus, intensity, rider
 * attributes/trainability/professionalism/age/potential/condition, and
 * facility levels). This file no longer computes ANY of that: an earlier
 * version tracked condition locally in JS and wrote it back via a plain
 * (non-security-definer) `update` — which meant any authenticated client
 * could bypass this Next.js code entirely and set their own rider's
 * condition to arbitrary values via PostgREST (this project has no
 * service-role key, so this server code has no more trust than any other
 * authenticated caller). That gap is now closed: the RPC is the sole
 * source of truth for every effect of a processed plan; this loop only
 * fires the RPC once per pending plan.
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

  const supabase = await createClient();

  for (const plan of pending) {
    // The only parameter this RPC takes is the plan id — see this
    // function's own doc comment and process_training_plan()'s in
    // supabase/schema.sql for why: nothing about the gain (focus,
    // intensity, raw growth, secondary attribute, condition/readiness) is
    // client-controlled anymore.
    await supabase.rpc('process_training_plan', { p_plan_id: plan.id });
    // Best-effort: a failed/erroring call is retried on the next lazy run
    // (the plan's applied_at is still NULL). The RPC itself is idempotent,
    // so retrying a partially-applied attempt is always safe.
  }
}

/** A plan's week has ended once its season is behind the current one, or it's an earlier week of the current season. */
function isWeekOver(plan: TrainingPlan, season: SeasonInfo): boolean {
  return plan.seasonId !== season.seasonId || plan.weekNumber < season.currentWeek;
}
