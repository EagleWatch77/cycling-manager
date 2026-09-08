/**
 * SECONDARY_ATTRIBUTE canonical mapping canary — Weekly Training V1 stays
 * PERFORMANCE-ONLY (game-design decision, see the chat report: "Weekly
 * Training V1 zostáva zatiaľ PERFORMANCE-ONLY" / "Tactics sa priamo
 * trénovať NEBUDÚ"). Performance training must never be a backdoor way to
 * raise Tactics/Technique, so every one of the 7 active (Performance-primary,
 * i.e. reachable as a real `focus` — see PERFORMANCE_FOCUS and
 * repository.ts's save-time validation) mappings must point at another
 * Performance attribute, in both lib/training/config.ts (TS) and
 * process_training_plan()'s CASE mapping (SQL, supabase/schema.sql) — kept
 * in sync by hand, so this test cross-checks the literal values between the
 * two sources, not just presence.
 * Run with: npx tsx src/lib/training/secondaryMapping.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { SECONDARY_ATTRIBUTE, PERFORMANCE_FOCUS } from './config';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const schemaSql = fs.readFileSync(path.join(__dirname, '../../../../../supabase/schema.sql'), 'utf8');

const CANONICAL_ACTIVE_MAPPING: Record<string, string> = {
  climbing: 'endurance',
  hills: 'acceleration',
  flat: 'timeTrial',
  sprint: 'acceleration',
  timeTrial: 'endurance',
  endurance: 'timeTrial',
  acceleration: 'sprint',
};

// 1. TS SECONDARY_ATTRIBUTE matches the canonical mapping exactly for all 7 active focuses.
for (const [primary, expectedSecondary] of Object.entries(CANONICAL_ACTIVE_MAPPING)) {
  check(`config.ts SECONDARY_ATTRIBUTE.${primary} === '${expectedSecondary}'`,
    SECONDARY_ATTRIBUTE[primary as keyof typeof SECONDARY_ATTRIBUTE] === expectedSecondary,
    `got: ${SECONDARY_ATTRIBUTE[primary as keyof typeof SECONDARY_ATTRIBUTE]}`);
}

// 2. Every active (Performance) focus's secondary is ALSO a Performance attribute — no Tactics/Technique backdoor.
for (const primary of PERFORMANCE_FOCUS) {
  const secondary = SECONDARY_ATTRIBUTE[primary];
  check(`${primary}'s secondary ('${secondary}') is a Performance attribute, never Tactics/Technique`,
    !!secondary && (PERFORMANCE_FOCUS as readonly string[]).includes(secondary));
}

// 3. SQL process_training_plan()'s CASE mapping has the same 7 active pairs, literally.
{
  const caseBlockMatch = schemaSql.match(/v_secondary_attr := case v_primary_attr([\s\S]*?)end;/);
  check('schema.sql v_secondary_attr CASE block exists', !!caseBlockMatch);
  const caseBlock = caseBlockMatch?.[1] ?? '';
  for (const [primary, expectedSecondary] of Object.entries(CANONICAL_ACTIVE_MAPPING)) {
    check(`schema.sql CASE: when '${primary}' then '${expectedSecondary}'`,
      new RegExp(`when '${primary}' then '${expectedSecondary}'`).test(caseBlock));
  }
  // The old, removed backdoor mappings must not reappear.
  check('schema.sql no longer maps timeTrial -> energyManagement', !/when 'timeTrial' then 'energyManagement'/.test(caseBlock));
  check('schema.sql no longer maps endurance -> energyManagement', !/when 'endurance' then 'energyManagement'/.test(caseBlock));
}

// 4. The old backdoor mappings are gone from the TS config too.
check('config.ts no longer maps timeTrial -> energyManagement', SECONDARY_ATTRIBUTE.timeTrial !== 'energyManagement');
check('config.ts no longer maps endurance -> energyManagement', SECONDARY_ATTRIBUTE.endurance !== 'energyManagement');

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
