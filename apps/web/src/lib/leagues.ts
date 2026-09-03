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

/** Filters a master stage list down to what this league may see. */
export function visibleStages<S>(stages: readonly S[], league: LeagueId): S[] {
  return stages.slice(0, visibleStageCount(league));
}

/** True when a higher league would reveal more stages than this one. */
export function hasHiddenStages(totalStages: number, league: LeagueId): boolean {
  return totalStages > visibleStageCount(league);
}
