/**
 * Tour prize money — display-only rulebook, same convention as
 * data/scoring.ts (SCORING): it shows what a result is worth, nothing here
 * pays anything out yet (no race simulation/results exist).
 *
 * Prize money scales off the Tour's existing `prestige` (1–5, already on
 * every Tour in data/tours.ts) rather than being hand-entered per Tour, so a
 * new Tour needs no separate reward data — just a prestige rating.
 */

const BASE_OVERALL_WINNER = 2000;
const BASE_STAGE_WINNER = 300;
const BASE_JERSEY_WINNER = 500;

export interface TourRewards {
  /** Prize for winning the Tour's general classification. */
  overallWinner: number;
  /** Prize for winning a single stage. */
  stageWinner: number;
  /** Prize for winning a classification jersey (same amount per jersey kind). */
  jerseyWinner: number;
}

export function getTourRewards(prestige: number): TourRewards {
  return {
    overallWinner: BASE_OVERALL_WINNER * prestige,
    stageWinner: BASE_STAGE_WINNER * prestige,
    jerseyWinner: BASE_JERSEY_WINNER * prestige,
  };
}
