import { POTENTIAL_STAR_STARTS } from './config';
/**
 * Development-attribute visual mapping — Potenciál / Trénovateľnosť /
 * Profesionalita / Regenerácia / Skúsenosti are deliberately never shown as
 * exact numbers in the UI (see Rozvoj card on /training and /rider): the
 * player gets an orientational visual read, not the precise internal score.
 *
 * Centralized here — one place to retune the banding — rather than inline
 * in the components that render it.
 */

export type SegmentLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Maps a raw score within [min, max] onto 1-5 visual segments/stars.
 * Percentage-based (not fixed absolute bands) so it stays correct across
 * fields with different real scales (e.g. trainability's 55-95 vs
 * experience's 100-160) without extra parameters per field.
 */
export function scoreToLevel(value: number, min: number, max: number): SegmentLevel {
  const pct = (value - min) / (max - min);
  const level = Math.ceil(pct * 5);
  return Math.max(1, Math.min(5, level)) as SegmentLevel;
}

/**
 * Potential's star rating — follows the approved Potential bands (config.ts POTENTIAL_BANDS), NOT a linear split of a range:
 * 1-39 =1, 40-59 =2, 60-74 =3, 75-87 =4, 88-100 =5. Mirrored by public.potential_to_stars() in SQL (one source of truth in two places,
 * kept equal by the parity test). Kept separate from scoreToLevel so a later pass can feed it a scouting-fuzzed value.
 */
export function potentialStarsOf(value: number): SegmentLevel {
  const stars = 1 + POTENTIAL_STAR_STARTS.filter((start) => value >= start).length;
  return stars as SegmentLevel;
}
