import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin/auth';
import { maxFacilityLevel, LEAGUES, type LeagueId } from '@/lib/leagues';
import { computeFacilityCaps } from './capMath';
import type { FacilityId, FacilityLevel } from './config';

/**
 * The current player's real league, read from public.profiles.league.
 * This is the FIRST place in the codebase that actually reads this column
 * — every existing display of "league" (sidebar, top status bar) reads
 * mock/dashboard.ts's PLAYER.league constant instead, which is demo-only
 * fixture data, not the real per-player value (see the chat report). This
 * facility system needs the real value since the league cap must not be
 * client-trusted; it does NOT fix the mock display elsewhere, which is out
 * of this task's scope but worth flagging.
 */
export async function getMyLeague(): Promise<LeagueId> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'rookie';

  const { data } = await supabase.from('profiles').select('league').eq('id', user.id).maybeSingle();
  const league = data?.league as string | undefined;
  return (LEAGUES as readonly string[]).includes(league ?? '') ? (league as LeagueId) : 'rookie';
}

export interface PlayerFacilities {
  training: FacilityLevel;
  recovery: FacilityLevel;
  scouting: FacilityLevel;
  technical: FacilityLevel;
  teamCenter: FacilityLevel;
}

const DEFAULT_FACILITIES: PlayerFacilities = {
  training: 1, recovery: 1, scouting: 1, technical: 1, teamCenter: 1,
};

function fromRow(row: Record<string, unknown>): PlayerFacilities {
  return {
    training: row.training_level as FacilityLevel,
    recovery: row.recovery_level as FacilityLevel,
    scouting: row.scouting_level as FacilityLevel,
    technical: row.technical_level as FacilityLevel,
    teamCenter: row.team_center_level as FacilityLevel,
  };
}

/**
 * The current player's facility levels. Returns all-L1 defaults (never an
 * error) when no row exists yet — a fresh player's row is only actually
 * inserted the first time upgrade_facility() runs (see schema.sql); reading
 * never needs to write.
 */
export async function getMyFacilities(): Promise<PlayerFacilities> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_FACILITIES;

  const { data, error } = await supabase
    .from('player_facilities')
    .select('*')
    .eq('player_id', user.id)
    .maybeSingle();

  if (error || !data) return DEFAULT_FACILITIES;
  return fromRow(data);
}

/**
 * The effective cap for each facility right now, for THIS player — the
 * lower of the league cap and the Team Center-derived cap (item 3: "použi
 * vždy najnižší z relevantných limitov"), with the admin/dev override
 * applied server-side only (never trusted from the client — see
 * lib/admin/auth.ts's isAdmin()). This mirrors upgrade_facility()'s own SQL
 * exactly so the UI never shows a cap the database wouldn't also enforce;
 * the database function remains the actual security boundary regardless.
 */
export async function getFacilityCaps(league: LeagueId, facilities: PlayerFacilities): Promise<Record<FacilityId, FacilityLevel>> {
  const admin = await isAdmin();
  const leagueCap = (admin ? 5 : maxFacilityLevel(league)) as FacilityLevel;
  return computeFacilityCaps(leagueCap, facilities.teamCenter);
}

export type UpgradeFacilityResult =
  | { ok: true; facilities: PlayerFacilities }
  | { ok: false; reason: 'not-authenticated' | 'max-level' | 'cap-reached' | 'error' };

const DB_FACILITY_ID: Record<FacilityId, string> = {
  training: 'training', recovery: 'recovery', scouting: 'scouting',
  technical: 'technical', teamCenter: 'team_center',
};

/**
 * The ONLY way a facility level ever changes. Delegates entirely to the
 * `upgrade_facility` Postgres function (security definer — see
 * schema.sql), which re-validates league cap, Team Center cap, admin
 * bypass, and current level server-side, and is safe against a double-click
 * (row lock inside the function). This repository function adds no
 * business logic of its own — it exists only to translate the RPC's error
 * codes into the app's own result type.
 */
export async function upgradeFacility(facility: FacilityId): Promise<UpgradeFacilityResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'not-authenticated' };

  const { data, error } = await supabase.rpc('upgrade_facility', { p_facility: DB_FACILITY_ID[facility] });

  if (error) {
    if (error.message?.includes('facility_max_level')) return { ok: false, reason: 'max-level' };
    if (error.message?.includes('facility_cap_reached')) return { ok: false, reason: 'cap-reached' };
    return { ok: false, reason: 'error' };
  }
  if (!data) return { ok: false, reason: 'error' };

  return { ok: true, facilities: fromRow(data as Record<string, unknown>) };
}
