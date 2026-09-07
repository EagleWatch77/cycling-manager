import 'server-only';
import { createClient } from '@/lib/supabase/server';

export const RANKINGS_PAGE_SIZE = 20;

/**
 * The only shape the browser ever receives for a ranked rider. No hidden
 * field (truePotential, generator metadata, etc.) is ever selected here —
 * see the chat report, item 23. `rank` and `rankChange` are NOT part of the
 * DB row: `rank` is this row's position within the sorted/paginated result
 * (rankOffset + index, computed by the caller, same pattern as
 * MarketTable's row numbering); `rankChange` is always null for now — no
 * ranking_snapshots table exists to compare against a previous standing
 * (see the report), so the UI renders "—" rather than inventing movement.
 */
export interface RankingRow {
  riderId: string;
  firstName: string;
  surname: string;
  countryName: string;
  countryIso2: string;
  age: number;
  points: number;
  wins: number;
  podiums: number;
  /** Always null until a ranking-snapshot mechanism exists — see the report. */
  rankChange: number | null;
}

export interface RankingsPageResult {
  riders: RankingRow[];
  total: number;
  page: number;
  pageSize: number;
}

function fromRow(row: Record<string, unknown>): RankingRow {
  return {
    riderId: row.rider_id as string,
    firstName: row.first_name as string,
    surname: row.surname as string,
    countryName: row.country_name as string,
    countryIso2: row.country_iso2 as string,
    age: row.age as number,
    points: row.points as number,
    wins: row.wins as number,
    podiums: row.podiums as number,
    rankChange: null,
  };
}

/**
 * Server-side paginated + searched read of the rider_rankings view (see
 * supabase/schema.sql), which aggregates real race_results rows — never a
 * random or fabricated number. Sort is points DESC first; ties are broken
 * deterministically by wins DESC, then surname ASC, then rider_id ASC (the
 * final tiebreaker guarantees a stable order even between two riders with
 * identical points, wins, and surname — see the report for why this rule
 * was chosen: no official tie-break rule existed anywhere in the project).
 *
 * Returns total === 0 whenever no race has produced a result yet for this
 * season — the page renders the "not available yet" empty state for that
 * case rather than any placeholder rows.
 */
export async function getRiderRankingsPage(input: {
  seasonId: string;
  page: number;
  search?: string;
}): Promise<RankingsPageResult> {
  const supabase = await createClient();

  let builder = supabase
    .from('rider_rankings')
    .select('*', { count: 'exact' })
    .eq('season_id', input.seasonId);

  const term = input.search?.trim().replace(/[%_]/g, '');
  if (term) {
    builder = builder.or(`first_name.ilike.%${term}%,surname.ilike.%${term}%`);
  }

  builder = builder
    .order('points', { ascending: false })
    .order('wins', { ascending: false })
    .order('surname', { ascending: true })
    .order('rider_id', { ascending: true });

  const page = Math.max(1, input.page);
  const from = (page - 1) * RANKINGS_PAGE_SIZE;
  const to = from + RANKINGS_PAGE_SIZE - 1;
  builder = builder.range(from, to);

  const { data, count, error } = await builder;
  if (error || !data) return { riders: [], total: 0, page, pageSize: RANKINGS_PAGE_SIZE };

  return { riders: data.map(fromRow), total: count ?? 0, page, pageSize: RANKINGS_PAGE_SIZE };
}

/**
 * Whether ANY ranking data exists yet for this season, regardless of the
 * current search term — lets the page tell "no races processed yet" apart
 * from "no rider matches this search".
 */
export async function hasAnyRankingData(seasonId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('rider_rankings')
    .select('rider_id', { count: 'exact', head: true })
    .eq('season_id', seasonId);
  return !error && (count ?? 0) > 0;
}

export interface PublicRiderStats {
  riderId: string;
  firstName: string;
  surname: string;
  countryName: string;
  countryIso2: string;
  age: number;
  points: number;
  wins: number;
  podiums: number;
  races: number;
  bestPosition: number;
}

/**
 * The public "profil jazdca" a Rankings row links to (see RankingsTable).
 * Sourced only from rider_rankings — the same leak-proof view the ranking
 * table itself reads — so this can never expose attributes/potential/
 * condition for a rider that isn't the visitor's own. Returns null both
 * when the id doesn't exist and when that rider has no results yet this
 * season; either way the page shows the same "no data" outcome, never a
 * distinction that would let someone probe for which ids exist.
 */
export async function getPublicRiderStats(riderId: string, seasonId: string): Promise<PublicRiderStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rider_rankings')
    .select('*')
    .eq('rider_id', riderId)
    .eq('season_id', seasonId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    riderId: data.rider_id as string,
    firstName: data.first_name as string,
    surname: data.surname as string,
    countryName: data.country_name as string,
    countryIso2: data.country_iso2 as string,
    age: data.age as number,
    points: data.points as number,
    wins: data.wins as number,
    podiums: data.podiums as number,
    races: data.races as number,
    bestPosition: data.best_position as number,
  };
}
