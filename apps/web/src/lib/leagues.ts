/**
 * League progression and content visibility.
 *
 * Language-neutral ids. Labels come from i18n keys `league.<id>`.
 */
export const LEAGUES = ['rookie', 'amateur', 'continental', 'pro', 'elite'] as const;
export type LeagueId = (typeof LEAGUES)[number];

/**
 * How many stages of a canonical 5-stage master Tour a league can see.
 *
 * UX RULE: stages above this count are NOT rendered greyed out or locked. They
 * do not exist in the player's UI at all, so promotion reveals them as new
 * content rather than removing a padlock.
 */
const VISIBLE_STAGE_COUNT: Record<LeagueId, number> = {
  rookie: 3,
  amateur: 4,
  continental: 5,
  pro: 5,
  elite: 5,
};

export function visibleStageCount(league: LeagueId): number {
  return VISIBLE_STAGE_COUNT[league];
}

/**
 * How many Tours a Rider in this league may select per season. Only Rookie
 * is tuned today; the other leagues hold a placeholder value so the season
 * calendar and selection limit already work once they are designed.
 */
const MAX_SEASON_TOURS: Record<LeagueId, number> = {
  rookie: 3,
  amateur: 3,
  continental: 3,
  pro: 3,
  elite: 3,
};

export function maxSeasonTours(league: LeagueId): number {
  return MAX_SEASON_TOURS[league];
}

/** Filters a master stage list down to what this league may see. */
export function visibleStages<S>(stages: readonly S[], league: LeagueId): S[] {
  return stages.slice(0, visibleStageCount(league));
}

/** True when a higher league would reveal more stages than this one. */
export function hasHiddenStages(totalStages: number, league: LeagueId): boolean {
  return totalStages > visibleStageCount(league);
}

/**
 * Zázemie (Team Facilities) V1 — the maximum facility level a league may
 * reach (see lib/facilities/config.ts, which is the canonical place that
 * actually combines this with the Team Center cap and any admin/dev
 * override — this map only answers "what does league alone allow").
 */
const MAX_FACILITY_LEVEL: Record<LeagueId, number> = {
  rookie: 2,
  amateur: 3,
  continental: 4,
  pro: 5,
  elite: 5,
};

export function maxFacilityLevel(league: LeagueId): number {
  return MAX_FACILITY_LEVEL[league];
}

/** Index within LEAGUES — lower is earlier/weaker. Used only for ordering, never for gating on its own. */
export function leagueRank(league: LeagueId): number {
  return LEAGUES.indexOf(league);
}
