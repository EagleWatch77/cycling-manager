/**
 * Sponzori — approved rules (owner, 2026-11-22). PURE module: no UI, no DB. Mirrored in SQL by
 * supabase/migrations/20261122_01_sponsors_foundation.sql (limits, durations, goal list, week key) — keep both in sync.
 *
 * NO MONEY HERE ON PURPOSE: the amounts (weekly income, bonuses) and the offer-generation formulas are NOT approved yet.
 * Every money field is `number | null` (integer cents); null = "Zatiaľ neurčené". Nothing in this file invents an amount.
 */
import { LEAGUES, type LeagueId } from '../leagues';

export type SponsorKind = 'main' | 'secondary';

/** Max sponsors a player may hold per league (owner table). The player need not fill every slot. */
export const SPONSOR_LIMITS: Record<LeagueId, { main: number; secondary: number }> = {
  rookie: { main: 1, secondary: 1 },
  amateur: { main: 1, secondary: 2 },
  continental: { main: 1, secondary: 2 },
  pro: { main: 1, secondary: 3 },
  elite: { main: 2, secondary: 2 },
};

/** Market: at most 6 open offers per player, at most 3 of each kind. */
export const MAX_OFFERS = { main: 3, secondary: 3, total: 6 } as const;
/** Every offer is valid for 3 game weeks. */
export const OFFER_VALID_WEEKS = 3;
/** Early termination fee: 30 % of the REMAINING guaranteed income. */
export const SEVERANCE_PERCENT = 30;

/** Contract length in game weeks: main Rookie–Pro 10; main Elite 10 or 20; secondary (every league) 5. */
export function allowedDurations(league: LeagueId, kind: SponsorKind): readonly number[] {
  if (kind === 'secondary') return [5];
  return league === 'elite' ? [10, 20] : [10];
}

export const GOAL_TYPES = [
  'participateTour', 'finishTour', 'top50', 'top10', 'winStage', 'anyJersey', 'winTour', 'winSeason',
  'promotion', 'participateWorlds', 'top3Worlds', 'winWorlds',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export interface GoalDef {
  /** Paid again for every repetition (3 stage wins = 3x bonus; 3 finished Tours = 3x finish bonus). Otherwise paid once. */
  repeatable: boolean;
  /** Leagues in which the goal may be offered (so no unreachable goal is ever offered). */
  leagues: readonly LeagueId[];
  /**
   * Can the game evaluate the goal today? ALL false: race results/Tours/Worlds are not wired into the live game yet,
   * and a goal is never evaluated from invented data (owner rule).
   */
  evaluable: boolean;
}

const ALL = LEAGUES;
export const GOALS: Record<GoalType, GoalDef> = {
  participateTour: { repeatable: true, leagues: ALL, evaluable: false },
  finishTour: { repeatable: true, leagues: ALL, evaluable: false },
  top50: { repeatable: true, leagues: ALL, evaluable: false },
  top10: { repeatable: true, leagues: ALL, evaluable: false },
  winStage: { repeatable: true, leagues: ALL, evaluable: false },
  anyJersey: { repeatable: true, leagues: ALL, evaluable: false },
  winTour: { repeatable: true, leagues: ALL, evaluable: false },
  winSeason: { repeatable: false, leagues: ALL, evaluable: false },
  promotion: { repeatable: false, leagues: ['rookie', 'amateur', 'continental', 'pro'], evaluable: false },
  participateWorlds: { repeatable: false, leagues: ['continental', 'pro', 'elite'], evaluable: false },
  top3Worlds: { repeatable: false, leagues: ['pro', 'elite'], evaluable: false },
  winWorlds: { repeatable: false, leagues: ['elite'], evaluable: false },
};

export const goalAllowedIn = (g: GoalType, league: LeagueId) => GOALS[g].leagues.includes(league);

export interface SponsorGoal { type: GoalType; bonusCents: number | null }
export type GoalPair = readonly [easy: SponsorGoal, hard: SponsorGoal];

/** A sponsor offers exactly two optional goals, different from each other, both reachable in the league. */
export function goalPairProblem(pair: GoalPair, league: LeagueId): string | null {
  if (pair.length !== 2) return 'exactly_two_goals';
  if (pair[0].type === pair[1].type) return 'goals_must_differ';
  for (const g of pair) if (!goalAllowedIn(g.type, league)) return `goal_not_available:${g.type}`;
  return null;
}

export interface SponsorOffer {
  id: string;
  /** true = clearly labelled design demonstration, never a real offer */
  isDemo: boolean;
  companyId: string;
  companyName: string;
  kind: SponsorKind;
  durationWeeks: number;
  weeklyIncomeCents: number | null;
  goals: GoalPair;
  expiresAt: string;
}

export interface SponsorContract {
  id: string;
  isDemo: boolean;
  companyId: string;
  companyName: string;
  kind: SponsorKind;
  signedAt: string;
  endsAt: string;
  durationWeeks: number;
  weeklyIncomeCents: number | null;
  goals: GoalPair;
}

export const hasFinancialTerms = (o: { weeklyIncomeCents: number | null; goals: GoalPair }) =>
  o.weeklyIncomeCents !== null && o.weeklyIncomeCents > 0 && o.goals.every((g) => g.bonusCents !== null && g.bonusCents > 0);

const DAY_MS = 86_400_000;
export const weeksLeft = (endsAt: string, now: Date, durationWeeks: number) =>
  Math.max(0, Math.min(durationWeeks, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / (7 * DAY_MS))));

/** Time to expiry of an offer as whole days + hours (0 when expired). */
export function timeLeft(expiresAt: string, now: Date): { days: number; hours: number; expired: boolean } {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0, expired: true };
  return { days: Math.floor(ms / DAY_MS), hours: Math.floor((ms % DAY_MS) / 3_600_000), expired: false };
}

/** Severance = 30 % of the remaining guaranteed income, in integer cents (half-up). 1000/week x 4 weeks -> 1200. */
export function severanceCents(weeklyIncomeCents: number, remainingWeeks: number): number {
  return Math.floor((weeklyIncomeCents * remainingWeeks * SEVERANCE_PERCENT + 50) / 100);
}

export type SignBlock =
  | 'no_financial_terms' | 'economy_not_enabled' | 'expired' | 'not_open' | 'slots_full' | 'duration_not_allowed' | 'same_sponsor_twice';

/**
 * Can this offer be signed? Returns the FIRST reason it cannot, or null. Order matters for the UI message:
 * the missing-money / switched-off reasons come first because they hold for every offer today.
 * `lastSignedCompanyId` = company of the player's most recently signed contract (any kind), or null.
 */
export function signBlock(args: {
  offer: SponsorOffer; status: 'open' | 'accepted' | 'rejected' | 'expired'; league: LeagueId; now: Date;
  activeByKind: Record<SponsorKind, number>; lastSignedCompanyId: string | null; economyEnabled: boolean;
}): SignBlock | null {
  const { offer, status, league, now, activeByKind, lastSignedCompanyId, economyEnabled } = args;
  if (!hasFinancialTerms(offer)) return 'no_financial_terms';
  if (!economyEnabled) return 'economy_not_enabled';
  if (status !== 'open') return 'not_open';
  if (timeLeft(offer.expiresAt, now).expired) return 'expired';
  if (!allowedDurations(league, offer.kind).includes(offer.durationWeeks)) return 'duration_not_allowed';
  if (activeByKind[offer.kind] >= SPONSOR_LIMITS[league][offer.kind]) return 'slots_full';
  if (lastSignedCompanyId !== null && lastSignedCompanyId === offer.companyId) return 'same_sponsor_twice';
  return null;
}

/** An offer may be SHOWN while its slots are full (it just cannot be signed). */
export const slotsFull = (league: LeagueId, kind: SponsorKind, activeByKind: Record<SponsorKind, number>) =>
  activeByKind[kind] >= SPONSOR_LIMITS[league][kind];

/** Room for new offers on the market (3 + 3, never above). */
export function offerRoom(open: { main: number; secondary: number }) {
  return { main: Math.max(0, MAX_OFFERS.main - open.main), secondary: Math.max(0, MAX_OFFERS.secondary - open.secondary) };
}

/**
 * Weekly economic update: Sunday 00:00 Europe/Bratislava. Returns the key of the update period `at` belongs to =
 * the Bratislava calendar date (YYYY-MM-DD) of the most recent such Sunday. Used as the idempotency key of payouts
 * (one payout per contract + week key + kind), so re-running an update can never pay twice. DST-safe (uses Intl).
 */
export function sponsorWeekKey(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const local = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')));
  return new Date(local - dayIdx * DAY_MS).toISOString().slice(0, 10);
}
