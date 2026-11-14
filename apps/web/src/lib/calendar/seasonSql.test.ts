/**
 * Drift guard: the game season is computed in TWO places — lib/calendar/season.ts
 * (the app) and public.season_id_at() in supabase/migrations/20261114_01_... (the
 * database, which must not trust a client-supplied season). They must agree.
 * Reads the constants out of the SQL file, evaluates the same formula as the SQL
 * and compares it with getCurrentSeasonInfo() for every day of ~3 seasons.
 * Run with: npx tsx src/lib/calendar/seasonSql.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentSeasonInfo, SEASON_LENGTH_DAYS, SEASON_ONE_START } from './season';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const sql = readFileSync(join(process.cwd(), '..', '..', 'supabase', 'migrations', '20261114_01_tour_season_registrations.sql'), 'utf8');
const anchor = /date '(\d{4}-\d{2}-\d{2})'/.exec(sql)?.[1];
const length = Number(/::numeric \/ (\d+)\)/.exec(sql)?.[1]);

check('SQL anchor date equals SEASON_ONE_START', anchor === SEASON_ONE_START, `${anchor} vs ${SEASON_ONE_START}`);
check('SQL season length equals SEASON_LENGTH_DAYS', length === SEASON_LENGTH_DAYS, `${length} vs ${SEASON_LENGTH_DAYS}`);

// Same formula as public.season_id_at(): 'season-' || (greatest(0, floor(days / L)) + 1)
function sqlSeasonId(at: Date): string {
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const days = Math.round((day - Date.parse(`${anchor}T00:00:00Z`)) / 86_400_000);
  return `season-${Math.max(0, Math.floor(days / length)) + 1}`;
}

let mismatches = 0;
const start = Date.parse('2026-07-01T00:00:00Z');
for (let d = 0; d < 260; d++) {
  for (const h of [0, 12, 23]) {
    const at = new Date(start + d * 86_400_000 + h * 3_600_000 + (h === 23 ? 59 * 60_000 : 0));
    if (getCurrentSeasonInfo(at).seasonId !== sqlSeasonId(at)) mismatches++;
  }
}
check('app and SQL agree on the season for 260 days (incl. pre-season and boundaries)', mismatches === 0, `${mismatches} mismatches`);

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
