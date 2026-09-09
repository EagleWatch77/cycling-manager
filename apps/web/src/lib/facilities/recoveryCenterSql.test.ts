/**
 * Recovery Center V1 FINAL — SQL/TS sync canary (see the chat report,
 * "REGENERAČNÉ CENTRUM CLOSE-OUT", item 19). process_training_plan()
 * (supabase/schema.sql) is the authoritative implementation;
 * lib/facilities/config.ts's recoveryCenterMultiplier() is the
 * unit-tested TS mirror. Also covers the rounding-model audit (item 12)
 * and the "no instant heal on upgrade" guarantee (item 14).
 * Run with: npx tsx src/lib/facilities/recoveryCenterSql.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { RECOVERY_MULTIPLIER, recoveryCenterMultiplier } from './config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const schemaSql = fs.readFileSync(path.join(__dirname, '../../../../../supabase/schema.sql'), 'utf8');

// 1. The SQL v_recovery_multiplier CASE block matches TS's RECOVERY_MULTIPLIER exactly.
const multBlockMatch = schemaSql.match(/v_recovery_multiplier := case v_effective_recovery_level\s*\n([\s\S]*?)\n\s*end;/);
check('schema.sql has the v_recovery_multiplier CASE block keyed on v_effective_recovery_level (not stored level)', !!multBlockMatch);
const multBlock = multBlockMatch?.[1] ?? '';
for (const level of [1, 2, 3, 4, 5] as const) {
  check(`SQL level ${level} -> ${RECOVERY_MULTIPLIER[level].toFixed(2)} matches TS recoveryCenterMultiplier(${level})`,
    new RegExp(`when ${level} then ${RECOVERY_MULTIPLIER[level].toFixed(2)}`).test(multBlock) && recoveryCenterMultiplier(level as 1 | 2 | 3 | 4 | 5) === RECOVERY_MULTIPLIER[level],
    multBlock);
}

// 2. v_effective_recovery_level is derived from the SAME league/team-center cap as training (item 6 — Rookie/Amateur/Continental/Pro/Elite -> 1/2/3/4/5).
check('v_effective_recovery_level := least(v_recovery_level, v_training_cap) — shared cap formula, not a bespoke one',
  /v_effective_recovery_level := least\(v_recovery_level, v_training_cap\);/.test(schemaSql));

// 3. Recovery days and training cost are NOT keyed by recovery level anywhere in the function — only by week_type/intensity.
const processFnBody = schemaSql.match(/create or replace function public\.process_training_plan[\s\S]*?\$\$;/)?.[0] ?? '';
check('v_recovery_days is set from week_type/intensity only, never from v_recovery_level or v_effective_recovery_level',
  !/v_recovery_days\s*:=[^;]*v_(effective_)?recovery_level/.test(processFnBody));
check('v_training_energy_cost / v_training_fatigue_gain are never keyed by recovery level',
  !/v_training_(energy_cost|fatigue_gain)\s*:=[^;]*v_(effective_)?recovery_level/.test(processFnBody));

// 4. Rounding audit (item 12): the new Energy/Fatigue are rounded BEFORE clamping, in both TS and SQL, so a fractional Recovery Center multiplier (1.05-1.20) can never leave a fractional value in riders.condition.
check("SQL rounds via round() before clamping: least(100, greatest(0, round(...)))", /v_new_energy := least\(100, greatest\(0, round\(v_energy \+ v_energy_delta\)\)\);/.test(processFnBody));
check("SQL rounds Fatigue the same way", /v_new_fatigue := least\(100, greatest\(0, round\(v_fatigue \+ v_fatigue_delta\)\)\);/.test(processFnBody));
{
  const conditionTs = fs.readFileSync(path.join(__dirname, '../training/condition.ts'), 'utf8');
  check('TS applyConditionDelta() rounds via Math.round() before clamp100() — same order as SQL', /Math\.round\(current\.energy \+ delta\.energyDelta\)/.test(conditionTs) && /clamp100\(Math\.round/.test(conditionTs));
}

// 5. No instant heal on upgrade (item 14): upgrade_facility() must never touch public.riders or riders.condition — only public.player_facilities.
{
  const upgradeFnBody = schemaSql.match(/create or replace function public\.upgrade_facility[\s\S]*?\$\$;/)?.[0] ?? '';
  check('upgrade_facility() function body exists', upgradeFnBody.length > 0);
  check('upgrade_facility() never references public.riders or riders.condition — a level-up cannot instantly change any rider\'s Energy/Fatigue',
    !/public\.riders/.test(upgradeFnBody) && !/riders\.condition/.test(upgradeFnBody), `body length ${upgradeFnBody.length}`);
  check('upgrade_facility() only writes to public.player_facilities', /update public\.player_facilities/.test(upgradeFnBody));
}

// 6. Old fake percentage display text is gone.
{
  const pageTs = fs.readFileSync(path.join(__dirname, '../../app/facilities/page.tsx'), 'utf8');
  check("facilities/page.tsx no longer references the old RECOVERY_BONUS percentage import", !/RECOVERY_BONUS/.test(pageTs));
  check("config.ts no longer exports the old RECOVERY_BONUS", !/export const RECOVERY_BONUS/.test(fs.readFileSync(path.join(__dirname, 'config.ts'), 'utf8')));
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
