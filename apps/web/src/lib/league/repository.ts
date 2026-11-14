import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { LeagueId } from '@/lib/leagues';
import { isLeagueId } from './divisions';

/**
 * The signed-in player's sub-league (league_memberships + league_divisions,
 * see supabase/migrations/20261114_league_divisions.sql).
 *
 * Degrades safely: if the migration has not been deployed yet (tables or RPC
 * missing) every function returns null/[] instead of throwing, and callers
 * fall back to the plain league on profiles.league.
 */
export interface MyDivision {
  divisionId: string;
  league: LeagueId;
  /** The "n" in "<League> 1.<n>". */
  number: number;
  memberCount: number;
  capacity: number;
  joinedSeasonId: string;
}

async function readMyDivision(): Promise<{ division: MyDivision | null; signedIn: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { division: null, signedIn: false };

  const { data, error } = await supabase
    .from('league_memberships')
    .select('division_id, league, joined_season_id')
    .eq('player_id', user.id)
    .maybeSingle();
  if (error || !data) return { division: null, signedIn: true };

  const { data: d } = await supabase
    .from('league_divisions')
    .select('number, member_count, capacity')
    .eq('id', data.division_id as string)
    .maybeSingle();
  const league = data.league as string;
  if (!d || !isLeagueId(league)) return { division: null, signedIn: true };

  return {
    division: {
      divisionId: data.division_id as string,
      league,
      number: d.number as number,
      memberCount: d.member_count as number,
      capacity: d.capacity as number,
      joinedSeasonId: data.joined_season_id as string,
    },
    signedIn: true,
  };
}

/**
 * The player's sub-league; a player without one is placed now into Rookie
 * (lowest-numbered sub-league with a free spot, else a new one) in the
 * CURRENT GLOBAL season. The RPC takes NO arguments: league (Rookie), player
 * (auth.uid()) and season (server time in SQL) cannot be supplied by a client.
 * It is idempotent and concurrency-safe in the database. Cached per request, so AppShell and the page share one lookup.
 */
export const ensureMyDivision = cache(async (): Promise<MyDivision | null> => {
  const first = await readMyDivision();
  if (first.division || !first.signedIn) return first.division;

  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_my_league_division');
  if (error) {
    console.error('[ensureMyDivision] assignment failed', error);
    return null;
  }
  return (await readMyDivision()).division;
});

export interface DivisionMember {
  riderId: string;
  firstName: string;
  surname: string;
  countryIso2: string;
  age: number;
}

/**
 * Riders of the player's own sub-league — public identity only (the
 * division_members view exposes nothing else). No points, no ranks: scoring
 * does not exist yet.
 */
export async function getMyDivisionMembers(): Promise<DivisionMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('division_members')
    .select('rider_id, first_name, surname, country_iso2, age, joined_at')
    .order('joined_at', { ascending: true })
    .order('rider_id', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    riderId: r.rider_id as string,
    firstName: r.first_name as string,
    surname: r.surname as string,
    countryIso2: r.country_iso2 as string,
    age: r.age as number,
  }));
}
