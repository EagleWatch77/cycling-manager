/** Run: cd apps/web && npx tsx --tsconfig tsconfig.json src/lib/calendar/weekKind.test.ts */
import { weekKind, trainingTarget, PLAN_DEADLINE_HOUR_UTC } from './weekKind';
import { SEASON_ONE_START, getCurrentSeasonInfo } from './season';
import { TOUR_SCHEDULE_V2 } from '@/data/tourSchedule';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const at = (iso: string) => new Date(iso);

check('odd weeks are training, even weeks are race', [1, 3, 5, 7, 9].every((w) => weekKind(w) === 'training') && [2, 4, 6, 8, 10].every((w) => weekKind(w) === 'race'));
check('the Tour schedule is exactly the agreed calendar: 2 Highlands, 4 Danube, 6 Coastal, 8 Northern Crown, 10 Silver Horizon',
  TOUR_SCHEDULE_V2.map((t) => `${t.weekNumber}:${t.tourId}`).sort().join() === ['2:highlands-tour', '4:danube-tour', '6:coastal-tour', '8:northern-crown-tour', '10:silver-horizon-tour'].sort().join());
check('every Tour runs in a race (even) week and no two Tours share a week', TOUR_SCHEDULE_V2.every((t) => weekKind(t.weekNumber) === 'race') && new Set(TOUR_SCHEDULE_V2.map((t) => t.weekNumber)).size === 5);
check('deadline hour is 18:00 UTC', PLAN_DEADLINE_HOUR_UTC === 18);

// season 1 starts SEASON_ONE_START (a Monday); week w starts at +7(w-1) days
const start = Date.parse(`${SEASON_ONE_START}T00:00:00Z`);
const T = (week: number, day: number, h = 0, m = 0, s = 0, season = 0) => new Date(start + ((season * 70) + 7 * (week - 1) + day) * 86400_000 + h * 3600_000 + m * 60_000 + s * 1000);
const tgt = (d: Date) => { const t = trainingTarget(d); return t ? `${t.seasonNumber}:${t.week}` : 'none'; };
check('Monday 17:59:59 of week 3: still planning week 3 (deadline not reached)', tgt(T(3, 0, 17, 59, 59)) === '1:3');
check('Monday 18:00:00 of week 3: week 3 is locked, week 4 is a race week -> nothing to plan', tgt(T(3, 0, 18)) === 'none');
check('after the week 3 deadline there is nothing to plan until Monday 18:00 of week 4 (the next week is a race week)', tgt(T(3, 6, 23, 59)) === 'none' && tgt(T(4, 0, 17, 59, 59)) === 'none');
check('Monday 18:00 of week 4 opens week 5 and it stays open until Monday 17:59:59 of week 5', tgt(T(4, 0, 18)) === '1:5' && tgt(T(4, 3)) === '1:5' && tgt(T(5, 0, 17, 59, 59)) === '1:5');
check('Monday 18:00 of week 5 locks week 5 (no target during race week 6)', tgt(T(5, 0, 18)) === 'none' && tgt(T(5, 4)) === 'none');
check('Monday 18:00 of week 9 -> week 10 is a race week -> nothing', tgt(T(9, 0, 18)) === 'none');
check('Monday 18:00 of week 10 opens week 1 of the NEXT season (window crosses the season boundary)', tgt(T(10, 0, 17, 59)) === 'none' && tgt(T(10, 0, 18)) === '2:1' && tgt(T(10, 6, 23, 59)) === '2:1');
check('week 1 of season 2 stays open until its Monday 18:00', tgt(T(1, 0, 17, 59, 59, 1)) === '2:1' && tgt(T(1, 0, 18, 0, 0, 1)) === 'none');
// a plan can never be created for a week that has started: the target week is always strictly in the future or the very Monday before 18:00
{
  let bad = 0;
  for (let h = 0; h < 24 * 7 * 25; h += 3) {
    const now = new Date(start + h * 3600_000), t = trainingTarget(now);
    if (!t) continue;
    const info = getCurrentSeasonInfo(now);
    const targetStart = start + ((t.seasonNumber - 1) * 70 + 7 * (t.week - 1)) * 86400_000;
    const sessionOne = targetStart + 86400_000 + 12 * 3600_000;
    if (now.getTime() >= sessionOne || now.getTime() >= targetStart + 18 * 3600_000 || (info.seasonNumber === t.seasonNumber && info.currentWeek > t.week)) bad++;
  }
  check('over 25 weeks of instants: a plan is never accepted after Monday 18:00 of its own week (so never after the first session)', bad === 0, `${bad}`);
}
console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
