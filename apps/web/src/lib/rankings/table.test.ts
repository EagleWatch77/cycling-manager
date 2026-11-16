import assert from 'node:assert/strict';
import { buildTable, homeRows, type TableManager, type PointsRow } from './table';
import { leagueTableShape, zoneFor, leagueMoves, ZONE_RULES, type ZoneRule } from './config';
import { LEAGUES, type LeagueId } from '@/lib/leagues';

const mk = (n: number, me = false): TableManager => ({ managerId: `m${String(n).padStart(2, '0')}`, displayName: `M${n}`, countryCode: null, isMe: me, ms: null });
const stage = (m: number, tour: number, st: number, points: number): PointsRow => ({ managerId: `m${String(m).padStart(2, '0')}`, kind: 'stage', tourNo: tour, stageNo: st, points });

// shape comes from league rules, not hard-coded
assert.deepEqual(leagueTableShape('rookie'), { tours: 3, stagesPerTour: 3 });
assert.equal(leagueTableShape('amateur').stagesPerTour, 4);
assert.equal(leagueTableShape('elite').stagesPerTour, 5);

// no results: dashes, zero totals, no positions, no zones
{
  const t = buildTable([mk(2), mk(1, true)], [], 'rookie');
  assert.equal(t.hasStandings, false);
  assert.ok(t.rows.every((r) => r.position === null && r.zone === null && r.total === 0 && r.cells.flat().every((c) => c === null) && r.tourTotals.every((c) => c === null)));
  assert.equal(t.rows.length, 2); assert.equal(t.tours, 3); assert.equal(t.rows[0].cells[0].length, 3);
  assert.deepEqual(homeRows(t).map((h) => h.row.manager.managerId), ['m01']); // only the own row
}
// dash vs 0 vs points; totals never double counted
{
  const pts = [stage(1, 1, 1, 10), stage(1, 1, 2, 5), stage(2, 1, 1, 7)];
  const t = buildTable([mk(1, true), mk(2), mk(3)], pts, 'rookie');
  const r1 = t.rows.find((r) => r.manager.managerId === 'm01')!, r2 = t.rows.find((r) => r.manager.managerId === 'm02')!, r3 = t.rows.find((r) => r.manager.managerId === 'm03')!;
  assert.deepEqual(r1.cells[0], [10, 5, null]); // E3 not ridden: dash
  assert.deepEqual(r2.cells[0], [7, 0, null]); // ridden, no points: 0
  assert.deepEqual(r3.cells[0], [0, 0, null]);
  assert.equal(r1.tourTotals[0], 15); assert.equal(r1.tourTotals[1], null); assert.equal(r1.total, 15); assert.equal(r2.total, 7);
  assert.deepEqual(t.rows.map((r) => r.position), [1, 2, 3]);
}
// manager-bound: swapping a rider changes nothing (rows carry no rider); equal points share a position; ids order ties
{
  const t = buildTable([mk(1), mk(2), mk(3)], [stage(1, 1, 1, 5), stage(2, 1, 1, 5), stage(3, 1, 1, 9)], 'rookie');
  assert.deepEqual(t.rows.map((r) => [r.manager.managerId, r.position]), [['m03', 1], ['m01', 2], ['m02', 2]]);
}
// reserved kinds only count in the total, not in the E columns
{
  const t = buildTable([mk(1)], [stage(1, 1, 1, 3), { managerId: 'm01', kind: 'tour_rank', tourNo: 1, stageNo: null, points: 20 }], 'rookie');
  assert.equal(t.rows[0].total, 23); assert.equal(t.rows[0].tourTotals[0], 3);
}
// zones: off by default, configurable, rookie never relegates, elite never promotes
{
  assert.equal(zoneFor(1, 50, 'rookie'), null);
  const rules = Object.fromEntries(LEAGUES.map((l) => [l, { promote: 8, relegate: 6 } as ZoneRule])) as Record<LeagueId, ZoneRule>;
  assert.equal(zoneFor(1, 50, 'rookie', rules), 'promotion'); assert.equal(zoneFor(8, 50, 'rookie', rules), 'promotion'); assert.equal(zoneFor(9, 50, 'rookie', rules), 'stay'); assert.equal(zoneFor(50, 50, 'rookie', rules), 'stay');
  assert.equal(zoneFor(44, 50, 'amateur', rules), 'stay'); assert.equal(zoneFor(45, 50, 'amateur', rules), 'relegation'); assert.equal(zoneFor(1, 50, 'amateur', rules), 'promotion');
  assert.equal(zoneFor(1, 50, 'elite', rules), 'stay'); assert.equal(zoneFor(50, 50, 'elite', rules), 'relegation');
  assert.equal(zoneFor(null, 50, 'amateur', rules), null); // no real standing -> no zone
  assert.deepEqual(leagueMoves('rookie'), { up: 'amateur', down: null }); assert.deepEqual(leagueMoves('pro'), { up: 'elite', down: 'continental' }); assert.deepEqual(leagueMoves('elite'), { up: null, down: 'pro' });
  assert.ok(LEAGUES.every((l) => ZONE_RULES[l].promote === null && ZONE_RULES[l].relegate === null));
}
// home: top five + own row below
{
  const ms = Array.from({ length: 12 }, (_, i) => mk(i + 1, i === 9));
  const pts = ms.map((m, i) => stage(i + 1, 1, 1, 100 - i));
  const h = homeRows(buildTable(ms, pts, 'rookie'));
  assert.deepEqual(h.map((x) => x.row.manager.managerId), ['m01', 'm02', 'm03', 'm04', 'm05', 'm10']);
  assert.equal(h[5].extra, true);
  const own = homeRows(buildTable(ms.map((m, i) => ({ ...m, isMe: i === 1 })), pts, 'rookie'));
  assert.equal(own.length, 5);
}
console.log('rankings table OK');
