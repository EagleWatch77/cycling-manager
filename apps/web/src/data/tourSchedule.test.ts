/**
 * Tour selection V1 — overlap and season-limit rules.
 * Run with: npx tsx src/data/tourSchedule.test.ts
 */
import { getCurrentSeasonInfo } from '../lib/calendar/season';
import { getSeasonSchedule, getSelectionState, MAX_SEASON_TOUR_SELECTIONS } from './tourSchedule';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const info = getCurrentSeasonInfo(new Date('2026-09-06T12:00:00Z'));
const views = getSeasonSchedule(info);

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
  const monday = getSeasonSchedule(getCurrentSeasonInfo(new Date('2026-09-07T00:00:01Z')));
  check('Danube on its first day (Mon of week 4) -> "started"', getSelectionState('danube-tour', monday, none) === 'started');
  const sunday = getSeasonSchedule(getCurrentSeasonInfo(new Date('2026-09-06T23:00:00Z')));
  check('Danube the evening before it starts -> still "available"', getSelectionState('danube-tour', sunday, none) === 'available');
  check('a Rider who already selected a Tour keeps "selected" after it starts',
    getSelectionState('danube-tour', monday, new Set(['danube-tour'])) === 'selected');
}

// Weekly template: season 2 runs the same 5 Tours in the same weeks, with its own real dates.
{
  const s2 = getCurrentSeasonInfo(new Date('2026-11-14T12:00:00Z'));
  const v2 = getSeasonSchedule(s2);
  const d2 = v2.find((v) => v.tour.id === 'danube-tour')!;
  check('season 2 is current on 2026-11-14', s2.seasonId === 'season-2', s2.seasonId);
  check('season 2 has the same 5 Tours', v2.length === 5, `${v2.length}`);
  check('season 2 Danube is week 4 (same calendar every season)', d2.schedule.weekNumber === 4);
  check('season 2 Danube starts 2026-11-16', d2.weekStart.toISOString().slice(0, 10) === '2026-11-16', d2.weekStart.toISOString());
  check('season 2 Danube ends 2026-11-22', d2.weekEnd.toISOString().slice(0, 10) === '2026-11-22', d2.weekEnd.toISOString());
}
console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
