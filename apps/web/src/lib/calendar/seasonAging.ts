import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * Season Aging V1 — global, idempotent "+1 age to every persistent rider"
 * transition, applied once per fully-elapsed season (never per-rider-page-
 * load — see the chat report). All real logic — which season numbers still
 * need processing, each one's real cutoff date, and the atomic
 * once-ever claim — lives entirely inside process_season_aging() (a
 * security-definer Postgres function, see supabase/schema.sql). This
 * function takes zero parameters by design: an earlier version accepted
 * season_id/season_number/cutoff from the caller, which an authenticated
 * client could call directly with fabricated values to age the whole
 * peloton repeatedly (see the chat report's security audit) — there is
 * nothing left here for a caller to influence.
 *
 * Called lazily from app/rider/layout.tsx (the most broadly-hit
 * authenticated entry point), the same "no cron/tick job exists — the
 * first real request after the boundary does the work" pattern
 * lib/training/engine.ts's processCompletedTrainings() already
 * established for training. See lib/calendar/season.ts's
 * getSeasonBounds()/seasonsNeedingProcessing() for the pure, unit-tested
 * TS mirror of the same "which seasons, what cutoff" math the SQL
 * function performs authoritatively.
 */
export async function ensureSeasonTransitionsProcessed(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('process_season_aging');
}
