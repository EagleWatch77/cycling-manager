import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getMyRider } from '@/lib/rider/repository';
import type { SeasonInfo } from '@/lib/calendar/season';

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
 * apply_training_plan_internal() (a security-definer Postgres function that
 * no client role can call, see supabase/schema.sql / migration 04) is now the SOLE authoritative source for
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

  // E1 (migration 04): the database decides which plans are due. One call, no
  // parameters — process_my_due_training() takes the caller from auth, applies
  // only plans whose week has ended per the SQL calendar (oldest first), and is
  // idempotent/atomic (row locks), so calling it on every page load or from
  // several tabs at once can never count a training twice. Nothing about the
  // season, week or plan is client-controlled any more.
  const supabase = await createClient();
  await supabase.rpc('process_my_due_training');
  // Best-effort: on an error nothing was applied (single transaction) and the
  // next call simply retries.
}
