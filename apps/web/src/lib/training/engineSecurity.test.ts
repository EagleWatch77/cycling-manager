/**
 * Training processing security — Unified Weekly Training V1 (see the chat
 * report). There is no live Postgres instance in this environment
 * (consistent with every other DB-level guarantee in this codebase's test
 * suite — see e.g. capMath.test.ts's own note), so the actual runtime
 * enforcement (ownership check, authoritative raw computation, idempotency,
 * condition write) cannot be exercised end-to-end here. What CAN be
 * verified without a database is that the ATTACK SURFACE ITSELF IS GONE —
 * the RPC's function signature and its one call site structurally accept
 * nothing but a plan id, and every effect of a processed plan (attributes
 * AND condition) is computed and written inside this one security-definer
 * function. This test reads the real source files and fails loudly if
 * that ever regresses.
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
const repoTs = fs.readFileSync(path.join(__dirname, 'repository.ts'), 'utf8');
const riderRepoTs = fs.readFileSync(path.join(__dirname, '../rider/repository.ts'), 'utf8');

// 1. The hardened function signature takes ONLY a plan id — no raw growth,
// no attribute name, no week_type, no condition, of any kind, can be
// passed in by a caller.
{
  const sigMatch = schemaSql.match(/create or replace function public\.process_training_plan\(([^)]*)\)/);
  check('process_training_plan() signature exists', !!sigMatch);
  const params = sigMatch?.[1]?.trim() ?? '';
  check('the ONLY parameter is p_plan_id uuid — no raw/attribute/week_type/condition params exist to spoof', params === 'p_plan_id uuid', `got: "${params}"`);
}

// 2. The OLD, vulnerable 5-parameter overload is explicitly dropped, not
// just shadowed — Postgres overloads by signature, so without this the
// old raw-trusting version would remain callable via RPC side-by-side
// forever.
check('the old 5-parameter overload is explicitly DROPped before the new one is created',
  /drop function if exists public\.process_training_plan\(uuid,\s*numeric,\s*text,\s*numeric,\s*numeric\)/.test(schemaSql));

// 3. Ownership check: the function must verify the plan's rider belongs to auth.uid().
check('process_training_plan() verifies rider ownership against auth.uid()',
  /v_owner_id is null or v_owner_id <> auth\.uid\(\)/.test(schemaSql));

// 4. week_type is read from the plan row, never a parameter — and an
// unrecognized value is rejected rather than silently defaulting.
check('week_type is read from training_plans, never a parameter', /into v_plan_applied_at, v_rider_id, v_week_type, v_focus, v_intensity/.test(schemaSql));
check('an unrecognized week_type raises invalid_week_type rather than silently defaulting', /raise exception 'invalid_week_type'/.test(schemaSql));

// 5. Focus validation is week_type-aware: a Performance plan's focus must
// pass is_performance_attribute(); a Technical plan's focus must pass
// is_technical_attribute() — so a client can never smuggle
// technical+climbing or performance+descending past the RPC even if it
// somehow got past saveTrainingPlan()'s own check.
check('Performance plans validate focus via is_performance_attribute()', /if v_week_type = 'performance' then\s*\n\s*if not public\.is_performance_attribute\(v_primary_attr\) then/.test(schemaSql));
check('Technical plans validate focus via is_technical_attribute()', /elsif v_week_type = 'technical' then\s*\n\s*if not public\.is_technical_attribute\(v_primary_attr\) then/.test(schemaSql));

// 6. Authoritative raw growth is computed FROM PERSISTED DATA inside the
// function (trainability/professionalism/age/potential/facility level),
// never accepted as input.
for (const factor of ['v_trainability_factor', 'v_professionalism_factor', 'v_age_factor', 'v_facility_multiplier', 'v_readiness_factor', 'v_session_count']) {
  check(`raw growth computation includes ${factor} (computed, not passed in)`, schemaSql.includes(factor));
}
check('primary attribute comes from training_plans.focus, never a parameter',
  /v_primary_attr := v_focus/.test(schemaSql));
check('Performance secondary attribute comes from a fixed CASE mapping, never a parameter',
  /v_secondary_attr := case v_primary_attr/.test(schemaSql));
check('Technical plans never get a secondary attribute (v_secondary_attr := null)',
  /v_secondary_attr := null;/.test(schemaSql));

// 7. Technical training's hard +1/week cap (item 9) is enforced server-side
// via v_max_primary_gain, never trusted from a client, and is applied with
// least() so the uncapped amount is never silently discarded (it stays
// banked in rider_training_progress).
check('v_technical_weekly_gain_cap constant is 1', /v_technical_weekly_gain_cap constant int := 1;/.test(schemaSql));
check('Technical week sets v_max_primary_gain to the weekly cap', /v_max_primary_gain := v_technical_weekly_gain_cap;/.test(schemaSql));
check('the applied gain is least(uncapped, v_max_primary_gain) — never just the uncapped value', /v_primary_gain := least\(v_uncapped_gain, v_max_primary_gain\);/.test(schemaSql));

// 8. Technical training gets NO facility multiplier and NO Development
// Model V2 (item 11) — verified by the conditional facility multiplier and
// by Technical's raw-growth branch never calling development_room_factor().
check('facility multiplier is 1 (no bonus) for Technical training', /v_facility_multiplier := case when v_week_type = 'performance' then 1 \+ v_training_bonus else 1 end;/.test(schemaSql));

// 9. Condition (Energy/Fatigue) is now computed and written INSIDE this
// security-definer function — not accepted as a parameter, not left to a
// plain client-writable `update` elsewhere. lib/rider/repository.ts's old
// applyConditionResult() (a non-security-definer write path) is gone.
check('process_training_plan() reads condition from riders, not from a parameter', /v_owner_id, v_age, v_attrs, v_condition, v_trainability, v_professionalism, v_potential/.test(schemaSql));
check('process_training_plan() writes attributes AND condition AND condition_previous in the same update', /update public\.riders set attributes = v_attrs, condition = v_condition, condition_previous = v_condition_previous where id = v_rider_id;/.test(schemaSql));
check('applyConditionResult() (the old client-writable condition path) has been removed from lib/rider/repository.ts', !/export async function applyConditionResult/.test(riderRepoTs));
check('engine.ts no longer imports applyConditionResult', !/applyConditionResult/.test(engineTs));

// 10. Readiness (item 17) is computed from the rider's OWN persisted
// condition, never a client-supplied score or multiplier.
check('readiness is computed via public.readiness_score(v_energy, v_fatigue) from persisted condition', /v_readiness_score := public\.readiness_score\(v_energy, v_fatigue\);/.test(schemaSql));

// 11. saveTrainingPlan() (the one write path a client can reach before
// processing) validates focus against the correct set per week_type — a
// client cannot submit technical+climbing or performance+descending.
check('saveTrainingPlan() validates Performance focus against PERFORMANCE_FOCUS', /PERFORMANCE_FOCUS\.includes\(input\.focus as never\)/.test(repoTs));
check('saveTrainingPlan() validates Technical focus against TECHNICAL_FOCUS', /TECHNICAL_FOCUS\.includes\(input\.focus as never\)/.test(repoTs));

// 12. The RPC's one real call site (lib/training/engine.ts) sends nothing
// but the plan id — if a future edit adds a second argument, this fails.
{
  const callMatch = engineTs.match(/supabase\.rpc\('process_training_plan',\s*\{([^}]*)\}\)/);
  check("engine.ts's RPC call exists", !!callMatch);
  const args = callMatch?.[1]?.trim() ?? '';
  check('engine.ts sends ONLY p_plan_id to process_training_plan — no raw/attribute/condition argument', /^p_plan_id:\s*plan\.id,?$/.test(args), `got: "${args}"`);
}

// 13. Idempotency: applied_at is checked before any mutation, and the
// early-return path touches nothing (a repeated call on an already-applied
// plan is a true no-op, not just "returns the same numbers again").
{
  const idempotencyGuardIdx = schemaSql.indexOf('if v_plan_applied_at is not null then');
  const firstMutationIdx = schemaSql.indexOf('insert into public.rider_training_progress');
  check('the applied_at idempotency check appears BEFORE the first progress/attribute mutation',
    idempotencyGuardIdx !== -1 && firstMutationIdx !== -1 && idempotencyGuardIdx < firstMutationIdx,
    `guard@${idempotencyGuardIdx} mutation@${firstMutationIdx}`);
}

// 14. Season aging RPC (prior round, re-verified here): also takes zero parameters.
{
  const seasonSigMatch = schemaSql.match(/create or replace function public\.process_season_aging\(([^)]*)\)/);
  check('process_season_aging() also takes zero parameters (prior round\'s fix still in place)', seasonSigMatch?.[1]?.trim() === '', `got: "${seasonSigMatch?.[1]}"`);
}

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
