import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { SegmentLevel } from '@/lib/rider/development';
import type { SkillAttribute } from '@/lib/rider/config';
import { overallRating } from '@/lib/rider/score';
import { isPremiumEntitled } from '@/lib/premium/entitlement';
import type { MarketTier } from './repository';
import { sortByOverall } from './marketSort';

export const MARKET_PAGE_SIZE = 20;

/**
 * The ONLY market_riders columns a player's session may read (O-011, migration 20261119_02 — column-level GRANT). Hidden values
 * (potential, trainability, professionalism, recovery, vitality, aptitude, state coefficients, generator metadata) are not selectable
 * by `authenticated` at all; `potential_stars` is the 1-5 bucket computed by the database. Never select('*') here.
 */
const MARKET_PUBLIC_COLUMNS = 'id, tier, first_name, surname, country_name, country_iso2, age, attributes, inferred_archetype, potential_stars';

/**
 * The ONLY shape a player's browser ever receives for a market rider.
 * Deliberately its own type, not MarketRiderRow (admin) with fields hidden
 * by the UI — the raw `potential` number, generator metadata, and every
 * other admin-only field simply never get read out of the DB row here, so
 * there is nothing for a page or a client-component prop to leak by
 * accident. Salary and offer-count are NOT included: neither field exists
 * in market_riders yet (see the chat report) — inventing them here would be
 * the exact "fabricate a number to imitate GPRO" this task explicitly
 * forbids.
 */
export interface MarketRiderView {
  id: string;
  tier: MarketTier;
  firstName: string;
  surname: string;
  countryName: string;
  countryIso2: string;
  age: number;
  archetype: string;
  potentialStars: SegmentLevel;
  /**
   * Player-facing 0-100 scores (see lib/rider/score.ts) — computed
   * server-side from real persisted attributes only. Deliberately the ONLY
   * ability-related numbers in this DTO: raw Performance/Tactics/
   * Technique/Trainability/Professionalism/Recovery/exact Potential never
   * reach the browser through the Free Market (see the chat report, items
   * 19-22) — a Free player learns "this rider is overall 78", never why.
   */
  overallRating: number;
}

export interface MarketRiderDetail extends MarketRiderView {
  attributes: Record<SkillAttribute, number>;
}

/** 'overall' = OVR F4 descending with a stable mix of equal OVR (the default, see marketSort.ts); the others are the Premium filter-bar sorts. */
export type MarketSort = 'overall' | 'name' | 'age' | 'country' | 'archetype' | 'potential';

export interface MarketQuery {
  tier: MarketTier;
  page: number;
  /** Premium-only filters — silently ignored for a 'free' query (see getMarketPage). */
  search?: string;
  country?: string;
  archetype?: string;
  ageMin?: number;
  ageMax?: number;
  /** 1-5, same bucket as the displayed stars — never a raw potential value. */
  potentialStars?: SegmentLevel;
  sort?: MarketSort;
}

export interface MarketPageResult {
  riders: MarketRiderView[];
  total: number;
  page: number;
  pageSize: number;
}

function toView(row: Record<string, unknown>): MarketRiderView {
  // `attributes` is fetched from the DB row (getMarketPage selects MARKET_PUBLIC_COLUMNS) to
  // compute the two safe derived scores below, but is deliberately NEVER
  // included in the returned object itself — a Free Market caller gets the
  // 0-100 scores only, never the raw attribute breakdown they're built from.
  const attributes = row.attributes as Record<SkillAttribute, number>;
  return {
    id: row.id as string,
    tier: row.tier as MarketTier,
    firstName: row.first_name as string,
    surname: row.surname as string,
    countryName: row.country_name as string,
    countryIso2: row.country_iso2 as string,
    age: row.age as number,
    archetype: row.inferred_archetype as string,
    potentialStars: row.potential_stars as SegmentLevel,
    overallRating: overallRating(attributes),
  };
}

const SORT_COLUMN: Record<Exclude<MarketSort, 'overall'>, string> = {
  name: 'first_name',
  age: 'age',
  country: 'country_name',
  archetype: 'inferred_archetype',
  // Sorting by potential uses the star bucket (the raw number is not
  // selectable by players at all); ties keep the id order below.
  potential: 'potential_stars',
};

/**
 * Server-side paginated + filtered + sorted market read. This is the only
 * function that ever turns a `tier` request into a Supabase query — a
 * request for 'premium' is re-verified against isPremiumEntitled() right
 * here, every call, never trusted from the caller's own tab state. Even if
 * that check were ever removed, the market_riders_select_available RLS
 * policy independently returns zero premium rows to a non-entitled user —
 * two layers, same pattern as the admin tooling.
 *
 * Premium-only filters (search/country/archetype/age/potentialStars/sort)
 * are silently dropped for a 'free' query rather than erroring — the Free
 * tab's own UI never sends them, but a hand-crafted request that tried to
 * smuggle filters into a 'free' query would just get the plain paginated
 * list, never an error that hints at what filtering would have done.
 */
// The market is permanent across seasons (owner decision 2026-11-19): every 'available' rider is listed whatever season_id he was
// generated in. season_id stays on the row as history only.
export async function getMarketPage(query: MarketQuery): Promise<MarketPageResult> {
  const supabase = await createClient();

  let tier: MarketTier = 'free';
  if (query.tier === 'premium') {
    if (!(await isPremiumEntitled())) {
      // Not entitled: behave exactly as if 'free' had been requested.
      tier = 'free';
    } else {
      tier = 'premium';
    }
  }

  const isPremiumQuery = tier === 'premium';

  // One filtered query, rebuilt for every read (a Supabase builder is single-use).
  const buildQuery = () => {
    let b = supabase
      .from('market_riders')
      .select(MARKET_PUBLIC_COLUMNS, { count: 'exact' })
      .eq('tier', tier)
      .eq('status', 'available');

    if (isPremiumQuery) {
      if (query.search?.trim()) {
        const term = query.search.trim().replace(/[%,]/g, '');
        b = b.or(`first_name.ilike.%${term}%,surname.ilike.%${term}%`);
      }
      if (query.country) b = b.eq('country_name', query.country);
      if (query.archetype) b = b.eq('inferred_archetype', query.archetype);
      if (query.ageMin != null) b = b.gte('age', query.ageMin);
      if (query.ageMax != null) b = b.lte('age', query.ageMax);
      if (query.potentialStars) b = b.eq('potential_stars', query.potentialStars);
    }
    return b;
  };

  const page = Math.max(1, query.page);
  const from = (page - 1) * MARKET_PAGE_SIZE;
  const to = from + MARKET_PAGE_SIZE - 1;

  // Default order (free tab always; Premium unless another sort is picked): OVR F4 descending over the WHOLE market, equal OVR mixed
  // by a stable id-derived key. OVR is computed from the public attributes, so it cannot be ordered by the database directly - the
  // whole (filtered) list is read, sorted here and only then cut into pages. PostgREST returns at most 1000 rows per request, so the
  // read is chunked (ordered by id so the chunks never overlap or skip). The market is a few hundred riders at most.
  if (!isPremiumQuery || !query.sort || query.sort === 'overall') {
    const CHUNK = 1000;
    const all: MarketRiderView[] = [];
    for (let offset = 0; ; offset += CHUNK) {
      const { data, error } = await buildQuery().order('id', { ascending: true }).range(offset, offset + CHUNK - 1);
      if (error || !data) return { riders: [], total: 0, page, pageSize: MARKET_PAGE_SIZE };
      all.push(...data.map(toView));
      if (data.length < CHUNK) break;
    }
    const sorted = sortByOverall(all);
    return { riders: sorted.slice(from, to + 1), total: sorted.length, page, pageSize: MARKET_PAGE_SIZE };
  }

  const sortColumn = SORT_COLUMN[query.sort];
  const { data, count, error } = await buildQuery()
    .order(sortColumn, { ascending: true })
    .order('id', { ascending: true })
    .range(from, to);
  if (error || !data) return { riders: [], total: 0, page, pageSize: MARKET_PAGE_SIZE };

  return { riders: data.map(toView), total: count ?? 0, page, pageSize: MARKET_PAGE_SIZE };
}

/**
 * One market rider's safe detail view. Includes the real Performance/
 * Tactics/Technique attribute numbers (a player already sees these on their
 * own rider, and evaluating a market rider "by attribute detail" is an
 * explicit requirement) but never potential/trainability/professionalism/
 * recovery raw numbers, generator metadata, or acquisition fields. Relies
 * on the same RLS policy as getMarketPage(), so a direct request for a
 * premium rider's id by a non-entitled player returns null (RLS hides the
 * row), not an error that would confirm the id exists.
 */
export async function getMarketRiderDetail(id: string): Promise<MarketRiderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('market_riders')
    .select(MARKET_PUBLIC_COLUMNS)
    .eq('id', id)
    .eq('status', 'available')
    .maybeSingle();

  if (error || !data) return null;
  return { ...toView(data), attributes: data.attributes as Record<SkillAttribute, number> };
}
