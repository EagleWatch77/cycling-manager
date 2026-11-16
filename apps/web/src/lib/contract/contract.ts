import { SEASON_ONE_START, TOTAL_WEEKS, WEEK_LENGTH_DAYS } from '@/lib/calendar/season';

/**
 * Rider contracts V1 — pure rules (no I/O), mirrored 1:1 by the SQL in
 * supabase/migrations/20261116_01_rider_contracts.sql (game_week_index,
 * contract_expiry_at, start_rider_contract_internal, my_rider_contract).
 * The DATABASE is the authority (server clock, atomic creation); this module
 * pins the rule for the unit tests and is the single place the TypeScript
 * side knows it. Never feed it a browser clock for a decision.
 *
 * Rules (owner, 2026-11-16): a contract lasts 10 game weeks, the purchase
 * week counts as week 1, it ends at the end of the 10th counted week and a
 * season change does NOT end it. Running out of time only makes it "expired";
 * nothing happens automatically (salary, renewal, leaving: later).
 */
export const CONTRACT_WEEKS = 10;

/** Young market riders (owner, 2026-11-16): enter at 17, may stay while 17..20. */
export const MARKET_ENTRY_AGE = 17;
export const MARKET_MAX_AGE = 20;

const MS_PER_DAY = 86_400_000;
const ANCHOR_MS = Date.parse(`${SEASON_ONE_START}T00:00:00Z`);

function utcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Global game-week index (0 = week 1 of season 1). Before the anchor: 0. */
export function gameWeekIndex(at: Date): number {
  const days = Math.round((utcDayMs(at) - ANCHOR_MS) / MS_PER_DAY);
  return Math.floor(Math.max(0, days) / WEEK_LENGTH_DAYS);
}

export interface SeasonWeek { seasonNumber: number; week: number }

export function seasonWeekOfIndex(index: number): SeasonWeek {
  return { seasonNumber: Math.floor(index / TOTAL_WEEKS) + 1, week: (index % TOTAL_WEEKS) + 1 };
}

export interface ContractSpan {
  start: SeasonWeek;
  end: SeasonWeek;
  durationWeeks: number;
  /** Monday 00:00 UTC right after the last counted week; active while now < expiresAt. */
  expiresAt: Date;
}

/** The contract a purchase at `purchasedAt` (server time) produces. */
export function contractSpan(purchasedAt: Date, weeks: number = CONTRACT_WEEKS): ContractSpan {
  const startIdx = gameWeekIndex(purchasedAt);
  const endIdx = startIdx + weeks - 1;
  return {
    start: seasonWeekOfIndex(startIdx),
    end: seasonWeekOfIndex(endIdx),
    durationWeeks: weeks,
    expiresAt: new Date(ANCHOR_MS + (startIdx + weeks) * WEEK_LENGTH_DAYS * MS_PER_DAY),
  };
}

export type ContractState = 'active' | 'expired' | 'ended';

export function contractState(expiresAt: Date, now: Date, ended = false): ContractState {
  if (ended) return 'ended';
  return now.getTime() >= expiresAt.getTime() ? 'expired' : 'active';
}

/** Weeks left, the current game week counting while the contract runs; 0 once it is over. */
export function remainingWeeks(span: ContractSpan, now: Date, ended = false): number {
  if (contractState(span.expiresAt, now, ended) !== 'active') return 0;
  const endIdx = (span.end.seasonNumber - 1) * TOTAL_WEEKS + (span.end.week - 1);
  return Math.max(0, endIdx - gameWeekIndex(now) + 1);
}

/**
 * Fate of a rider on the young-rider market at the moment the season ticks
 * over. Only riders who NEVER started a professional career can be removed;
 * one who already had a manager is protected whatever his age.
 * (Prepared and tested only: nothing activates the deletion — see C-050.)
 */
export type YoungMarketFate = 'not-yet' | 'stays' | 'retire-and-delete' | 'protected';

export function youngMarketFate(input: { age: number; everHadManager: boolean }): YoungMarketFate {
  if (input.everHadManager) return 'protected';
  if (input.age < MARKET_ENTRY_AGE) return 'not-yet';
  return input.age <= MARKET_MAX_AGE ? 'stays' : 'retire-and-delete';
}
