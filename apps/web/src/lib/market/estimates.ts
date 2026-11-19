import type { SegmentLevel } from '@/lib/rider/development';

/**
 * Coarse 1-5 read-outs of a MARKET rider's hidden development values (Rozvoj in the market detail). Pure, no I/O, no server-only import (unit-tested).
 *
 * What a player may see about a free rider: a level 1..5 per hidden value, never a number, never an interval. Rules (owner, option A, 2026-11-19):
 *   - Potential: the approved bands (public star column), no noise.
 *   - Trainability / Professionalism / Recovery / Vitality: a stable noise of +-10 points on the true 1-100 value, then equal fifths. The noise and the
 *     secret salt exist ONLY inside the database (public.market_rider_estimates(), migration 20261119_06, prepared, not run); this file never sees a hidden
 *     number nor the salt, it only receives the five levels.
 *   - Experience is a public attribute: shown as the exact number (no estimate).
 */
export interface MarketEstimateLevels {
  potential: SegmentLevel | null;
  trainability: SegmentLevel | null;
  professionalism: SegmentLevel | null;
  recovery: SegmentLevel | null;
  vitality: SegmentLevel | null;
  /** Public attribute, shown exactly. */
  experience: number;
}

/** The five hidden values shown as rough 1-5 dashes, in display order (Skúsenosti follows as an exact number). */
export const MARKET_ESTIMATE_KEYS = ['potential', 'trainability', 'professionalism', 'recovery', 'vitality'] as const;
export type MarketEstimateKey = (typeof MARKET_ESTIMATE_KEYS)[number];

/** TypeScript twin of public.market_score_to_level(): equal fifths of 1..100 (1-20 = 1 ... 81-100 = 5). The +-10 noise is applied in the database only. */
export function marketScoreToLevel(value: number): SegmentLevel {
  return Math.max(1, Math.min(5, Math.ceil(value / 20))) as SegmentLevel;
}

/** A database level only counts when it is a whole number 1..5; anything else (missing, null, garbage) is "no estimate", never a guess. */
export function asLevel(v: unknown): SegmentLevel | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? (v as SegmentLevel) : null;
}

/** Maps one row of market_rider_estimates() (or null when the function/row is unavailable) + the public Experience onto the levels. */
export function toMarketEstimateLevels(row: Record<string, unknown> | null | undefined, experience: number, publicPotentialStars: SegmentLevel): MarketEstimateLevels {
  return {
    // potential_stars is a public column with the same approved bands, so it is the fallback when the function is not installed yet
    potential: asLevel(row?.potential_stars) ?? publicPotentialStars,
    trainability: asLevel(row?.trainability_level),
    professionalism: asLevel(row?.professionalism_level),
    recovery: asLevel(row?.recovery_level),
    vitality: asLevel(row?.vitality_level),
    experience,
  };
}
