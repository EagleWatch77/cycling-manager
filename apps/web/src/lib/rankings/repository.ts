import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { LEAGUES, type LeagueId } from '@/lib/leagues';
import { isLeagueId } from '@/lib/league/divisions';
import { ensureMyDivision } from '@/lib/league/repository';
import { isMsStatus } from './config';
import { buildTable, type BuiltTable, type PointsRow, type TableManager } from './table';

/**
 * ONE data source for the Rebríčky page and the Home window. Real data only:
 * managers come from the sub-league (league_standing_managers, migration
 * 20261116_04), points from league_points. Before that migration runs, the
 * table still shows the signed-in manager of his own sub-league with zero
 * points and dashes - never invented rivals, never an artificial order.
 */
export interface SubLeagueOption { number: number; memberCount: number; capacity: number; divisionId: string }

export interface Standings {
  seasonId: string;
  seasonNumber: number;
  seasons: { id: string; number: number }[];
  league: LeagueId;
  number: number;
  isMine: boolean;
  subLeagues: SubLeagueOption[];
  memberCount: number;
  capacity: number;
  table: BuiltTable;
  /** False while the managers/points functions are not available (migration not run). */
  dataReady: boolean;
}

function logErr(where: string, e: { code?: string; message?: string }) {
  console.error(`[rankings] ${where} failed: code=${e.code ?? '?'} message=${e.message ?? '?'}`);
}

const readMe = cache(async (): Promise<{ id: string; name: string | null; country: string | null } | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) logErr('read profiles', error);
  const name = ((data?.display_name as string | null | undefined) ?? '').trim();
  const cc = (data?.country_code as string | null | undefined) ?? null;
  return { id: user.id, name: name || null, country: cc && /^[A-Z]{2}$/.test(cc) ? cc : null };
});

export interface StandingsQuery { league?: string; number?: number; season?: string }

export async function getStandings(q: StandingsQuery = {}): Promise<Standings | null> {
  const mine = await ensureMyDivision();
  const me = await readMe();
  if (!mine || !me) return null;
  const supabase = await createClient();
  const info = getCurrentSeasonInfo();

  const league: LeagueId = q.league && isLeagueId(q.league) ? q.league : mine.league;
  const { data: divs, error: divErr } = await supabase
    .from('league_divisions').select('id, number, member_count, capacity').eq('league', league).order('number', { ascending: true });
  if (divErr) logErr('read league_divisions', divErr);
  const subLeagues: SubLeagueOption[] = (divs ?? []).map((d) => ({
    divisionId: d.id as string, number: d.number as number, memberCount: d.member_count as number, capacity: d.capacity as number,
  }));
  const wanted = q.number != null ? q.number : (league === mine.league ? mine.number : subLeagues[0]?.number);
  const div = subLeagues.find((d) => d.number === wanted) ?? subLeagues[0] ?? null;
  const isMine = !!div && div.divisionId === mine.divisionId;

  let managers: TableManager[] = [];
  let points: PointsRow[] = [];
  let seasonIds: string[] = [];
  let dataReady = false;
  const seasonId = q.season && /^season-\d+$/.test(q.season) ? q.season : info.seasonId;

  if (div) {
    const mg = await supabase.rpc('league_standing_managers', { p_division: div.divisionId });
    if (mg.error) {
      logErr('rpc league_standing_managers', mg.error);
      if (isMine) managers = [{ managerId: me.id, displayName: me.name, countryCode: me.country, isMe: true, ms: null }];
    } else {
      dataReady = true;
      managers = (mg.data as Record<string, unknown>[]).map((r) => ({
        managerId: r.player_id as string,
        displayName: ((r.display_name as string | null) ?? '').trim() || null,
        countryCode: typeof r.country_code === 'string' && /^[A-Z]{2}$/.test(r.country_code) ? r.country_code : null,
        isMe: r.is_me === true,
        ms: isMsStatus(r.ms_status) ? r.ms_status : null,
      }));
      const [pt, se] = await Promise.all([
        supabase.rpc('league_standing_points', { p_division: div.divisionId, p_season: seasonId }),
        supabase.rpc('league_standing_seasons', { p_division: div.divisionId }),
      ]);
      if (pt.error) logErr('rpc league_standing_points', pt.error);
      else points = (pt.data as Record<string, unknown>[]).map((r) => ({
        managerId: r.player_id as string, kind: r.kind as string, tourNo: r.tour_no as number,
        stageNo: (r.stage_no as number | null) ?? null, points: r.points as number,
      }));
      if (!se.error && se.data) seasonIds = (se.data as { season_id: string }[]).map((r) => r.season_id);
    }
  }

  const seasonSet = new Set<string>([info.seasonId, ...seasonIds]);
  const seasons = [...seasonSet].map((id) => ({ id, number: Number(id.replace('season-', '')) })).sort((a, b) => b.number - a.number);

  return {
    seasonId, seasonNumber: Number(seasonId.replace('season-', '')), seasons, league,
    number: div?.number ?? 1, isMine, subLeagues,
    memberCount: div?.memberCount ?? managers.length, capacity: div?.capacity ?? 50,
    table: buildTable(managers, points, league), dataReady,
  };
}

export { LEAGUES };
