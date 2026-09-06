/**
 * Real-time game calendar — bounds, determinism, week/season transitions.
 * Run with: npx tsx src/lib/calendar/season.test.ts
 */
import { getCurrentSeasonInfo, getWeekDateRange, TOTAL_WEEKS, SEASON_LENGTH_DAYS, SEASON_ONE_START } from './season';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

// 1. Determinism: same `now` -> identical info.
{
  const a = getCurrentSeasonInfo(day('2026-09-06'));
  const b = getCurrentSeasonInfo(day('2026-09-06'));
  check('same date -> identical season info', JSON.stringify(a) === JSON.stringify(b));
}

// 2. Season 1, Week 1 on the anchor date itself.
{
  const info = getCurrentSeasonInfo(day(SEASON_ONE_START));
  check('anchor date is Season 1', info.seasonNumber === 1, `${info.seasonNumber}`);
  check('anchor date is Week 1', info.currentWeek === 1, `${info.currentWeek}`);
}

// 3. Before the anchor date: pre-season default, never negative.
{
  const info = getCurrentSeasonInfo(day('2020-01-01'));
  check('before anchor -> Season 1', info.seasonNumber === 1, `${info.seasonNumber}`);
  check('before anchor -> Week 1', info.currentWeek === 1, `${info.currentWeek}`);
}

// 4. Week always in [1, TOTAL_WEEKS] across a long date sweep, monotonic within a season.
{
  let ok = true, why = '';
  let prevSeason = 0, prevWeek = 0;
  for (let d = 0; d < SEASON_LENGTH_DAYS * 6; d++) {
    const now = new Date(day(SEASON_ONE_START).getTime() + d * 86_400_000);
    const info = getCurrentSeasonInfo(now);
    if (info.currentWeek < 1 || info.currentWeek > TOTAL_WEEKS) { ok = false; why = `week ${info.currentWeek} on day ${d}`; break; }
    if (info.seasonNumber < prevSeason || (info.seasonNumber === prevSeason && info.currentWeek < prevWeek)) {
      ok = false; why = `regressed at day ${d}`; break;
    }
    prevSeason = info.seasonNumber; prevWeek = info.currentWeek;
  }
  check('week always in [1,10] and never regresses across 6 seasons', ok, why);
}

// 5. Season rolls over exactly at the 70-day boundary, no manual season list needed.
{
  const lastDayOfSeason1 = getCurrentSeasonInfo(new Date(day(SEASON_ONE_START).getTime() + (SEASON_LENGTH_DAYS - 1) * 86_400_000));
  const firstDayOfSeason2 = getCurrentSeasonInfo(new Date(day(SEASON_ONE_START).getTime() + SEASON_LENGTH_DAYS * 86_400_000));
  check('day 69 is Season 1 Week 10', lastDayOfSeason1.seasonNumber === 1 && lastDayOfSeason1.currentWeek === 10,
    `${lastDayOfSeason1.seasonNumber} w${lastDayOfSeason1.currentWeek}`);
  check('day 70 rolls into Season 2 Week 1', firstDayOfSeason2.seasonNumber === 2 && firstDayOfSeason2.currentWeek === 1,
    `${firstDayOfSeason2.seasonNumber} w${firstDayOfSeason2.currentWeek}`);
}

// 6. getWeekDateRange: week 1 starts on the season start date; weeks are contiguous 7-day blocks.
{
  const info = getCurrentSeasonInfo(day(SEASON_ONE_START));
  const w1 = getWeekDateRange(info, 1);
  const w2 = getWeekDateRange(info, 2);
  check('week 1 starts on season start', w1.start.getTime() === info.seasonStart.getTime());
  check('week 1 spans 7 days', (w1.end.getTime() - w1.start.getTime()) / 86_400_000 === 6);
  check('week 2 starts the day after week 1 ends', w2.start.getTime() - w1.end.getTime() === 86_400_000);
}

// 7. Today's real calculation (informational, printed below).
const today = getCurrentSeasonInfo();
console.log(`\n  Today (${today.now.toISOString().slice(0, 10)}): Season ${today.seasonNumber}, Week ${today.currentWeek}/${today.totalWeeks}`);
console.log(`  Season window: ${today.seasonStart.toISOString().slice(0, 10)} .. ${today.seasonEnd.toISOString().slice(0, 10)}`);

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
