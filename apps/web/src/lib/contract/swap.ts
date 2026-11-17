import { WEEK_LENGTH_DAYS, SEASON_ONE_START } from '@/lib/calendar/season';
import { gameWeekIndex, seasonWeekOfIndex, type SeasonWeek } from './contract';

/**
 * Market purchase + weekly swap — pure rules (no I/O), mirrored by
 * supabase/migrations/20261116_02_market_purchase_and_swap.sql. The database
 * decides (server clock, row locks); this pins the rule for the unit tests.
 *
 * A purchase never swaps at once: the bought rider is reserved and takes over
 * at the next weekly closure, Monday 00:00 UTC (= Sunday 24:00 UTC). The new
 * contract counts from the week of that takeover, not from the purchase.
 */
export interface SwapPlan {
  /** Week in which the purchase happened. */
  purchaseWeek: SeasonWeek;
  /** Week in which the new rider takes over (first week of his contract). */
  takeoverWeek: SeasonWeek;
  takeoverAt: Date;
}

const MS_PER_DAY = 86_400_000;
const ANCHOR_MS = Date.parse(`${SEASON_ONE_START}T00:00:00Z`);

export function planSwap(purchasedAt: Date): SwapPlan {
  const idx = gameWeekIndex(purchasedAt);
  return {
    purchaseWeek: seasonWeekOfIndex(idx),
    takeoverWeek: seasonWeekOfIndex(idx + 1),
    takeoverAt: new Date(ANCHOR_MS + (idx + 1) * WEEK_LENGTH_DAYS * MS_PER_DAY),
  };
}

export type ReserveFailure =
  | 'disabled' | 'no-rider' | 'swap-pending' | 'not-available' | 'not-eligible' | 'not-found' | 'not-authenticated' | 'unknown';

/** Maps the exception text of reserve_market_rider() to a stable code (never shown raw to the player). */
export function reserveFailureFromError(message: string | null | undefined): ReserveFailure {
  const m = message ?? '';
  if (m.includes('swap_disabled')) return 'disabled';
  if (m.includes('no_active_rider')) return 'no-rider';
  if (m.includes('swap_pending')) return 'swap-pending';
  if (m.includes('not_available')) return 'not-available';
  if (m.includes('not_eligible')) return 'not-eligible';
  if (m.includes('not_found')) return 'not-found';
  if (m.includes('not_authenticated')) return 'not-authenticated';
  return 'unknown';
}
