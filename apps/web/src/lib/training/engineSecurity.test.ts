/**
 * Training processing security — round 2 hardening (see the chat report).
 *
 * There is no live Postgres instance in this environment (consistent with
 * every other DB-level guarantee in this codebase's test suite — see e.g.
 * capMath.test.ts's own note), so the actual runtime enforcement
 * (ownership check, authoritative raw computation, idempotency) cannot be
 * exercised end-to-end here. What CAN be verified without a database is
 * that the ATTACK SURFACE ITSELF IS GONE — the RPC's function signature
 * and its one call site structurally accept nothing but a plan id, so
 * there is no parameter left through which a client could ever send a
 * forged raw/primary_attr/secondary_attr value. This test reads the real
 * source files and fails loudly if that ever regresses (e.g. someone adds
 * a parameter back to "fix a bug" without re-reading the security report).
 *
 * Run with: npx tsx src/lib/training/engineSecurity.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

const schemaSql = fs.readFileSync(path.join(__dirname, '../../../../../supabase/schema.sql'), 'utf8');
const engineTs = fs.readFileSync(path.join(__dirname, 'engine.ts'), 'utf8');

// 1. The hardened function signature takes ONLY a plan id — no raw growth,
// no attribute name, of any kind, can be passed in by a caller.
{
  const sigMatch = schemaSql.match(/create or replace function public\.process_training_plan\(([^)]*)\)/);
  check('process_training_plan() signature exists', !!sigMatch);
  const params = sigMatch?.[1]?.trim() ?? '';
  check('the ONLY parameter is p_plan_id uuid — no raw/attribute params exist to spoof', params === 'p_plan_id uuid', `got: "${params}"`);
}

// 2. The OLD, vulnerable 5-parameter overload is explicitly dropped, not
// just shadowed — Postgres overloads by signature, so without this the
// old raw-trusting version would remain callable forever.
check('the old 5-parameter overload is explicitly DROPped before the new one is created',
  /drop function if exists public\.process_training_plan\(uuid,\s*numeric,\s*text,\s*numeric,\s*numeric\)/.test(schemaSql));

// 3. Ownership check: the function must verify the plan's rider belongs to auth.uid().
check('process_training_plan() verifies rider ownership against auth.uid()',
  /v_owner_id is null or v_owner_id <> auth\.uid\(\)/.test(schemaSql) || /player_id\s*=\s*auth\.uid\(\)/.test(schemaSql));

// 4. Authoritative raw growth is computed FROM PERSISTED DATA inside the
// function (trainability/professionalism/age/potential/facility level),
// never accepted as input — spot-check that the real formula factors are
// all present as SQL computations, not parameters.
for (const factor of ['v_trainability_factor', 'v_professionalism_factor', 'v_age_factor', 'v_potential_room_factor', 'v_facility_multiplier']) {
  check(`raw growth computation includes ${factor} (computed, not passed in)`, schemaSql.includes(factor));
}
check('primary attribute comes from training_plans.focus, never a parameter',
  /v_primary_attr\s*:=\s*v_focus/.test(schemaSql));
check('secondary attribute comes from a fixed CASE mapping, never a parameter',
  /v_secondary_attr\s*:=\s*case v_primary_attr/.test(schemaSql));

// 5. The RPC's one real call site (lib/training/engine.ts) sends nothing
// but the plan id — if a future edit adds a second argument, this fails.
{
  const callMatch = engineTs.match(/supabase\.rpc\('process_training_plan',\s*\{([^}]*)\}\)/);
  check("engine.ts's RPC call exists", !!callMatch);
  const args = callMatch?.[1]?.trim() ?? '';
  check('engine.ts sends ONLY p_plan_id to process_training_plan — no raw/attribute argument', /^p_plan_id:\s*plan\.id,?$/.test(args), `got: "${args}"`);
}

// 6. Idempotency: applied_at is checked before any mutation, and the
// early-return path touches nothing (a repeated call on an already-applied
// plan is a true no-op, not just "returns the same numbers again").
{
  const idempotencyGuardIdx = schemaSql.indexOf('if v_plan_applied_at is not null then');
  const firstMutationIdx = schemaSql.indexOf('insert into public.rider_training_progress');
  check('the applied_at idempotency check appears BEFORE the first progress/attribute mutation',
    idempotencyGuardIdx !== -1 && firstMutationIdx !== -1 && idempotencyGuardIdx < firstMutationIdx,
    `guard@${idempotencyGuardIdx} mutation@${firstMutationIdx}`);
}

// 7. Season aging RPC (round 1 fix, re-verified here): also takes zero parameters.
{
  const seasonSigMatch = schemaSql.match(/create or replace function public\.process_season_aging\(([^)]*)\)/);
  check('process_season_aging() also takes zero parameters (round 1 fix still in place)', seasonSigMatch?.[1]?.trim() === '', `got: "${seasonSigMatch?.[1]}"`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
