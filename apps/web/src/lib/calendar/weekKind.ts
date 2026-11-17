import { getCurrentSeasonInfo, TOTAL_WEEKS } from './season';

/**
 * The ONE week pattern of the game (owner decision 2026-11-17), valid for every season: odd weeks are TRAINING weeks, even weeks are RACE weeks
 * (week 2 Highlands, 4 Danube, 6 Coastal, 8 Northern Crown, 10 Silver Horizon - see data/tourSchedule.ts). Built on the existing calendar
 * (lib/calendar/season.ts: season start date, 10 weeks, UTC); there is no second week system. Mirrored by public.game_week_kind() and
 * public.training_target_week() in supabase/migrations/20261117_04_training_plans_calendar.sql (a parity test compares them).
 */
export type WeekKind = 'training' | 'race';
export const weekKind = (week: number): WeekKind => (week % 2 === 1 ? 'training' : 'race');

/**
 * Plan deadline: a plan for training week W can be chosen and changed from Monday 18:00 UTC of week W-1 until Monday 18:00 UTC of week W
 * (the first session is Tuesday 12:00, so the plan is always locked before any training happens). Consecutive windows touch without a gap.
 */
export const PLAN_DEADLINE_HOUR_UTC = 18;
const HOUR_MS = 3_600_000, WEEK_MS = 7 * 24 * HOUR_MS;

export interface TrainingTarget { seasonNumber: number; week: number }
/**
 * The training week a plan saved at `now` is for, or null when no training week is open (the next week is a race week).
 * Same arithmetic as the database: the week that contains (now - 18 h + 7 days).
 */
export function trainingTarget(now: Date): TrainingTarget | null {
  const info = getCurrentSeasonInfo(new Date(now.getTime() - PLAN_DEADLINE_HOUR_UTC * HOUR_MS + WEEK_MS));
  if (weekKind(info.currentWeek) !== 'training') return null;
  return { seasonNumber: info.seasonNumber, week: info.currentWeek };
}
export { TOTAL_WEEKS };
