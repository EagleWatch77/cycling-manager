import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentSeasonInfo, type SeasonInfo } from '@/lib/calendar/season';
import { getScheduleForTour } from '@/data/tourSchedule';
import { TOURS } from '@/data/tours';
import { toBikeCondition, computeTourWear, clamp0to100, type BikeCondition } from './bikeCalc';

export type { BikeCondition, ServiceQuote, ServiceQuoteItem, TourWear } from './bikeCalc';
export { computeServiceQuote, computeTourWear } from './bikeCalc';

const FULL_CONDITION: BikeCondition = { tires: 100, brakes: 100, drivetrain: 100, overall: 100, riskBand: 'normal' };

/** The current player's bike condition, or full (100/100/100) if no row exists yet (e.g. rider created before this migration ran and the backfill hasn't reached it, or genuinely brand new). */
export async function getMyBikeCondition(riderId: string): Promise<BikeCondition> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bike_condition')
    .select('tires, brakes, drivetrain')
    .eq('rider_id', riderId)
    .maybeSingle();

  if (error || !data) return FULL_CONDITION;
  return toBikeCondition(data);
}

export type PerformServiceResult = { ok: true } | { ok: false; reason: 'no-rider' | 'error' };

/**
 * Resets the current player's bike to full condition. The price itself is
 * NOT deducted from anything here — no Finance ledger/transactions table
 * exists yet (see the chat report, item 12), so this is a deliberate
 * service boundary: computeServiceQuote() already produces the exact real
 * price a future "record bike_service expense" call would need, but that
 * call doesn't exist yet. TODO(finance): once a transactions table exists,
 * debit `discountedPrice` here before/atomically with the reset below.
 */
export async function performService(riderId: string): Promise<PerformServiceResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('bike_condition')
    .update({ tires: 100, brakes: 100, drivetrain: 100, updated_at: new Date().toISOString() })
    .eq('rider_id', riderId);

  if (error) return { ok: false, reason: 'error' };
  return { ok: true };
}

/**
 * Lazy wear processing — mirrors lib/training/engine.ts's
 * processCompletedTrainings() pattern exactly: no cron/tick job exists
 * anywhere in this codebase, so this runs once at the top of the
 * Facilities page load, looking for the player's own registrations whose
 * Tour week has already passed and that haven't had wear applied yet
 * (wear_processed_at is null — the same applied_at-guards-idempotency idea
 * training_plans already uses). Concurrent/repeated calls are safe no-ops
 * after the first: the UPDATE only ever touches rows still null.
 */
export async function processCompletedBikeWear(riderId: string, season: SeasonInfo = getCurrentSeasonInfo()): Promise<void> {
  const supabase = await createClient();
  const { data: pending, error } = await supabase
    .from('tour_registrations')
    .select('id, tour_id')
    .eq('rider_id', riderId)
    .is('wear_processed_at', null);

  if (error || !pending || pending.length === 0) return;

  const { data: bikeRow } = await supabase
    .from('bike_condition')
    .select('tires, brakes, drivetrain')
    .eq('rider_id', riderId)
    .maybeSingle();
  let condition = bikeRow ?? { tires: 100, brakes: 100, drivetrain: 100 };

  for (const reg of pending) {
    const schedule = getScheduleForTour(reg.tour_id as string, season);
    // No schedule entry, or this Tour's week hasn't happened yet — leave
    // wear_processed_at null, nothing to apply.
    if (!schedule || schedule.weekNumber >= season.currentWeek) continue;

    const tour = TOURS.find((t) => t.id === reg.tour_id);
    if (!tour) continue; // Unknown tour id — nothing real to compute wear from.

    const wear = computeTourWear(tour);
    condition = {
      tires: clamp0to100(condition.tires - wear.tires),
      brakes: clamp0to100(condition.brakes - wear.brakes),
      drivetrain: clamp0to100(condition.drivetrain - wear.drivetrain),
    };

    await supabase.from('bike_condition').upsert({ rider_id: riderId, ...condition, updated_at: new Date().toISOString() });
    // Only ever moves a still-null row to non-null — never re-applies wear
    // for a registration a concurrent/earlier call already processed.
    await supabase.from('tour_registrations').update({ wear_processed_at: new Date().toISOString() }).eq('id', reg.id).is('wear_processed_at', null);
  }
}
