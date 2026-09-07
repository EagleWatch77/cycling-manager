import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { generateStarterRider } from '@/lib/rider/generate';
import type { SkillAttribute } from '@/lib/rider/config';
import { MARKET_FREE_POOL_SIZE, MARKET_PREMIUM_POOL_SIZE } from './config';

export type MarketTier = 'free' | 'premium';
export type MarketRiderStatus = 'available' | 'acquired';
/** Which trigger created a batch — the same generateMarketPool() serves both; see that file. */
export type MarketGenerationSource = 'admin' | 'week6';

export interface MarketRiderRow {
  id: string;
  seasonId: string;
  tier: MarketTier;
  status: MarketRiderStatus;
  firstName: string;
  surname: string;
  countryName: string;
  countryIso2: string;
  age: number;
  attributes: Record<SkillAttribute, number>;
  inferredArchetype: string;
  potential: number;
  trainability: number;
  professionalism: number;
  recovery: number;
  generatorVersion: string;
  source: MarketGenerationSource;
  generatedAt: string;
}

function fromRow(row: Record<string, unknown>): MarketRiderRow {
  return {
    id: row.id as string,
    seasonId: row.season_id as string,
    tier: row.tier as MarketTier,
    status: row.status as MarketRiderStatus,
    firstName: row.first_name as string,
    surname: row.surname as string,
    countryName: row.country_name as string,
    countryIso2: row.country_iso2 as string,
    age: row.age as number,
    attributes: row.attributes as MarketRiderRow['attributes'],
    inferredArchetype: row.inferred_archetype as string,
    potential: row.potential as number,
    trainability: row.trainability as number,
    professionalism: row.professionalism as number,
    recovery: row.recovery as number,
    generatorVersion: row.generator_version as string,
    source: row.source as MarketGenerationSource,
    generatedAt: row.generated_at as string,
  };
}

export interface MarketPoolSummary {
  seasonId: string;
  active: boolean;
  freeCount: number;
  premiumCount: number;
  acquiredCount: number;
  generatedAt: string | null;
  source: MarketGenerationSource | null;
}

/** Status the admin panel (and later the real market page) reads — never generates anything itself. */
export async function getMarketPoolSummary(seasonId: string): Promise<MarketPoolSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('market_riders')
    .select('tier, status, generated_at, source')
    .eq('season_id', seasonId);

  if (error || !data || data.length === 0) {
    return { seasonId, active: false, freeCount: 0, premiumCount: 0, acquiredCount: 0, generatedAt: null, source: null };
  }

  const available = data.filter((r) => r.status === 'available');
  const freeCount = available.filter((r) => r.tier === 'free').length;
  const premiumCount = available.filter((r) => r.tier === 'premium').length;
  const acquiredCount = data.filter((r) => r.status === 'acquired').length;
  const generatedAt = available.length > 0
    ? available.reduce((latest, r) => (r.generated_at > latest ? r.generated_at : latest), available[0].generated_at as string)
    : null;
  const source = (available[0]?.source as MarketGenerationSource | undefined) ?? null;

  return { seasonId, active: available.length > 0, freeCount, premiumCount, acquiredCount, generatedAt, source };
}

export type GenerateMarketPoolResult =
  | { ok: true; freeCreated: number; premiumCreated: number }
  | { ok: false; reason: 'already-active' | 'error' };

/**
 * The one and only market-pool generation path — reuses the exact starter
 * rider generator (same shape-based attribute distribution as a player's own
 * starter rider; no separate "market quality" formula invented for V1, see
 * the chat report). Designed to be called from two places without ever
 * duplicating this logic:
 *   A) the admin "Vygenerovať market pool teraz" action (source: 'admin')
 *   B) a future Week 6 season-tick job (source: 'week6') — that job does not
 *      exist yet (no season-tick system exists at all, per the prior
 *      architecture audit); when it's built, it should call this function
 *      directly rather than reimplementing pool creation.
 *
 * Idempotent on the "available" pool, not on the table as a whole: a season
 * with only acquired/history rows (e.g. right after a reset) is treated as
 * having no active pool, so generation can run again. A season that still
 * has any available rider blocks a second batch outright — the caller must
 * reset first (see resetAvailableMarketPool below).
 */
export async function generateMarketPool(input: {
  seasonId: string;
  source: MarketGenerationSource;
}): Promise<GenerateMarketPoolResult> {
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from('market_riders')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', input.seasonId)
    .eq('status', 'available');
  if (countError) return { ok: false, reason: 'error' };
  if ((count ?? 0) > 0) return { ok: false, reason: 'already-active' };

  const buildRow = (tier: MarketTier) => {
    const rider = generateStarterRider(Math.random);
    return {
      season_id: input.seasonId,
      tier,
      status: 'available' as const,
      first_name: rider.firstName,
      surname: rider.surname,
      country_name: rider.countryName,
      country_iso2: rider.countryIso2,
      age: rider.age,
      attributes: rider.attributes,
      condition: rider.condition,
      inferred_archetype: rider.inferredArchetype,
      potential: rider.potential,
      trainability: rider.trainability,
      professionalism: rider.professionalism,
      recovery: rider.recovery,
      generator_version: rider.generatorVersion,
      source: input.source,
    };
  };

  const rows = [
    ...Array.from({ length: MARKET_FREE_POOL_SIZE }, () => buildRow('free')),
    ...Array.from({ length: MARKET_PREMIUM_POOL_SIZE }, () => buildRow('premium')),
  ];

  const { error } = await supabase.from('market_riders').insert(rows);
  if (error) return { ok: false, reason: 'error' };
  return { ok: true, freeCreated: MARKET_FREE_POOL_SIZE, premiumCreated: MARKET_PREMIUM_POOL_SIZE };
}

/**
 * Deletes only 'available' rows for a season — the destructive-but-safe
 * "Resetovať testovací market" action. Rows with status 'acquired' are
 * excluded by the filter itself (not by an application-level check), so a
 * rider a player has signed can never be removed by this function no matter
 * how it's called — the same guarantee the admin-only RLS policy backs up
 * at the DB level.
 */
export async function resetAvailableMarketPool(seasonId: string): Promise<{ ok: boolean; deleted: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('market_riders')
    .delete()
    .eq('season_id', seasonId)
    .eq('status', 'available')
    .select('id');

  if (error) return { ok: false, deleted: 0 };
  return { ok: true, deleted: data?.length ?? 0 };
}

/** Admin-only raw list (all tiers/statuses) — for the admin Market Tools panel. */
export async function getAdminMarketRiders(seasonId: string): Promise<MarketRiderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('market_riders')
    .select('*')
    .eq('season_id', seasonId)
    .order('generated_at', { ascending: false });

  if (error || !data) return [];
  return data.map(fromRow);
}
