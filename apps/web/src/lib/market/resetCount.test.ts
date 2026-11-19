/** Exact number the admin reset can delete == the filter of resetAvailableMarketPool(): season_id = X, status 'available', acquired_rider_id null. */
import { countResettable, type MarketRowLike } from './resetCount';
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const row = (o: Partial<MarketRowLike>): MarketRowLike => ({ season_id: 'season-2', status: 'available', acquired_rider_id: null, ...o });
const rows: MarketRowLike[] = [
  row({}), row({}),                                          // never owned, this season: deletable
  row({ acquired_rider_id: 'r1' }),                          // returned rider with history: protected
  row({ status: 'reserved' }), row({ status: 'acquired', acquired_rider_id: 'r2' }), // reserved / owned: protected
  row({ season_id: 'season-1' }),                            // never owned but another season: not touched
];
check('counts only never-owned available riders of the season (2 of 6)', countResettable(rows, 'season-2') === 2, `${countResettable(rows, 'season-2')}`);
check('another season counts its own rows only', countResettable(rows, 'season-1') === 1);
check('returned riders are NOT counted (the old count would have said 3)', rows.filter((r) => r.season_id === 'season-2' && r.status === 'available').length === 3 && countResettable(rows, 'season-2') === 2);
check('nothing safe to delete -> 0', countResettable([row({ acquired_rider_id: 'x' }), row({ status: 'reserved' })], 'season-2') === 0);
check('empty market -> 0', countResettable([], 'season-2') === 0);
check('undefined acquired_rider_id (column missing) is treated as never owned only when null/undefined', countResettable([{ season_id: 'season-2', status: 'available' }], 'season-2') === 1);
console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
