/**
 * Exact number of market rows the admin reset can really delete. Mirrors the filter of resetAvailableMarketPool() in repository.ts:
 * season_id = X, status = 'available' and acquired_rider_id IS NULL. A rider who returned to the market (acquired_rider_id set, carries a career)
 * is NOT counted and is never deleted; neither are reserved/acquired rows or rows of other seasons.
 */
export interface MarketRowLike { season_id?: unknown; status?: unknown; acquired_rider_id?: unknown }

export function countResettable(rows: readonly MarketRowLike[], seasonId: string): number {
  return rows.filter((r) => r.season_id === seasonId && r.status === 'available' && (r.acquired_rider_id === null || r.acquired_rider_id === undefined)).length;
}
