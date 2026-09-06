import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getMyRider } from '@/lib/rider/repository';

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

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'no-rider' | 'already-registered' | 'error' };

/** Registers the current player's Rider for a Tour. Idempotent-safe: a duplicate is reported, not thrown. */
export async function registerForTour(tourId: string): Promise<RegisterResult> {
  const rider = await getMyRider();
  if (!rider) return { ok: false, reason: 'no-rider' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('tour_registrations')
    .insert({ rider_id: rider.id, tour_id: tourId });

  if (error) {
    // Postgres unique_violation — the Rider already has a registration for this Tour.
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
