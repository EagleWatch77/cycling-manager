/**
 * Training security — application wiring (stage E1, migration 04).
 *
 * The REAL guarantees (RLS, column grants, locks, idempotency, concurrency,
 * exploit attempts) are proven against a real Postgres in
 * supabase/tests/training_security.test.sh. This file only guards the app
 * side: that no code path writes riders/training_plans directly, that nothing
 * reads the hidden columns, and that the app talks to the trusted functions
 * with no client-controlled season/week/plan data.
 * Run with: npx tsx src/lib/training/engineSecurity.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const SRC = path.join(__dirname, '../..');
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.|\.cli\./.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(SRC).map((p) => ({ p: path.relative(SRC, p), s: fs.readFileSync(p, 'utf8') }));
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const migration = fs.readFileSync(path.join(SRC, '../../../supabase/migrations/20261115_01_training_security.sql'), 'utf8');
const schemaSql = fs.readFileSync(path.join(SRC, '../../../supabase/schema.sql'), 'utf8');

// --- no direct writes from application code ---
const writeRe = (table: string) => new RegExp(`from\\(['"]${table}['"]\\)\\s*\\.(insert|update|upsert|delete)\\(`);
for (const table of ['riders', 'training_plans', 'rider_training_progress']) {
  const offenders = files.filter((f) => writeRe(table).test(f.s.replace(/\n\s*/g, ''))).map((f) => f.p);
  check(`no application code writes ${table} directly`, offenders.length === 0, offenders.join(', '));
}
const starOnRiders = files.filter((f) => /from\(['"]riders['"]\)\s*\.select\(\s*['"]\*['"]/.test(f.s.replace(/\n\s*/g, ''))).map((f) => f.p);
check("no `select('*')` on riders (hidden columns are not readable)", starOnRiders.length === 0, starOnRiders.join(', '));
const hiddenRead = files.filter((f) => /\.select\([^)]*\b(potential|trainability|professionalism|recovery)\b/.test(f.s) && /from\(['"]riders['"]\)/.test(f.s)).map((f) => f.p);
check('no code selects the hidden rider columns from riders', hiddenRead.length === 0, hiddenRead.join(', '));
check('no code touches rider_training_progress (closed to clients)', !files.some((f) => /rider_training_progress/.test(f.s) && !/^lib\/training\/(config|accumulator|growth)/.test(f.p) ), files.filter((f) => /rider_training_progress/.test(f.s)).map((f) => f.p).join(','));

// --- wiring ---
const stripComments = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const engine = stripComments(read('lib/training/engine.ts'));
check("engine calls only process_my_due_training with no arguments", /rpc\('process_my_due_training'\)/.test(engine) && !/process_training_plan|p_plan_id/.test(engine));
check('engine no longer decides which week is over (the database does)', !/isWeekOver|weekNumber\s*</.test(engine));
const repo = stripComments(read('lib/training/repository.ts'));
check("saving goes through save_my_training_plan with only type/focus/intensity", /rpc\('save_my_training_plan',\s*\{\s*p_week_type[^}]*p_focus[^}]*p_intensity[^}]*\}\)/s.test(repo) && !/p_season|p_week_number|player_id|applied_at/.test(repo.slice(repo.indexOf('save_my_training_plan'))));
const riderRepo = read('lib/rider/repository.ts');
check('starter rider is created through create_my_starter_rider', /rpc\('create_my_starter_rider'/.test(riderRepo));
check('rider reads use the explicit public column list', /RIDER_PUBLIC_COLUMNS/.test(riderRepo) && !/select\('\*'\)/.test(riderRepo));
check('estimates come from my_rider_estimates()', /rpc\('my_rider_estimates'\)/.test(riderRepo));
check('StoredRider carries no raw hidden values', !/potential:\s*number|trainability:\s*number|professionalism:\s*number|recovery:\s*number/.test(riderRepo));
const ai = read('lib/rider/aiPeloton.ts');
check('AI fillers are created through the admin-only function', /rpc\('admin_generate_ai_riders'/.test(ai) && !/\.insert\(/.test(ai));
const adminRepo = read('lib/rider/adminRepository.ts');
check('admin pages read raw riders through admin_list_riders()', /rpc\('admin_list_riders'/.test(adminRepo) && !/from\('riders'\)/.test(adminRepo));

// --- the SQL text keeps the same shape (cheap guard; real behaviour is in the DB test) ---
check('migration drops the old client-callable process_training_plan', /drop function if exists public\.process_training_plan\(uuid\)/.test(migration));
check('internal apply function is revoked from every client role', /revoke all on function public\.apply_training_plan_internal\(uuid\) from public, anon, authenticated/.test(migration));
check('migration is appended to schema.sql unchanged', schemaSql.includes(migration.trim()));
check('accumulator threshold is still 12 in the moved function', /v_threshold constant numeric := 12;/.test(migration));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
