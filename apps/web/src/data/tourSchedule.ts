import { TOURS, type Tour } from './tours';
import { getWeekDateRange, type SeasonInfo } from '@/lib/calendar/season';
import { maxSeasonTours } from '@/lib/leagues';

/**
 * Tour schedule foundation V1 — explicit test scheduling data.
 *
 * Assigns a Tour to a week of the season. This is a WEEK TEMPLATE: every
 * season (1, 2, 3, ...) runs the same Tours in the same weeks, and the real
 * dates come from lib/calendar/season.ts for whichever season is current.
 * No per-season data has to be added by hand. Kept separate from
 * `data/tours.ts` so the same Tour content could later run in a different
 * week without touching the Tour itself.
 *
 * (The old per-entry registrationDeadline was never read anywhere; every
 * value was the Thursday of the Tour's own week.)
 */
export interface ScheduledTour {
  tourId: string;
  weekNumber: number;
  registrationOpen: boolean;
}

/**
 * Max Tours a Rider may select in one season. All current gameplay is
 * Rookie-only; see lib/leagues.ts maxSeasonTours() for the per-league values
 * this will grow into.
 */
export const MAX_SEASON_TOUR_SELECTIONS = maxSeasonTours('rookie');

/** 1 = the calendar the database had before migration 20261117_04 is activated; 2 = the ONE calendar (odd weeks training, even weeks race). */
export type CalendarVersion = 1 | 2;

/**
 * CALENDAR 1 (until public.activate_game_calendar_v2() is run): Danube and Coastal intentionally share week 5 (a Rider may enter either, never both),
 * Northern Crown is in week 7, Silver Horizon in week 9. Kept ONLY so the web shows exactly what the database still has before the activation.
 */
export const TOUR_SCHEDULE_V1: ScheduledTour[] = [
  { tourId: 'highlands-tour', weekNumber: 2, registrationOpen: true },
  { tourId: 'danube-tour', weekNumber: 5, registrationOpen: true },
  { tourId: 'coastal-tour', weekNumber: 5, registrationOpen: true },
  { tourId: 'northern-crown-tour', weekNumber: 7, registrationOpen: true },
  { tourId: 'silver-horizon-tour', weekNumber: 9, registrationOpen: true },
];

/**
 * CALENDAR 2 - ONE calendar for every season (owner decision 2026-11-17): odd weeks are TRAINING weeks, even weeks are RACE weeks
 * (see lib/calendar/weekKind.ts). One Tour per race week, so no two Tours overlap any more:
 *   1 training · 2 Highlands · 3 training · 4 Danube · 5 training · 6 Coastal · 7 training · 8 Northern Crown ·
 *   9 training · 10 Silver Horizon.
 * Mirrored in public.activate_game_calendar_v2() (supabase/migrations/20261117_04_training_plans_calendar.sql); a drift test compares them.
 */
export const TOUR_SCHEDULE_V2: ScheduledTour[] = [
  { tourId: 'highlands-tour', weekNumber: 2, registrationOpen: true },
  { tourId: 'danube-tour', weekNumber: 4, registrationOpen: true },
  { tourId: 'coastal-tour', weekNumber: 6, registrationOpen: true },
  { tourId: 'northern-crown-tour', weekNumber: 8, registrationOpen: true },
  { tourId: 'silver-horizon-tour', weekNumber: 10, registrationOpen: true },
];

/** The schedule of a calendar version. The version always comes from the database (lib/calendar/calendarState.ts) - never guessed by the web. */
export const tourScheduleOf = (version: CalendarVersion): ScheduledTour[] => (version === 2 ? TOUR_SCHEDULE_V2 : TOUR_SCHEDULE_V1);

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

/** Every scheduled Tour of the given season (the same weekly template each season), joined and sorted by week. */
export function getSeasonSchedule(info: SeasonInfo, version: CalendarVersion): ScheduledTourView[] {
  const msPerDay = 86_400_000;
  return tourScheduleOf(version)
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

/** The schedule entry for one Tour, if any. The template is the same in every season. */
export function getScheduleForTour(tourId: string, version: CalendarVersion): ScheduledTour | undefined {
  return tourScheduleOf(version).find((s) => s.tourId === tourId);
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
export type TourSelectionState = 'available' | 'selected' | 'overlap' | 'season-limit' | 'started';

export function getSelectionState(
  tourId: string,
  seasonViews: ScheduledTourView[],
  selectedTourIds: ReadonlySet<string>,
  maxSelections: number = MAX_SEASON_TOUR_SELECTIONS,
): TourSelectionState {
  if (selectedTourIds.has(tourId)) return 'selected';

  const target = seasonViews.find((v) => v.tour.id === tourId);
  if (!target) return 'available';

  // A Tour whose week has started (or already passed) can no longer be joined;
  // the player prepares for the next available Tour. startsInDays is 0 exactly
  // once the week's start has been reached.
  if (target.startsInDays === 0) return 'started';

  const overlapsSelected = seasonViews.some(
    (v) => selectedTourIds.has(v.tour.id)
      && v.tour.id !== tourId
      && rangesOverlap(v.weekStart, v.weekEnd, target.weekStart, target.weekEnd),
  );
  if (overlapsSelected) return 'overlap';

  if (selectedTourIds.size >= maxSelections) return 'season-limit';

  return 'available';
}
