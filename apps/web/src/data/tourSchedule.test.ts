/**
 * Tour selection V1 — overlap and season-limit rules.
 * Run with: npx tsx src/data/tourSchedule.test.ts
 */
import { getCurrentSeasonInfo } from '../lib/calendar/season';
import { getSeasonSchedule, getSelectionState, getScheduleForTour, tourScheduleOf, TOUR_SCHEDULE_V1, TOUR_SCHEDULE_V2, MAX_SEASON_TOUR_SELECTIONS } from './tourSchedule';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const info = getCurrentSeasonInfo(new Date('2026-09-06T12:00:00Z'));
const views = getSeasonSchedule(info, 2);

check('5 Rookie Tour choices scheduled', views.length === 5, `${views.length}`);
check('MAX_SEASON_TOUR_SELECTIONS is 3', MAX_SEASON_TOUR_SELECTIONS === 3);

const danube = views.find((v) => v.tour.id === 'danube-tour')!;
const coastal = views.find((v) => v.tour.id === 'coastal-tour')!;
const highlands = views.find((v) => v.tour.id === 'highlands-tour')!;
const northernCrown = views.find((v) => v.tour.id === 'northern-crown-tour')!;
const silverHorizon = views.find((v) => v.tour.id === 'silver-horizon-tour')!;

check('one Tour per race week: no two Tours share a date range any more',
  views.every((a, i) => views.every((b, j) => i === j || a.weekEnd.getTime() < b.weekStart.getTime() || b.weekEnd.getTime() < a.weekStart.getTime())));

// Nothing selected yet: everything available.
{
  const none = new Set<string>();
  check('no selection -> Danube available', getSelectionState('danube-tour', views, none) === 'available');
  check('no selection -> Coastal available', getSelectionState('coastal-tour', views, none) === 'available');
}

// Selecting Danube blocks nothing by overlap (every Tour has its own week).
{
  const selected = new Set(['danube-tour']);
  check('Danube selected -> Danube reports "selected"', getSelectionState('danube-tour', views, selected) === 'selected');
  check('Danube selected -> Coastal stays "available" (own week)', getSelectionState('coastal-tour', views, selected) === 'available');
  check('Danube selected -> Highlands (week 2, already started on 2026-09-06) is "started"', getSelectionState('highlands-tour', views, selected) === 'started');
}


// Season limit: 3 non-overlapping picks -> the 4th (non-overlapping) Tour is "season-limit".
{
  const selected = new Set(['danube-tour', 'highlands-tour', 'northern-crown-tour']);
  check('3/3 selected -> Silver Horizon is "season-limit"', getSelectionState('silver-horizon-tour', views, selected) === 'season-limit');
  check('3/3 selected -> an already-selected Tour still reports "selected"',
    getSelectionState('danube-tour', views, selected) === 'selected');
}

// With one Tour per week the season limit is the only blocker.
{
  const selected = new Set(['danube-tour', 'highlands-tour', 'northern-crown-tour']);
  check('3/3 selected -> Coastal is "season-limit" (no overlap rule involved)', getSelectionState('coastal-tour', views, selected) === 'season-limit');
}

void coastal;
void silverHorizon;

// A Tour whose week started cannot be joined late; the next Tour stays open.
{
  const none = new Set<string>();
  check('past Tour (Highlands, week 2) -> "started" with nothing selected', getSelectionState('highlands-tour', views, none) === 'started');
  const monday = getSeasonSchedule(getCurrentSeasonInfo(new Date('2026-09-07T00:00:01Z')), 2);
  check('Danube on its first day (Mon of week 4) -> "started"', getSelectionState('danube-tour', monday, none) === 'started');
  const sunday = getSeasonSchedule(getCurrentSeasonInfo(new Date('2026-09-06T23:00:00Z')), 2);
  check('Danube the evening before it starts -> still "available"', getSelectionState('danube-tour', sunday, none) === 'available');
  check('a Rider who already selected a Tour keeps "selected" after it starts',
    getSelectionState('danube-tour', monday, new Set(['danube-tour'])) === 'selected');
}

// Weekly template: season 2 runs the same 5 Tours in the same weeks, with its own real dates.
{
  const s2 = getCurrentSeasonInfo(new Date('2026-11-14T12:00:00Z'));
  const v2 = getSeasonSchedule(s2, 2);
  const d2 = v2.find((v) => v.tour.id === 'danube-tour')!;
  check('season 2 is current on 2026-11-14', s2.seasonId === 'season-2', s2.seasonId);
  check('season 2 has the same 5 Tours', v2.length === 5, `${v2.length}`);
  check('season 2 Danube is week 4 (same calendar every season)', d2.schedule.weekNumber === 4);
  check('season 2 Danube starts 2026-11-16', d2.weekStart.toISOString().slice(0, 10) === '2026-11-16', d2.weekStart.toISOString());
  check('season 2 Danube ends 2026-11-22', d2.weekEnd.toISOString().slice(0, 10) === '2026-11-22', d2.weekEnd.toISOString());
}

// Two calendar versions: the web shows the one the DATABASE has active (the version is never guessed).
{
  const w = (t: typeof TOUR_SCHEDULE_V1) => t.map((x) => `${x.tourId}:${x.weekNumber}`).join(',');
  check('calendar 1 = the old weeks (Danube and Coastal share week 5, 7, 9)', w(TOUR_SCHEDULE_V1) === 'highlands-tour:2,danube-tour:5,coastal-tour:5,northern-crown-tour:7,silver-horizon-tour:9');
  check('calendar 2 = 2/4/6/8/10', w(TOUR_SCHEDULE_V2) === 'highlands-tour:2,danube-tour:4,coastal-tour:6,northern-crown-tour:8,silver-horizon-tour:10');
  check('tourScheduleOf picks by version', tourScheduleOf(1) === TOUR_SCHEDULE_V1 && tourScheduleOf(2) === TOUR_SCHEDULE_V2);
  check('getScheduleForTour follows the version', getScheduleForTour('danube-tour', 1)?.weekNumber === 5 && getScheduleForTour('danube-tour', 2)?.weekNumber === 4);
  const v1 = getSeasonSchedule(getCurrentSeasonInfo(new Date('2026-09-06T12:00:00Z')), 1);
  check('calendar 1 keeps the old overlap (Danube + Coastal in the same dates)', v1.find((v) => v.tour.id === 'danube-tour')!.weekStart.getTime() === v1.find((v) => v.tour.id === 'coastal-tour')!.weekStart.getTime());
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
