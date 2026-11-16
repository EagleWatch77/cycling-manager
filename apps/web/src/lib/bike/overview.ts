/**
 * Pure helpers for the Home "Môj bicykel" window (C-061). Display only: the
 * database keeps CONDITION (100 = new) in bike_condition and nothing here
 * writes or changes it.
 */
export type StateBand = 'good' | 'low' | 'critical';

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** State of a component for the dashboard = 100 - wear. The stored condition already is that number. */
export function stateFromWear(wear: number): number {
  return clamp(100 - wear);
}
export function stateFromCondition(condition: number): number {
  return clamp(condition);
}

/** Working bands: 41-100 green, 11-40 orange, 0-10 red. */
export function stateBand(state: number): StateBand {
  const s = clamp(state);
  if (s > 40) return 'good';
  if (s > 10) return 'low';
  return 'critical';
}

/** Overall bike level = arithmetic mean of the five component levels (informative only; never lowered by wear or service). */
export function overallBikeLevel(levels: readonly number[]): number {
  if (levels.length === 0) return 0;
  return levels.reduce((a, b) => a + b, 0) / levels.length;
}

/** At most one decimal; whole numbers without ".0". `sep` is the locale's decimal separator. */
export function formatBikeLevel(avg: number, sep = ','): string {
  const r = Math.round(avg * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r).replace('.', sep);
}
