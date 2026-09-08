import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentSeasonInfo, getSeasonBounds, seasonsNeedingProcessing } from './season';

/**
 * Season Aging V1 — global, idempotent "+1 age to every persistent rider"
 * transition, applied once per fully-elapsed season (never per-rider-page-
 * load — see the chat report). All real enforcement (the "only once, ever,
 * even under concurrent requests" guarantee) lives in the
 * process_season_aging() Postgres function (security definer, see
 * supabase/schema.sql) via an atomic INSERT ... ON CONFLICT DO NOTHING
 * RETURNING claim; this function is just the orchestrator that figures out
 * WHICH season numbers still need claiming and calls the RPC for each, in
 * order, so a player who skips several seasons without logging in still
 * gets caught up by exactly the right number of years — not just +1.
 *
 * Called lazily from app/rider/layout.tsx (the most broadly-hit
 * authenticated entry point), the same "no cron/tick job exists — the
 * first real request after the boundary does the work" pattern
 * lib/training/engine.ts's processCompletedTrainings() already
 * established for training.
 */
export async function ensureSeasonTransitionsProcessed(now: Date = new Date()): Promise<void> {
  const supabase = await createClient();
  const current = getCurrentSeasonInfo(now);

  const { data, error } = await supabase
    .from('season_transition_processing')
    .select('season_number')
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return; // Best-effort: a transient read failure here must not break the page it's called from.

  const lastProcessed = (data?.season_number as number | undefined) ?? 0;
  const pending = seasonsNeedingProcessing(lastProcessed, current.seasonNumber);

  for (const seasonNumber of pending) {
    const bounds = getSeasonBounds(seasonNumber);
    await supabase.rpc('process_season_aging', {
      p_season_id: bounds.seasonId,
      p_season_number: seasonNumber,
      p_cutoff: bounds.seasonEnd.toISOString(),
    });
    // No error handling that stops the loop: if this specific season's RPC
    // call fails, the next request will retry it (season_transition_processing
    // has no row for it yet, so it's still "pending" — safe to just try
    // again later rather than partially succeed and skip ahead).
  }
}
