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
 * Potential's star rating. Kept as its own function — separate from
 * scoreToLevel — because potential is explicitly meant to read as an
 * imprecise, scouting-style estimate: a later pass could feed this a
 * fuzzed/uncertainty-adjusted value instead of the true score without
 * touching every other development attribute's mapping.
 */
export function potentialToStars(value: number, min: number, max: number): SegmentLevel {
  return scoreToLevel(value, min, max);
}
