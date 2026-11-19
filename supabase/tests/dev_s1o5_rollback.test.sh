#!/usr/bin/env bash
# ROLLBACK of S1+O5 (manual_rollbacks/ROLLBACK_S1O5_rozvoj.sql): after rollback the function is byte-identical to the one before S1+O5; no data changes.
# (setup copied from development_v2.test.sh) Development model V2 — SQL vs TypeScript parity, switch behaviour, no-plan week, ageing. REAL local Postgres, never a real database.
#   REF=/path/ref.json bash supabase/tests/development_v2.test.sh      (run as a non-root OS user, e.g. postgres)
#   REF = output of apps/web/src/lib/training/development/dbParityV2.cli.ts (generated here when REF is not given and npx works)
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; REPO="$(cd "$ROOT/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}; PORT=${PGTEST_PORT:-5498}
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS  $1"; }
bad() { fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
has() { echo "$2" | grep -qi -- "$3" && ok "$1" || bad "$1" "$(echo "$2" | tr '\n' ' ' | cut -c1-200)"; }
psqlc() { psql -h "$DIR" -p $PORT -U postgres -d "$1" -qtA -v ON_ERROR_STOP=1 "${@:2}" 2>&1; }
q()  { psqlc t -c "$1"; }
as() { printf "set role authenticated;\nselect set_config('request.jwt.claim.sub','%s',false);\n%s\n" "$1" "$2" | psqlc t | tail -n +2; }
cleanup() { "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1; }
trap cleanup EXIT

"$PGBIN/initdb" -D "$DIR/data" -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
cat > "$DIR/stub.sql" <<'SQL'
do $x$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $x$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
SQL
psqlc postgres -c "create database t" >/dev/null; psqlc t -f "$DIR/stub.sql" >/dev/null || { echo "stub failed"; exit 1; }
psqlc t -f "$ROOT/schema.sql" >/dev/null 2>&1 || { echo "schema.sql failed to apply"; exit 1; }
ok "current production schema.sql applies"

echo "== migration"
psqlc t -f "$ROOT/migrations/20261117_01_development_model_v2.sql" >"$DIR/m1.out" 2>&1 && ok "migration applies on the production schema" || { bad "migration applies" "$(tail -3 "$DIR/m1.out")"; exit 1; }
psqlc t -f "$ROOT/migrations/20261117_01_development_model_v2.sql" >/dev/null 2>&1 && ok "migration is idempotent (second run)" || bad "second run" "$(psqlc t -f "$ROOT/migrations/20261117_01_development_model_v2.sql" 2>&1 | tail -2)"
eq "switch is OFF by default" "$(q "select public.development_model_enabled()")" "f"
eq "existing riders/plans untouched: vitality column defaults to the neutral 50" "$(q "select column_default from information_schema.columns where table_name='riders' and column_name='vitality'")" "50"

mkplayer() { q "insert into auth.users default values returning id" | head -1; }
ATTRS() { python3 -c "
import json
keys='climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding roughSurface wetHandling experience'.split()
print(json.dumps({k:$1 for k in keys}))"; }
COND='{"energy":70,"fatigue":30,"form":50,"fitness":60,"morale":70}'
mkrider() { # player age level arch po tr pr rec vit profile-json
  local pf="${11:-}"; [ -z "$pf" ] && pf='{}'
  q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery, vitality, aptitude_profile, created_at) values ('$1','T','$2','Slovakia','SK',$3,'$(ATTRS $4)','$COND','$COND','$5',$6,$7,$8,$9,${10}, '$pf', now() - interval '400 days') returning id" | head -1; }
A=$(mkplayer); B=$(mkplayer); C=$(mkplayer); D=$(mkplayer); E=$(mkplayer); F=$(mkplayer)
echo "== migrations 03 + 04 (final state): the shared budget 58/18/14/10 % replaces the coefficient model"
psqlc t -f "$ROOT/migrations/20261117_03_rider_state_model.sql" >"$DIR/m3.out" 2>&1 && ok "migration 03 applies" || { bad "migration 03" "$(tail -3 "$DIR/m3.out")"; exit 1; }
psqlc t -f "$ROOT/migrations/20261117_04_training_plans_calendar.sql" >"$DIR/m4.out" 2>&1 && ok "migration 04 applies" || { bad "migration 04" "$(tail -3 "$DIR/m4.out")"; exit 1; }

echo "== rollback of S1 + O5"
fdef() { q "select md5(prosrc) from pg_proc where oid = 'public.apply_development_plan_v2(uuid)'::regprocedure"; }
BEFORE=$(fdef)
eq "before S1+O5 the function has the old cap slope and no helper" "$(q "select (prosrc like '%c_cap_slope constant float8 := 1.25%')::text||':'||(prosrc not like '%dev_phys_room%')::text from pg_proc where oid='public.apply_development_plan_v2(uuid)'::regprocedure")" "true:true"
psqlc t -f "$ROOT/migrations/20261119_04_dev_cap_s1_youth_floor_o5.sql" >"$DIR/m19.out" 2>&1 && ok "S1+O5 applies" || { bad "S1+O5 applies" "$(tail -3 "$DIR/m19.out")"; exit 1; }
AFTER=$(fdef)
[ "$BEFORE" != "$AFTER" ] && ok "S1+O5 really changed the function" || bad "S1+O5 changed the function" "same md5"
eq "S1+O5 is active (slope 1.5 and helper used)" "$(q "select (prosrc like '%c_cap_slope constant float8 := 1.5%')::text||':'||(prosrc like '%dev_phys_room%')::text from pg_proc where oid='public.apply_development_plan_v2(uuid)'::regprocedure")" "true:true"
# a rider with some state, to prove that the rollback touches no data
A=$(q "insert into auth.users default values returning id" | head -1)
q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$A','R','B','Slovakia','SK',19,'{\"climbing\":120,\"hills\":110}','{\"energy\":70,\"fatigue\":30}','{\"energy\":70,\"fatigue\":30}','climber',30,50,50,50)" >/dev/null
SNAP=$(q "select md5(string_agg(r::text, '|' order by id)) from public.riders r")
psqlc t -f "$ROOT/diagnostics/market_launch/manual_rollbacks/ROLLBACK_S1O5_rozvoj.sql" >"$DIR/m19r.out" 2>&1 && ok "rollback applies" || { bad "rollback applies" "$(tail -3 "$DIR/m19r.out")"; exit 1; }
eq "after the rollback the function is BYTE-IDENTICAL to the one before S1+O5" "$(fdef)" "$BEFORE"
eq "the S1+O5 helper function is gone" "$(q "select count(*) from pg_proc where proname='dev_phys_room'")" "0"
eq "rollback changed no rider data" "$(q "select md5(string_agg(r::text, '|' order by id)) from public.riders r")" "$SNAP"
psqlc t -f "$ROOT/diagnostics/market_launch/manual_rollbacks/ROLLBACK_S1O5_rozvoj.sql" >/dev/null 2>&1 && ok "rollback is idempotent (second run)" || bad "rollback second run" ""
eq "function still not callable by players" "$(q "select has_function_privilege('authenticated','public.apply_development_plan_v2(uuid)','execute')::text")" "false"
psqlc t -f "$ROOT/migrations/20261119_04_dev_cap_s1_youth_floor_o5.sql" >/dev/null 2>&1 && ok "S1+O5 can be applied again after a rollback" || bad "re-apply" ""
eq "...and is active again" "$(q "select (prosrc like '%dev_phys_room%')::text from pg_proc where oid='public.apply_development_plan_v2(uuid)'::regprocedure")" "true"

echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
