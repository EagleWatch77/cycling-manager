import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { LeagueId } from '@/lib/leagues';
import { isLeagueId } from './divisions';

/**
 * The signed-in player's sub-league (league_memberships + league_divisions,
 * see supabase/migrations/20261114_02_league_divisions.sql).
 *
 * Degrades safely: if the sub-league tables/RPC are unreachable every function
 * returns null/[] and callers fall back to the plain league on profiles.league.
 * That fallback is never silent: every database error is logged with its code
 * and hint (Vercel → project → Logs), because an unreachable table otherwise
 * looks exactly like "no sub-league yet".
 */
export interface MyDivision {
  divisionId: string;
  league: LeagueId;
  /** The "n" in "<League> 1.<n>". */
  number: number;
  memberCount: number;
  capacity: number;
}

interface DbError { code?: string; message?: string; hint?: string | null; details?: string | null }

function logDbError(where: string, error: DbError) {
  console.error(
    `[league] ${where} failed: code=${error.code ?? '?'} message=${error.message ?? '?'}` +
    `${error.hint ? ` hint=${error.hint}` : ''}${error.details ? ` details=${error.details}` : ''}`,
  );
}

/** One sub-league row by id. */
async function readDivisionById(supabase: SupabaseClient, divisionId: string): Promise<MyDivision | null> {
  const { data, error } = await supabase
    .from('league_divisions')
    .select('id, league, number, member_count, capacity')
    .eq('id', divisionId)
    .maybeSingle();
  if (error) { logDbError('read league_divisions', error); return null; }
  if (!data || !isLeagueId(data.league as string)) return null;
  return {
    divisionId: data.id as string,
    league: data.league as LeagueId,
    number: data.number as number,
    memberCount: data.member_count as number,
    capacity: data.capacity as number,
  };
}

/**
 * The player's sub-league; a player without one is placed now into Rookie
 * (lowest-numbered sub-league with a free spot, else a new one) in the
 * CURRENT GLOBAL season. The RPC takes NO arguments: league (Rookie), player
 * (auth.uid()) and season (server time in SQL) cannot be supplied by a client.
 * It is idempotent and concurrency-safe in the database. Cached per request,
 * so AppShell and the page share one lookup.
 *
 * NOTE: after the RPC the division is read by the id the RPC RETURNED, never by
 * re-running the membership query. Next.js memoizes identical GET fetches
 * within one render, so repeating the first (empty) membership read would
 * return the stale empty answer and a brand-new player would see plain
 * "Rookie" on their very first page view.
 */
export const ensureMyDivision = cache(async (): Promise<MyDivision | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership, error } = await supabase
    .from('league_memberships')
    .select('division_id')
    .eq('player_id', user.id)
    .maybeSingle();
  if (error) { logDbError('read league_memberships', error); return null; }
  if (membership) return readDivisionById(supabase, membership.division_id as string);

  const { data: assigned, error: rpcError } = await supabase.rpc('assign_my_league_division');
  if (rpcError) { logDbError('rpc assign_my_league_division', rpcError); return null; }
  if (typeof assigned !== 'string') {
    console.error('[league] rpc assign_my_league_division returned no division id');
    return null;
  }
  return readDivisionById(supabase, assigned);
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
  if (error) { logDbError('read division_members', error); return []; }
  if (!data) return [];
  return data.map((r) => ({
    riderId: r.rider_id as string,
    firstName: r.first_name as string,
    surname: r.surname as string,
    countryIso2: r.country_iso2 as string,
    age: r.age as number,
  }));
}
