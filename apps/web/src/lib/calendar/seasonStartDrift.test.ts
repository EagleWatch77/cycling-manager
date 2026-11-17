/**
 * The season start lives in ONE web constant (SEASON_ONE_START) and ONE database setting (game_calendar_settings). This test fails the build when the
 * defaults written in the migration drift from the constant. At run time evaluateCalendar() (calendarState.ts) reports any later divergence (e.g. a
 * reset done on one side only) and the web pauses planning instead of showing different dates.   npx tsx src/lib/calendar/seasonStartDrift.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEASON_ONE_START } from './season';

let ok = 0, bad = 0;
const check = (n: string, c: boolean) => { c ? ok++ : (bad++, console.log('  FAIL', n)); };
const sql = readFileSync(join(process.cwd(), '../../supabase/migrations/20261117_04_training_plans_calendar.sql'), 'utf8');
const dates = [...sql.matchAll(/date '(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
const defaults = [...sql.matchAll(/season_one_start\)\s*values \(true, date '(\d{4}-\d{2}-\d{2})'\)/g)].map((m) => m[1]);
const fallback = [...sql.matchAll(/season_one_start from public\.game_calendar_settings where id\), date '(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
check('the migration seeds the setting exactly once', defaults.length === 1);
check('the seeded default == SEASON_ONE_START of the web', defaults[0] === SEASON_ONE_START);
check('the fallback inside game_season_one_start() == SEASON_ONE_START of the web', fallback.length === 1 && fallback[0] === SEASON_ONE_START);
check('SEASON_ONE_START is a Monday (the database refuses anything else)', new Date(`${SEASON_ONE_START}T00:00:00Z`).getUTCDay() === 1);
check('no other date literal of the season start is hidden in the calendar migration', dates.filter((d) => d === SEASON_ONE_START).length === 2);
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
