/**
 * The generator's calendar arithmetic (SQL sponsor_reachable_tours in migration 20261122_04) against the game's OWN TypeScript calendar
 * (lib/calendar/season.ts + data/tourSchedule.ts). The expected values are computed here by a DIFFERENT method (real dates of every Tour week
 * of every season) and written to supabase/tests/fixtures/sponsor_reach_cases.json; supabase/tests/sponsors_fixes.test.sh feeds the SAME cases
 * to the real SQL function in Postgres. If TS calendar, data or SQL ever drift apart, one of the two tests fails.
 * Run with: npx tsx src/lib/sponsors/reach.test.ts            (UPDATE_FIXTURE=1 rewrites the fixture)
 */
import fs from 'node:fs';
import path from 'node:path';
import { getCurrentSeasonInfo, getWeekDateRange, SEASON_ONE_START, TOTAL_WEEKS } from '@/lib/calendar/season';
import { TOUR_SCHEDULE_V1, TOUR_SCHEDULE_V2, type ScheduledTour } from '@/data/tourSchedule';
import { OFFER_VALID_DAYS } from './rules';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) pass++; else { fail++; console.log(`FAIL ${n} ${d}`); } };
const DAY = 86_400_000;
const anchor = Date.parse(`${SEASON_ONE_START}T00:00:00Z`);
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
/** Monday (UTC) of the game week containing d; before season 1 the pre-season counts as week 1 (same as the database). */
const mondayOf = (d: Date) => anchor + Math.max(0, Math.floor((utcDay(d) - anchor) / (7 * DAY))) * 7 * DAY;

/** Race weeks (distinct Mondays) that are guaranteed inside a contract of `weeks` weeks signed on any day of the offer's 21 days. */
export function guaranteedRaceWeeks(now: Date, weeks: number, schedule: ScheduledTour[]): number {
  const earliestStart = mondayOf(now);                                              // contract weeks: [earliestStart, earliestStart + weeks weeks)
  const latestSigningWeek = mondayOf(new Date(now.getTime() + OFFER_VALID_DAYS * DAY));
  const first = latestSigningWeek + 7 * DAY;                                        // registration still possible: a later week than the last signing week
  const last = earliestStart + (weeks - 1) * 7 * DAY;                               // last week every possible contract still covers
  const mondays = new Set<number>();
  for (let season = 1; season <= 12; season++) {
    const info = getCurrentSeasonInfo(new Date(anchor + (season - 1) * TOTAL_WEEKS * 7 * DAY));
    for (const t of schedule) {
      const monday = getWeekDateRange(info, t.weekNumber).start.getTime();
      if (monday >= first && monday <= last) mondays.add(monday);
    }
  }
  return mondays.size;
}

const cal = { v1: TOUR_SCHEDULE_V1, v2: TOUR_SCHEDULE_V2 };
const cases: { now: string; weeks: number; calendar: 'v1' | 'v2'; expected: number }[] = [];
const dates: Date[] = [];
for (let i = 0; i < 130; i++) dates.push(new Date(anchor + (i * 3 - 40) * DAY + 12 * 3_600_000));          // 2026-07 .. 2027-09, every 3 days
for (const iso of ['2026-11-22T12:00:00Z', '2026-08-16T23:59:59Z', '2026-08-17T00:00:00Z', '2026-10-25T00:30:00Z', '2027-01-03T23:59:00Z']) dates.push(new Date(iso));
for (const d of dates) for (const weeks of [5, 10, 20]) for (const c of ['v1', 'v2'] as const)
  cases.push({ now: d.toISOString(), weeks, calendar: c, expected: guaranteedRaceWeeks(d, weeks, cal[c]) });

const file = path.resolve(__dirname, '../../../../../supabase/tests/fixtures/sponsor_reach_cases.json');
if (process.env.UPDATE_FIXTURE === '1') fs.writeFileSync(file, JSON.stringify(cases) + '\n');
const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
check('fixture on disk == freshly computed from the TS calendar (rerun with UPDATE_FIXTURE=1 if the calendar was changed on purpose)', JSON.stringify(onDisk) === JSON.stringify(cases));
// hand-checked anchors (also asserted in SQL): Sun 2026-11-22, 10 weeks
const at = (c: 'v1' | 'v2', w: number) => guaranteedRaceWeeks(new Date('2026-11-22T12:00:00Z'), w, cal[c]);
check('V2, 10 weeks from 2026-11-22: 3 guaranteed race weeks', at('v2', 10) === 3, String(at('v2', 10)));
check('V2, 20 weeks: 8', at('v2', 20) === 8, String(at('v2', 20)));
check('V1, 10 weeks: 2 (Danube+Coastal share week 5 and count once)', at('v1', 10) === 2, String(at('v1', 10)));
check('a 4-week contract cannot reach any race week', at('v2', 4) === 0 && at('v1', 4) === 0);
check('V2 never leaves a 10-week contract without a race week, any day of the year', cases.filter((c) => c.calendar === 'v2' && c.weeks === 10).every((c) => c.expected >= 1));
check('V1 never leaves a 10-week contract without a race week, any day of the year', cases.filter((c) => c.calendar === 'v1' && c.weeks === 10).every((c) => c.expected >= 1));
check('longer contract never reaches fewer race weeks', cases.filter((c) => c.weeks === 10).every((c) => cases.find((x) => x.now === c.now && x.calendar === c.calendar && x.weeks === 20)!.expected >= c.expected));
check('both calendars have the 5 known Tours', TOUR_SCHEDULE_V1.length === 5 && TOUR_SCHEDULE_V2.length === 5);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
