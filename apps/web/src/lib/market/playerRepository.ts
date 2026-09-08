import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { potentialToStars, type SegmentLevel } from '@/lib/rider/development';
import { POTENTIAL_MIN, POTENTIAL_MAX, type SkillAttribute } from '@/lib/rider/config';
import { riderOverall, performanceScore } from '@/lib/rider/score';
import { isPremiumEntitled } from '@/lib/premium/entitlement';
import type { MarketTier } from './repository';

export const MARKET_PAGE_SIZE = 20;

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
  riderOverall: number;
  performanceScore: number;
}

export interface MarketRiderDetail extends MarketRiderView {
  attributes: Record<SkillAttribute, number>;
}

export type MarketSort = 'name' | 'age' | 'country' | 'archetype' | 'potential';

export interface MarketQuery {
  seasonId: string;
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
  // `attributes` is fetched from the DB row (getMarketPage selects '*') to
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
    potentialStars: potentialToStars(row.potential as number, POTENTIAL_MIN, POTENTIAL_MAX),
    riderOverall: riderOverall(attributes),
    performanceScore: performanceScore(attributes),
  };
}

const SORT_COLUMN: Record<MarketSort, string> = {
  name: 'first_name',
  age: 'age',
  country: 'country_name',
  archetype: 'inferred_archetype',
  // Sorting by potential is allowed server-side (the DB compares the real
  // number) even though the value returned to the browser is only the star
  // bucket — the client never sees the number used to order the rows.
  potential: 'potential',
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

  let builder = supabase
    .from('market_riders')
    .select('*', { count: 'exact' })
    .eq('season_id', query.seasonId)
    .eq('tier', tier)
    .eq('status', 'available');

  if (isPremiumQuery) {
    if (query.search?.trim()) {
      const term = query.search.trim().replace(/[%,]/g, '');
      builder = builder.or(`first_name.ilike.%${term}%,surname.ilike.%${term}%`);
    }
    if (query.country) builder = builder.eq('country_name', query.country);
    if (query.archetype) builder = builder.eq('inferred_archetype', query.archetype);
    if (query.ageMin != null) builder = builder.gte('age', query.ageMin);
    if (query.ageMax != null) builder = builder.lte('age', query.ageMax);
    if (query.potentialStars) {
      const { min, max } = starsToRawRange(query.potentialStars);
      builder = builder.gte('potential', min).lte('potential', max);
    }
  }

  const sortColumn = SORT_COLUMN[(isPremiumQuery && query.sort) || 'name'];
  builder = builder.order(sortColumn, { ascending: true }).order('id', { ascending: true });

  const page = Math.max(1, query.page);
  const from = (page - 1) * MARKET_PAGE_SIZE;
  const to = from + MARKET_PAGE_SIZE - 1;
  builder = builder.range(from, to);

  const { data, count, error } = await builder;
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
    .select('id, tier, first_name, surname, country_name, country_iso2, age, inferred_archetype, potential, attributes')
    .eq('id', id)
    .eq('status', 'available')
    .maybeSingle();

  if (error || !data) return null;
  return { ...toView(data), attributes: data.attributes as Record<SkillAttribute, number> };
}

/** Inverse of scoreToLevel's percentage banding, for the Premium potential-category filter. */
function starsToRawRange(stars: SegmentLevel): { min: number; max: number } {
  const span = POTENTIAL_MAX - POTENTIAL_MIN;
  const min = POTENTIAL_MIN + ((stars - 1) / 5) * span;
  const max = stars === 5 ? POTENTIAL_MAX : POTENTIAL_MIN + (stars / 5) * span;
  return { min: Math.round(min), max: Math.round(max) };
}
