import { TOURS, type Tour } from './tours';
import { getWeekDateRange, type SeasonInfo } from '@/lib/calendar/season';

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

export const TOUR_SCHEDULE: ScheduledTour[] = [
  { tourId: 'sample-spring-classic', seasonId: 'season-1', weekNumber: 1, registrationOpen: false, registrationDeadline: '2026-08-20' },
  { tourId: 'danube-tour', seasonId: 'season-1', weekNumber: 3, registrationOpen: true, registrationDeadline: '2026-09-13' },
  { tourId: 'sample-mountain-tour', seasonId: 'season-1', weekNumber: 6, registrationOpen: false, registrationDeadline: '2026-10-04' },
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
