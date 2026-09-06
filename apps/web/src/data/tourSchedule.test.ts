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

check('Danube and Coastal share the same real date range (intentional overlap)',
  danube.weekStart.getTime() === coastal.weekStart.getTime() && danube.weekEnd.getTime() === coastal.weekEnd.getTime());

// Nothing selected yet: everything available.
{
  const none = new Set<string>();
  check('no selection -> Danube available', getSelectionState('danube-tour', views, none) === 'available');
  check('no selection -> Coastal available', getSelectionState('coastal-tour', views, none) === 'available');
}

// Selecting Danube blocks Coastal (same dates) but not Highlands (different dates).
{
  const selected = new Set(['danube-tour']);
  check('Danube selected -> Danube reports "selected"', getSelectionState('danube-tour', views, selected) === 'selected');
  check('Danube selected -> Coastal becomes "overlap"', getSelectionState('coastal-tour', views, selected) === 'overlap');
  check('Danube selected -> Highlands stays "available"', getSelectionState('highlands-tour', views, selected) === 'available');
}

// Symmetric: selecting Coastal instead blocks Danube.
{
  const selected = new Set(['coastal-tour']);
  check('Coastal selected -> Danube becomes "overlap"', getSelectionState('danube-tour', views, selected) === 'overlap');
}

// Season limit: 3 non-overlapping picks -> the 4th (non-overlapping) Tour is "season-limit".
{
  const selected = new Set(['danube-tour', 'highlands-tour', 'northern-crown-tour']);
  check('3/3 selected -> Silver Horizon is "season-limit"', getSelectionState('silver-horizon-tour', views, selected) === 'season-limit');
  check('3/3 selected -> an already-selected Tour still reports "selected"',
    getSelectionState('danube-tour', views, selected) === 'selected');
}

// Overlap is checked before the season limit for a Tour that is both full-blocked and overlapping.
{
  const selected = new Set(['danube-tour', 'highlands-tour', 'northern-crown-tour']);
  check('3/3 selected + overlapping -> reports "overlap", not silently "season-limit"',
    getSelectionState('coastal-tour', views, selected) === 'overlap');
}

void silverHorizon;
console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
