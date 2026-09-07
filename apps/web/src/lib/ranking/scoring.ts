/**
 * Centralized race → ranking-points formula V1.
 *
 * No scoring model existed anywhere in the project before this (see the
 * chat report's architecture audit: packages/race-engine only produces
 * finish times, never points). This table is an invented, UCI-lite
 * "points by finishing position" scale — 1st through 20th score something,
 * everything below scores 0. It intentionally lives here, not inline in a
 * React component or repository query, so that whenever a real
 * race-processing job is built (nothing currently calls
 * simulateStage() from the web app — see the report), it computes points
 * by calling pointsForPosition() instead of reinventing a formula.
 *
 * Points are written once into race_results.points at result-recording
 * time (see supabase/schema.sql), not recomputed at read time — so this
 * table can change later without rewriting history.
 */
const POSITION_POINTS: readonly number[] = [
  100, 80, 60, 50, 40, 32, 24, 20, 16, 14,
  12, 10, 9, 8, 7, 6, 5, 4, 3, 2,
];

export function pointsForPosition(position: number): number {
  if (position < 1) return 0;
  return POSITION_POINTS[position - 1] ?? 0;
}
