import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { SkillAttribute } from '@/lib/rider/config';
import { countResettable } from './resetCount';

export type MarketTier = 'free' | 'premium';
export type MarketRiderStatus = 'available' | 'reserved' | 'acquired';
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
  /** EXACTLY what the reset can delete in `seasonId`: available, never owned (acquired_rider_id null). Returned riders with a history are not counted. */
  resettableInSeason: number;
  generatedAt: string | null;
  source: MarketGenerationSource | null;
}

/** Status the admin panel (and later the real market page) reads — never generates anything itself. */
export async function getMarketPoolSummary(seasonId: string): Promise<MarketPoolSummary> {
  const supabase = await createClient();
  // Hidden/admin columns are not selectable by a session since 20261119_02 — the admin reads through the checked function.
  // The market is permanent across seasons: the summary covers ALL seasons (season_id is history only).
  const { data: raw, error } = await supabase.rpc('admin_market_riders', { p_season_id: null });
  const data = (raw ?? []) as Record<string, unknown>[];

  if (error || data.length === 0) {
    return { seasonId, active: false, freeCount: 0, premiumCount: 0, acquiredCount: 0, resettableInSeason: 0, generatedAt: null, source: null };
  }

  const available = data.filter((r) => r.status === 'available');
  const freeCount = available.filter((r) => r.tier === 'free').length;
  const premiumCount = available.filter((r) => r.tier === 'premium').length;
  const acquiredCount = data.filter((r) => r.status === 'acquired').length;
  const resettableInSeason = countResettable(data, seasonId);
  const generatedAt = available.length > 0
    ? available.reduce((latest, r) => ((r.generated_at as string) > latest ? (r.generated_at as string) : latest), available[0].generated_at as string)
    : null;
  const source = (available[0]?.source as MarketGenerationSource | undefined) ?? null;

  return { seasonId, active: available.length > 0, freeCount, premiumCount, acquiredCount, resettableInSeason, generatedAt, source };
}

export type GenerateMarketPoolResult =
  | { ok: true; freeCreated: number; premiumCreated: number }
  | { ok: false; reason: 'already-active' | 'error' | 'generator-disabled' };

/**
 * DISABLED (owner decision 2026-11-19). The old admin generator built riders with generateStarterRider() (about OVR 130), which no longer fits the
 * approved market start (OVR 69–75, ages 17–20, Potential bands). To make an accidental click or a future job harmless, this function does NOTHING:
 * it reads nothing, writes nothing and always returns 'generator-disabled'. A new generator (and any automatic week-6 generation) needs its own
 * approval; the 100 launch riders come from supabase/seeds/20261119_launch_market_100.sql (run by the owner by hand).
 */
export async function generateMarketPool(_input: {
  seasonId: string;
  source: MarketGenerationSource;
}): Promise<GenerateMarketPoolResult> {
  return { ok: false, reason: 'generator-disabled' };
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
    .is('acquired_rider_id', null)
    .select('id');

  if (error) return { ok: false, deleted: 0 };
  return { ok: true, deleted: data?.length ?? 0 };
}

/** Admin-only raw list (all tiers/statuses, all seasons unless one is given) — for the admin Market Tools panel. */
export async function getAdminMarketRiders(seasonId?: string): Promise<MarketRiderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_market_riders', { p_season_id: seasonId ?? null }); // no season = the whole market

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(fromRow);
}
