import { createClient } from '@/lib/supabase/server';
import { reserveFailureFromError, type ReserveFailure } from '@/lib/contract/swap';

/**
 * Reads/actions for the market purchase. Every decision (switch, one pending
 * swap per manager, reservation, eligibility) is made by the database; nothing
 * here writes ownership, contracts or reservations directly. All three return
 * the "off" answer when the migration is not deployed yet.
 */
export interface PendingSwapView {
  newFirstName: string;
  newSurname: string;
  newCountryIso2: string;
  newAge: number;
  takeoverSeason: number;
  takeoverWeek: number;
  takeoverAt: string;
}

const seasonNo = (id: unknown): number => {
  const m = /^season-(\d+)$/.exec(String(id));
  return m ? Number(m[1]) : 0;
};

export async function isSwapEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('rider_swap_enabled');
  return !error && data === true;
}

export async function getMyPendingSwap(): Promise<PendingSwapView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_pending_swap');
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const r = data[0];
  return {
    newFirstName: r.new_first_name as string, newSurname: r.new_surname as string,
    newCountryIso2: r.new_country_iso2 as string, newAge: r.new_age as number,
    takeoverSeason: seasonNo(r.takeover_season_id), takeoverWeek: r.takeover_week as number,
    takeoverAt: r.takeover_at as string,
  };
}

export type ReserveResult = { ok: true } | { ok: false; reason: ReserveFailure };

export async function reserveMarketRider(marketRiderId: string): Promise<ReserveResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reserve_market_rider', { p_market_rider_id: marketRiderId });
  return error ? { ok: false, reason: reserveFailureFromError(error.message) } : { ok: true };
}

/** Runs the due swaps of the caller's request (idempotent, no-op while the switch is off). */
export async function processDueRiderSwaps(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('process_due_rider_swaps');
}
