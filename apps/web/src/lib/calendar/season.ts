/**
 * Real-time game calendar — Season/Week V1.
 *
 * The season boundary is anchored to one real config date (SEASON_ONE_START);
 * everything else (which season we are in, which week, its date range) is
 * derived purely from the current server date, never from client-local or
 * hardcoded mock data. No automatic season generator: season numbers beyond
 * season 1 are computed on the fly by the same 10-week arithmetic, but no
 * per-season data is created or persisted anywhere.
 */

export const TOTAL_WEEKS = 10;
export const WEEK_LENGTH_DAYS = 7;
export const SEASON_LENGTH_DAYS = TOTAL_WEEKS * WEEK_LENGTH_DAYS;

/** The Monday Season 1 began. Config, not logic — change this to re-anchor the whole calendar. */
export const SEASON_ONE_START = '2026-08-17';

const MS_PER_DAY = 86_400_000;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface SeasonInfo {
  seasonId: string;
  seasonNumber: number;
  seasonStart: Date;
  seasonEnd: Date;
  totalWeeks: number;
  /** 1..totalWeeks */
  currentWeek: number;
  /** The real "now" this info was computed from. */
  now: Date;
}

/**
 * Deterministic, server-safe: a pure function of `now`. Pass the real server
 * date (default `new Date()`, evaluated on the server) — never a client value.
 * Before SEASON_ONE_START it reports Season 1, Week 1 (pre-season default)
 * rather than a negative season/week.
 */
export function getCurrentSeasonInfo(now: Date = new Date()): SeasonInfo {
  const anchor = startOfUtcDay(new Date(`${SEASON_ONE_START}T00:00:00Z`));
  const today = startOfUtcDay(now);

  const daysSinceStart = Math.round((today.getTime() - anchor.getTime()) / MS_PER_DAY);
  const seasonIndex = Math.max(0, Math.floor(daysSinceStart / SEASON_LENGTH_DAYS));
  const seasonNumber = seasonIndex + 1;

  const seasonStart = new Date(anchor.getTime() + seasonIndex * SEASON_LENGTH_DAYS * MS_PER_DAY);
  const seasonEnd = new Date(seasonStart.getTime() + (SEASON_LENGTH_DAYS - 1) * MS_PER_DAY);

  const daysIntoSeason = Math.round((today.getTime() - seasonStart.getTime()) / MS_PER_DAY);
  const currentWeek = Math.min(TOTAL_WEEKS, Math.max(1, Math.floor(daysIntoSeason / WEEK_LENGTH_DAYS) + 1));

  return {
    seasonId: `season-${seasonNumber}`,
    seasonNumber,
    seasonStart,
    seasonEnd,
    totalWeeks: TOTAL_WEEKS,
    currentWeek,
    now,
  };
}

/** The real calendar date range [start, end] a given week of a season covers. */
export function getWeekDateRange(info: SeasonInfo, weekNumber: number): { start: Date; end: Date } {
  const start = new Date(info.seasonStart.getTime() + (weekNumber - 1) * WEEK_LENGTH_DAYS * MS_PER_DAY);
  const end = new Date(start.getTime() + (WEEK_LENGTH_DAYS - 1) * MS_PER_DAY);
  return { start, end };
}

/**
 * Season Aging V1 — the same anchor arithmetic getCurrentSeasonInfo() uses,
 * but parameterized by an arbitrary 1-indexed season NUMBER instead of the
 * real clock, so a PAST (already-elapsed) season's exact end date can be
 * computed for the season-transition aging job (lib/calendar/seasonAging.ts)
 * without re-deriving it from "now". Not a parallel season model — same
 * constants, same math, just not bound to `new Date()`.
 */
export function getSeasonBounds(seasonNumber: number): { seasonId: string; seasonStart: Date; seasonEnd: Date } {
  const anchor = startOfUtcDay(new Date(`${SEASON_ONE_START}T00:00:00Z`));
  const seasonIndex = seasonNumber - 1;
  const seasonStart = new Date(anchor.getTime() + seasonIndex * SEASON_LENGTH_DAYS * MS_PER_DAY);
  const seasonEnd = new Date(seasonStart.getTime() + (SEASON_LENGTH_DAYS - 1) * MS_PER_DAY);
  return { seasonId: `season-${seasonNumber}`, seasonStart, seasonEnd };
}

/**
 * Every FULLY ELAPSED season number that still needs its end-of-season
 * aging applied — i.e. everything strictly between the highest season
 * already processed and the current (still in-progress) season, in order.
 * Pure — no I/O — so the "catch up N skipped seasons" logic is directly
 * unit-testable without a database (see season.test.ts). The current
 * season itself is never included: it hasn't ended yet.
 */
export function seasonsNeedingProcessing(lastProcessedSeasonNumber: number, currentSeasonNumber: number): number[] {
  const result: number[] = [];
  for (let n = lastProcessedSeasonNumber + 1; n <= currentSeasonNumber - 1; n++) result.push(n);
  return result;
}
