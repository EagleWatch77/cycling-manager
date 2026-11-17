/**
 * Reference values for supabase/tests/training_plans_calendar.test.sh: season / week / week kind / plan target of many instants (incl. every Monday
 * 17:59:59 and 18:00:00), and the stage days per league, computed by the app code.   tsx calendarParity.cli.ts
 */
import { getCurrentSeasonInfo, SEASON_ONE_START } from './season';
import { weekKind, trainingTarget } from './weekKind';
import { gameWeekIndex } from '@/lib/contract/contract';
import { LEAGUE_RACE_DAYS, LEAGUES, visibleStageCount } from '@/lib/leagues';
import { TOUR_SCHEDULE_V1, TOUR_SCHEDULE_V2 } from '@/data/tourSchedule';

const start = Date.parse(`${SEASON_ONE_START}T00:00:00Z`);
const instants: Date[] = [];
for (let h = -30; h < 24 * 7 * 32; h += 5) instants.push(new Date(start + h * 3_600_000 + 17 * 60_000));
for (let w = 0; w < 32; w++) for (const s of [-1, 0]) instants.push(new Date(start + (w * 7 * 24 + 18) * 3_600_000 + s * 1000));
const rows = instants.map((d) => { const i = getCurrentSeasonInfo(d), t = trainingTarget(d);
  return { at: d.toISOString().replace('T', ' ').replace('Z', '+00'), season: i.seasonId, week: i.currentWeek, kind: weekKind(i.currentWeek), idx: gameWeekIndex(d), target: t ? `season-${t.seasonNumber}:${t.week}` : 'none' }; });
console.log(JSON.stringify({ start: SEASON_ONE_START, rows,
  raceDays: Object.fromEntries(LEAGUES.map((l) => [l, [...LEAGUE_RACE_DAYS[l]]])), stages: Object.fromEntries(LEAGUES.map((l) => [l, visibleStageCount(l)])),
  tours: Object.fromEntries(TOUR_SCHEDULE_V2.map((t) => [t.tourId, t.weekNumber])), toursV1: Object.fromEntries(TOUR_SCHEDULE_V1.map((t) => [t.tourId, t.weekNumber])) }));
