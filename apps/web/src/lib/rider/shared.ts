import namesData from './data/names.json';

/**
 * RNG helpers and name/country data shared by every rider generator
 * (Starter Rider V1 and AI Rookie V1). Kept separate so generators stay pure
 * and don't duplicate this logic.
 */

export type Rng = () => number; // returns [0, 1)

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const round = (v: number) => Math.round(v);

/** Uniform integer in [lo, hi]. */
export function intBetween(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Symmetric noise in [-amp, +amp], triangular so extremes are rarer. */
export function noise(rng: Rng, amp: number): number {
  return (rng() + rng() - 1) * amp;
}

export function pickWeighted<T>(rng: Rng, items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, it) => s + weight(it), 0);
  let r = rng() * total;
  for (const it of items) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export const COUNTRIES = namesData.countries as { name: string; iso2: string; weight: number }[];
export const FIRST = namesData.firstNames as Record<string, string[]>;
export const SUR = namesData.surnames as Record<string, string[]>;
