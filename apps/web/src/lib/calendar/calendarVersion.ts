import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { evaluateCalendar, LEGACY_DATABASE_STATE, type CalendarInfo, type CalendarState } from './calendarState';

/** The calendar version and health, read from the database once per request. Every page that shows Tour dates passes `.version` to getSeasonSchedule(). */
export const getCalendarState = cache(async (): Promise<CalendarState> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('game_calendar_info');
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    // PGRST202 / 42883 = the function does not exist: the database still runs without migration 04 (calendar 1)
    if (code === 'PGRST202' || code === '42883') return LEGACY_DATABASE_STATE;
    return evaluateCalendar(null);
  }
  return evaluateCalendar((data ?? null) as CalendarInfo | null);
});
