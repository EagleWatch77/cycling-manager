import { LEAGUES, type LeagueId } from '../leagues';
import { getCurrentSeasonInfo } from '../calendar/season';

/**
 * Leagues & sub-leagues V1 — pure rules (no I/O), mirrored 1:1 by the SQL in
 * supabase/migrations/20261114_league_divisions.sql (allocate_league_division
 * / assign_my_league_division). The database is the authority (it enforces
 * capacity and Elite's single sub-league atomically); this module is the
 * single place the TypeScript side formats labels and the unit tests pin the
 * allocation rule.
 *
 * Sub-leagues are labelled "<League> 1.<number>". The number says nothing
 * about strength; sub-leagues of one league are equal.
 */

/** Max players in one sub-league. Same value as league_divisions.capacity default. */
export const DIVISION_CAPACITY = 50;

/** The fixed "1" in "Rookie 1.1". */
const DIVISION_PREFIX = 1;

/** "1.2" — the league name itself comes from i18n (`league.<id>`). */
export function divisionCode(number: number): string {
  return `${DIVISION_PREFIX}.${number}`;
}

/** Elite never gets more than one sub-league (Elite 1.1). */
export function maxDivisionsFor(league: LeagueId): number {
  return league === 'elite' ? 1 : Number.POSITIVE_INFINITY;
}

export function isLeagueId(value: string): value is LeagueId {
  return (LEAGUES as readonly string[]).includes(value);
}

export interface DivisionSlot {
  number: number;
  memberCount: number;
  capacity: number;
}

export type AssignmentPlan =
  | { kind: 'existing'; number: number }
  | { kind: 'create'; number: number }
  | { kind: 'full' };

/**
 * Where a player joining `league` goes: the lowest-numbered sub-league that
 * still has a free spot; otherwise a new one (next number after the highest);
 * never a second Elite sub-league ('full'). Sub-leagues are never created in
 * advance — 'create' only happens when every existing one is full.
 */
export function planDivisionAssignment(league: LeagueId, divisions: readonly DivisionSlot[]): AssignmentPlan {
  const free = [...divisions]
    .sort((a, b) => a.number - b.number)
    .find((d) => d.memberCount < d.capacity);
  if (free) return { kind: 'existing', number: free.number };

  if (divisions.length >= maxDivisionsFor(league)) return { kind: 'full' };

  const next = divisions.reduce((max, d) => Math.max(max, d.number), 0) + 1;
  return { kind: 'create', number: next };
}

/**
 * The season a NEW player joins: always the current GLOBAL season computed
 * from server time (lib/calendar/season.ts) — never a personal "Season 1".
 */
export function seasonIdForNewMember(now: Date = new Date()): string {
  return getCurrentSeasonInfo(now).seasonId;
}
