import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getMyRider } from '@/lib/rider/repository';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule, getSelectionState } from '@/data/tourSchedule';

/**
 * Tour Registration V1 — links a Rider (not the player account) to a
 * scheduled Tour. See supabase/schema.sql for public.tour_registrations.
 */

export interface StoredRegistration {
  id: string;
  riderId: string;
  tourId: string;
  registeredAt: string;
}

function fromRow(row: Record<string, unknown>): StoredRegistration {
  return {
    id: row.id as string,
    riderId: row.rider_id as string,
    tourId: row.tour_id as string,
    registeredAt: row.registered_at as string,
  };
}

/** The current player's registration for a Tour, or null if they have none. */
export async function getMyRegistration(tourId: string): Promise<StoredRegistration | null> {
  const rider = await getMyRider();
  if (!rider) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tour_registrations')
    .select('*')
    .eq('rider_id', rider.id)
    .eq('tour_id', tourId)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data);
}

/** The current player's registrations among the given Tour ids (e.g. one season's Tours). */
export async function getMySeasonRegistrations(tourIds: string[]): Promise<StoredRegistration[]> {
  const rider = await getMyRider();
  if (!rider || tourIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tour_registrations')
    .select('*')
    .eq('rider_id', rider.id)
    .in('tour_id', tourIds);

  if (error || !data) return [];
  return data.map(fromRow);
}

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'no-rider' | 'already-registered' | 'date-overlap' | 'season-limit' | 'error' };

/**
 * Registers the current player's Rider for a Tour ("Tour selection").
 * Enforces the same rules the Races page shows: max MAX_SEASON_TOUR_SELECTIONS
 * per season, and no two Tours whose real race dates overlap — checked here,
 * not only in the UI, so this cannot be bypassed by calling the action directly.
 */
export async function registerForTour(tourId: string): Promise<RegisterResult> {
  const rider = await getMyRider();
  if (!rider) return { ok: false, reason: 'no-rider' };

  const info = getCurrentSeasonInfo();
  const seasonViews = getSeasonSchedule(info);
  const seasonTourIds = seasonViews.map((v) => v.tour.id);
  const existing = await getMySeasonRegistrations(seasonTourIds);
  const selectedTourIds = new Set(existing.map((r) => r.tourId));

  const state = getSelectionState(tourId, seasonViews, selectedTourIds);
  if (state === 'selected') return { ok: false, reason: 'already-registered' };
  if (state === 'overlap') return { ok: false, reason: 'date-overlap' };
  if (state === 'season-limit') return { ok: false, reason: 'season-limit' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('tour_registrations')
    .insert({ rider_id: rider.id, tour_id: tourId });

  if (error) {
    // Postgres unique_violation — a concurrent request won the same race.
    if (error.code === '23505') return { ok: false, reason: 'already-registered' };
    return { ok: false, reason: 'error' };
  }
  return { ok: true };
}

export interface StartListEntry {
  riderId: string;
  firstName: string;
  surname: string;
  countryName: string;
  age: number;
  registeredAt: string;
}

/** Every Rider registered for a Tour, oldest registration first. AI riders are never included in V1. */
export async function listStartList(tourId: string): Promise<StartListEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tour_registrations')
    .select('registered_at, riders!inner(id, first_name, surname, country_name, age)')
    .eq('tour_id', tourId)
    .order('registered_at', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const r = row.riders as unknown as {
      id: string; first_name: string; surname: string; country_name: string; age: number;
    };
    return {
      riderId: r.id,
      firstName: r.first_name,
      surname: r.surname,
      countryName: r.country_name,
      age: r.age,
      registeredAt: row.registered_at as string,
    };
  });
}
