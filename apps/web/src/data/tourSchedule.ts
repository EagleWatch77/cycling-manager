import { TOURS, type Tour } from './tours';
import { getWeekDateRange, type SeasonInfo } from '@/lib/calendar/season';
import { maxSeasonTours } from '@/lib/leagues';

/**
 * Tour schedule foundation V1 — explicit test scheduling data.
 *
 * Assigns a Tour to a season week. No automatic seasonal generator yet: a
 * new season needs its own entries added here by hand. Kept separate from
 * `data/tours.ts` so the same Tour content could later run in a different
 * week/season without touching the Tour itself.
 */
export interface ScheduledTour {
  tourId: string;
  seasonId: string;
  weekNumber: number;
  registrationOpen: boolean;
  /** ISO date (YYYY-MM-DD). Registration is expected to close by this date. */
  registrationDeadline: string;
}

/**
 * Max Tours a Rider may select in one season. All current gameplay is
 * Rookie-only; see lib/leagues.ts maxSeasonTours() for the per-league values
 * this will grow into.
 */
export const MAX_SEASON_TOUR_SELECTIONS = maxSeasonTours('rookie');

/**
 * Rookie season — 5 Tour choices. Danube and Coastal intentionally share
 * week 5 (same real date range): a Rider may enter either, never both.
 */
export const TOUR_SCHEDULE: ScheduledTour[] = [
  { tourId: 'highlands-tour', seasonId: 'season-1', weekNumber: 2, registrationOpen: true, registrationDeadline: '2026-08-27' },
  { tourId: 'danube-tour', seasonId: 'season-1', weekNumber: 5, registrationOpen: true, registrationDeadline: '2026-09-17' },
  { tourId: 'coastal-tour', seasonId: 'season-1', weekNumber: 5, registrationOpen: true, registrationDeadline: '2026-09-17' },
  { tourId: 'northern-crown-tour', seasonId: 'season-1', weekNumber: 7, registrationOpen: true, registrationDeadline: '2026-10-01' },
  { tourId: 'silver-horizon-tour', seasonId: 'season-1', weekNumber: 9, registrationOpen: true, registrationDeadline: '2026-10-15' },
];

/** A schedule entry joined with its Tour content and real calendar dates. */
export interface ScheduledTourView {
  tour: Tour;
  schedule: ScheduledTour;
  weekStart: Date;
  weekEnd: Date;
  isCurrentWeek: boolean;
  /** Days until the Tour's week starts; 0 once it has started or is current. */
  startsInDays: number;
}

/** Every scheduled Tour for the given season, joined and sorted by week. */
export function getSeasonSchedule(info: SeasonInfo): ScheduledTourView[] {
  const msPerDay = 86_400_000;
  return TOUR_SCHEDULE
    .filter((s) => s.seasonId === info.seasonId)
    .map((schedule): ScheduledTourView | null => {
      const tour = TOURS.find((t) => t.id === schedule.tourId);
      if (!tour) return null;
      const { start, end } = getWeekDateRange(info, schedule.weekNumber);
      return {
        tour,
        schedule,
        weekStart: start,
        weekEnd: end,
        isCurrentWeek: schedule.weekNumber === info.currentWeek,
        startsInDays: Math.max(0, Math.ceil((start.getTime() - info.now.getTime()) / msPerDay)),
      };
    })
    .filter((v): v is ScheduledTourView => v !== null)
    .sort((a, b) => a.schedule.weekNumber - b.schedule.weekNumber);
}

/** The schedule entry for one Tour in the given season, if any. */
export function getScheduleForTour(tourId: string, info: SeasonInfo): ScheduledTour | undefined {
  return TOUR_SCHEDULE.find((s) => s.tourId === tourId && s.seasonId === info.seasonId);
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

/**
 * Tour selection V1 — a Rider picks up to MAX_SEASON_TOUR_SELECTIONS Tours
 * per season and cannot hold two whose race dates overlap. Pure function:
 * the caller supplies which Tour ids are already selected (from the
 * Rider's persisted registrations), so this has no I/O of its own.
 */
export type TourSelectionState = 'available' | 'selected' | 'overlap' | 'season-limit';

export function getSelectionState(
  tourId: string,
  seasonViews: ScheduledTourView[],
  selectedTourIds: ReadonlySet<string>,
  maxSelections: number = MAX_SEASON_TOUR_SELECTIONS,
): TourSelectionState {
  if (selectedTourIds.has(tourId)) return 'selected';

  const target = seasonViews.find((v) => v.tour.id === tourId);
  if (!target) return 'available';

  const overlapsSelected = seasonViews.some(
    (v) => selectedTourIds.has(v.tour.id)
      && v.tour.id !== tourId
      && rangesOverlap(v.weekStart, v.weekEnd, target.weekStart, target.weekEnd),
  );
  if (overlapsSelected) return 'overlap';

  if (selectedTourIds.size >= maxSelections) return 'season-limit';

  return 'available';
}
