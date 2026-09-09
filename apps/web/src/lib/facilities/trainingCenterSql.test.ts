/**
 * Training Center V1 FINAL — SQL/TS sync canary (see the chat report,
 * "TRAINING CENTER CLOSE-OUT", item 11). process_training_plan()
 * (supabase/schema.sql) is the authoritative implementation;
 * lib/facilities/config.ts's trainingCenterMultiplier() is the
 * unit-tested TS mirror. This test reads both sources and cross-checks
 * the literal age-band boundaries, unlock levels, and bonus values — not
 * just that some variable exists — so a hand-edit to one side that
 * forgets the other fails loudly here.
 * Run with: npx tsx src/lib/facilities/trainingCenterSql.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  TRAINING_CENTER_AGE_BAND_MULTIPLIER, TRAINING_CENTER_AGE_BAND_UNLOCK_LEVEL,
} from './config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const schemaSql = fs.readFileSync(path.join(__dirname, '../../../../../supabase/schema.sql'), 'utf8');

// 1. The old flat, age-independent model is completely gone from the SQL — no per-level-only case statement remains.
check('schema.sql no longer has the old flat per-level case (when 1 then 0 / when 2 then 0.03 / ... / when 5 then 0.12)',
  !/when 1 then 0\s*\n\s*when 2 then 0\.03\s*\n\s*when 3 then 0\.06/.test(schemaSql));

// 2. The new age-banded v_training_bonus block exists and is keyed on v_age, not v_effective_training_level alone.
const bonusBlockMatch = schemaSql.match(/v_training_bonus := case\s*\n([\s\S]*?)\n\s*end;/);
check('schema.sql has the new age-banded v_training_bonus CASE block', !!bonusBlockMatch);
const bonusBlock = bonusBlockMatch?.[1] ?? '';
check('the block branches on v_age (not just facility level)', /v_age <= 23/.test(bonusBlock) && /v_age <= 27/.test(bonusBlock) && /v_age <= 31/.test(bonusBlock));

// 3. Age-band boundaries (23/27/31) match TS's own performanceAgeBand() bands exactly.
check('SQL 17-23 boundary (<=23) matches TS band', /v_age <= 23 then case when v_effective_training_level >= 2 then 0\.15/.test(bonusBlock));
check('SQL 24-27 boundary (<=27) matches TS band', /v_age <= 27 then case when v_effective_training_level >= 3 then 0\.10/.test(bonusBlock));
check('SQL 28-31 boundary (<=31) matches TS band', /v_age <= 31 then case when v_effective_training_level >= 4 then 0\.05/.test(bonusBlock));
check('SQL 32+ (else) branch matches TS band', /else case when v_effective_training_level >= 5 then 0\.03/.test(bonusBlock));

// 4. Unlock levels (2/3/4/5) and bonus values (0.15/0.10/0.05/0.03) match TS's TRAINING_CENTER_AGE_BAND_UNLOCK_LEVEL / _MULTIPLIER exactly.
check('TS unlock level for 17-23 is 2', TRAINING_CENTER_AGE_BAND_UNLOCK_LEVEL['17-23'] === 2);
check('TS unlock level for 24-27 is 3', TRAINING_CENTER_AGE_BAND_UNLOCK_LEVEL['24-27'] === 3);
check('TS unlock level for 28-31 is 4', TRAINING_CENTER_AGE_BAND_UNLOCK_LEVEL['28-31'] === 4);
check('TS unlock level for 32+ is 5', TRAINING_CENTER_AGE_BAND_UNLOCK_LEVEL['32+'] === 5);
check('TS multiplier for 17-23 is 1.15 (SQL bonus 0.15 = 1 + 0.15)', TRAINING_CENTER_AGE_BAND_MULTIPLIER['17-23'] === 1.15);
check('TS multiplier for 24-27 is 1.10 (SQL bonus 0.10)', TRAINING_CENTER_AGE_BAND_MULTIPLIER['24-27'] === 1.10);
check('TS multiplier for 28-31 is 1.05 (SQL bonus 0.05)', TRAINING_CENTER_AGE_BAND_MULTIPLIER['28-31'] === 1.05);
check('TS multiplier for 32+ is 1.03 (SQL bonus 0.03)', TRAINING_CENTER_AGE_BAND_MULTIPLIER['32+'] === 1.03);

// 5. Technical training's SQL branch never applies v_training_bonus — facility multiplier is 1 whenever week_type is not 'performance'.
check("schema.sql's v_facility_multiplier is 1 for any week_type other than 'performance'",
  /v_facility_multiplier := case when v_week_type = 'performance' then 1 \+ v_training_bonus else 1 end;/.test(schemaSql));

// 6. The old TRAINING_BONUS flat-percentage export is gone from the TS config entirely (dead code removed, not left as a misleading unused export).
const configTs = fs.readFileSync(path.join(__dirname, 'config.ts'), 'utf8');
check('config.ts no longer exports the old flat TRAINING_BONUS', !/export const TRAINING_BONUS/.test(configTs));

// 7. L5 retention prepared-but-unwired constant exists with the agreed value, and is provably not read by process_training_plan() yet (item 7 — must not be silently wired into fake decline math).
check('TRAINING_CENTER_L5_PERFORMANCE_DECLINE_REDUCTION constant is 0.15', /TRAINING_CENTER_L5_PERFORMANCE_DECLINE_REDUCTION = 0\.15/.test(configTs));
{
  const processFnBody = schemaSql.match(/create or replace function public\.process_training_plan[\s\S]*?\$\$;/)?.[0] ?? '';
  check('process_training_plan() does not reference any decline/retention logic (prepared-only, not wired up)',
    !/decline/i.test(processFnBody) && !/retention/i.test(processFnBody), `body length ${processFnBody.length}`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
