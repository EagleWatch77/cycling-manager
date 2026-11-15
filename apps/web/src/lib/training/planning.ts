import type { SeasonInfo } from '@/lib/calendar/season';

/**
 * The one week a training plan may target: the NEXT game week (current + 1).
 * Weeks run Monday 00:00 UTC to Sunday 24:00 UTC, so the planning deadline is
 * the calendar week boundary. Week 1 is preparatory (nothing can be planned
 * FOR it, but week 2 may be planned during it); in the last week there is no
 * plannable week — training for week 1 of the next season is never planned.
 *
 * Pure UI/display mirror of public.training_plannable_week() — the database
 * function is authoritative (save_my_training_plan() recomputes it and never
 * accepts a week from the client); a drift test compares the two.
 */
export function plannableWeek(info: Pick<SeasonInfo, 'currentWeek' | 'totalWeeks'>): number | null {
  return info.currentWeek >= info.totalWeeks ? null : info.currentWeek + 1;
}
