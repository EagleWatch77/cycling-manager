import { SEASON_ONE_START } from './season';
import { tourScheduleOf, type CalendarVersion } from '@/data/tourSchedule';

/**
 * What the database says about the calendar (public.game_calendar_info()) compared with what this web build knows. PURE - no I/O (tested).
 * The web never guesses the calendar version: it shows the Tour dates of the version the database has active, and it reports any disagreement
 * (season start or Tour weeks) so a future reset or a half-finished deployment cannot silently show different dates than the database.
 */
export interface CalendarInfo { v2_active?: boolean; season_one_start?: string; tours?: Record<string, number> }
export interface CalendarState { version: CalendarVersion; healthy: boolean; problems: string[] }

export function evaluateCalendar(info: CalendarInfo | null): CalendarState {
  if (!info) return { version: 1, healthy: false, problems: ['unavailable'] };
  const version: CalendarVersion = info.v2_active ? 2 : 1;
  const problems: string[] = [];
  if (info.season_one_start !== SEASON_ONE_START) problems.push(`season start: database ${info.season_one_start}, web ${SEASON_ONE_START}`);
  for (const t of tourScheduleOf(version)) {
    const dbWeek = info.tours?.[t.tourId];
    if (dbWeek !== t.weekNumber) problems.push(`tour ${t.tourId}: database week ${dbWeek ?? 'none'}, web week ${t.weekNumber}`);
  }
  return { version, healthy: problems.length === 0, problems };
}

/** A database that does not have migration 04 yet (the function is missing): calendar 1 with the start date of the web; nothing to compare. */
export const LEGACY_DATABASE_STATE: CalendarState = { version: 1, healthy: true, problems: [] };
