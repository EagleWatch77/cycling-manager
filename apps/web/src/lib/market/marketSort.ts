/**
 * Default Market order (owner decision 2026-11-19): overall rating OVR F4 descending (best on top), riders with the SAME OVR mixed.
 * The "mix" is a fixed pseudo-random key derived only from the rider's id (FNV-1a), so it is:
 *   - stable: the same rider always lands in the same place, on every refresh and on every page (no jumping, no repeats);
 *   - not alphabetical and not by country (the id is a random UUID, unrelated to name or country);
 *   - independent of the order the database returns the rows in.
 * Pure functions, no imports from the server or the database - unit-tested in marketSort.test.ts.
 */
export interface OvrSortable {
  id: string;
  overallRating: number;
}

/** FNV-1a 32-bit hash of the id: deterministic, uniform enough to mix riders with equal OVR. */
export function shuffleKey(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** OVR descending; ties by the stable id-derived shuffle key; final tie (hash collision) by id so the order is always total. */
export function compareByOverall(a: OvrSortable, b: OvrSortable): number {
  if (b.overallRating !== a.overallRating) return b.overallRating - a.overallRating;
  const ka = shuffleKey(a.id);
  const kb = shuffleKey(b.id);
  if (ka !== kb) return ka - kb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortByOverall<T extends OvrSortable>(riders: readonly T[]): T[] {
  return [...riders].sort(compareByOverall);
}
