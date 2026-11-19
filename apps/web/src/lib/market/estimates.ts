import { scoreToLevel, type SegmentLevel } from '@/lib/rider/development';
import { DISPLAY_SCALE } from '@/lib/rider/config';

/**
 * Coarse 1-5 read-outs of a MARKET rider's development values (Rozvoj in the market detail). Pure, no I/O, no server-only import (unit-tested).
 *
 * What a player may see about a free rider: a level 1..5 per value, never a number, never an interval. The hidden values (Potential, Trainability,
 * Professionalism, Recovery, Vitality) are read INSIDE the database by public.market_rider_estimates() (migration 20261119_06, prepared, not run)
 * which returns only the levels; this file never sees a hidden number. Experience is a public attribute, so the app buckets it itself.
 *
 * Bands (WORKING, owner decision O-029): Potential = the approved bands (potential_to_stars). Trainability/Professionalism/Recovery/Vitality = equal
 * fifths of the 1-100 hidden scale. Experience = equal fifths of the 1-200 attribute scale (existing scoreToLevel with DISPLAY_SCALE).
 */
export interface MarketEstimateLevels {
  potential: SegmentLevel | null;
  trainability: SegmentLevel | null;
  professionalism: SegmentLevel | null;
  recovery: SegmentLevel | null;
  vitality: SegmentLevel | null;
  experience: SegmentLevel;
}

export const MARKET_ESTIMATE_KEYS = ['potential', 'trainability', 'professionalism', 'recovery', 'vitality', 'experience'] as const;
export type MarketEstimateKey = (typeof MARKET_ESTIMATE_KEYS)[number];

/** TypeScript twin of public.market_score_to_level(): equal fifths of 1..100 (1-20 = 1 ... 81-100 = 5). */
export function marketScoreToLevel(value: number): SegmentLevel {
  return Math.max(1, Math.min(5, Math.ceil(value / 20))) as SegmentLevel;
}

/** Experience is a public 1-200 attribute: bucketed here, never shown as a number in the market detail or radar. */
export function experienceLevelOf(value: number): SegmentLevel {
  return scoreToLevel(value, DISPLAY_SCALE.min, DISPLAY_SCALE.max);
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
    experience: experienceLevelOf(experience),
  };
}
