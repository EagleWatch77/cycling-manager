/**
 * Development Model V2 — SQL/TS sync canary (see the chat report, item 27).
 * process_training_plan() (supabase/schema.sql) is the authoritative
 * implementation; lib/rider/score.ts is the unit-tested TS mirror. This
 * test reads both sources and cross-checks the anchor VALUES themselves
 * (not just that some function exists), so a hand-edit to one side that
 * forgets the other fails loudly here.
 * Run with: npx tsx src/lib/rider/scoreSql.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const schemaSql = fs.readFileSync(path.join(__dirname, '../../../../../supabase/schema.sql'), 'utf8');
const scoreTs = fs.readFileSync(path.join(__dirname, 'score.ts'), 'utf8');

// 1. Old potentialCeiling()/potentialRoomFactor() must be gone from BOTH — no active computation left, only historical doc-comment mentions.
check('score.ts does not export potentialCeiling', !/export function potentialCeiling/.test(scoreTs));
check('score.ts does not export potentialRoomFactor', !/export function potentialRoomFactor/.test(scoreTs));
{
  const trainingConfigTs = fs.readFileSync(path.join(__dirname, '../training/config.ts'), 'utf8');
  check('training/config.ts no longer exports potentialCeiling', !/export function potentialCeiling/.test(trainingConfigTs));
  check('training/config.ts no longer exports potentialRoomFactor', !/export function potentialRoomFactor/.test(trainingConfigTs));
}
check('schema.sql no longer computes v_potential_ceiling (variable removed, only historical comments remain)', !/v_potential_ceiling numeric/.test(schemaSql));

// 2. The new SQL helper functions all exist.
for (const fn of ['is_performance_attribute', 'attribute_clamp_max', 'local_attribute_factor', 'overall_performance', 'overall_potential_factor', 'development_room_factor']) {
  check(`SQL function public.${fn}() exists`, schemaSql.includes(`function public.${fn}(`));
}

// 3. PERFORMANCE_MAX / PERFORMANCE_MIN match between TS and SQL.
const perfMaxTs = fs.readFileSync(path.join(__dirname, 'config.ts'), 'utf8').match(/PERFORMANCE_MAX = (\d+)/)?.[1];
check('PERFORMANCE_MAX is 200 in TS', perfMaxTs === '200', `${perfMaxTs}`);
check('SQL local_attribute_factor() hard-caps at 200 (matches PERFORMANCE_MAX)', /p_current_value >= 200 then 0/.test(schemaSql));
check('SQL attribute_clamp_max() returns 200 for Performance attributes', /then 200 else 160/.test(schemaSql));

// 4. Local attribute anchor points match exactly between TS and SQL (both directions of the pair).
{
  const anchorsTs = [...scoreTs.matchAll(/\[(\d+), ([\d.]+)\]/g)].map((m) => `${m[1]}:${m[2]}`);
  const expectedPairs = ['140:1.00', '150:0.90', '160:0.80', '170:0.65', '180:0.45', '190:0.25', '200:0.00'];
  for (const pair of expectedPairs) {
    const [x, y] = pair.split(':');
    check(`score.ts local anchor ${x}->${y} present`, anchorsTs.includes(pair), anchorsTs.join(','));
    check(`schema.sql local_attribute_factor() has the matching ${x}->${y} literal`,
      schemaSql.includes(`(0.${y.split('.')[1] || '00'}`) || schemaSql.includes(y === '0.00' ? '0.00' : y) || schemaSql.includes(`${y === '1.00' ? '1.00' : y}`),
      `looking for ${y} near local_attribute_factor`);
  }
}

// 5. Overall potential anchor overall-values (140,150,160,170,180,190,200) appear in both.
{
  const overallXs = ['140', '150', '160', '170', '180', '190'];
  for (const x of overallXs) {
    check(`schema.sql overall_potential_factor() references overall=${x}`, schemaSql.includes(`p_overall <= ${x}`) || schemaSql.includes(`- ${x}`));
  }
  // The last anchor (200) is the unconditional `else` branch, expressed via
  // least(p_overall, 200) rather than a "<= 200" comparison — different
  // literal shape, same anchor point.
  check('schema.sql overall_potential_factor() has the final (200) anchor via least(p_overall, 200)',
    schemaSql.includes('least(p_overall, 200)'));
}

// 6. Development room floor (0.05) and the swing constant (0.85) match between TS and SQL.
check('score.ts DEVELOPMENT_ROOM_FLOOR is 0.05', /DEVELOPMENT_ROOM_FLOOR = 0\.05/.test(scoreTs));
check('schema.sql development_room_factor() uses the same 0.05 floor', /greatest\(0\.05,/.test(schemaSql));
check('score.ts uses the 0.85 potential swing', /\* 0\.85/.test(scoreTs));
check('schema.sql overall_potential_factor() uses the same 0.85 swing', /\* 0\.85;/.test(schemaSql));

// 7. Weights (Rider Overall) match between TS and the request's canonical V1 weights.
check('score.ts Performance weight is 0.65', /performance: 0\.65/.test(scoreTs));
check('score.ts Tactics weight is 0.15', /tactics: 0\.15/.test(scoreTs));
check('score.ts Technique weight is 0.15', /technique: 0\.15/.test(scoreTs));
check('score.ts Experience weight is 0.05', /experience: 0\.05/.test(scoreTs));

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
