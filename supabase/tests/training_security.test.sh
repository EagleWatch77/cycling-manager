#!/usr/bin/env bash
# Training V1 / stage E1 — security tests against a REAL local Postgres
# (real RLS, column grants, security-definer functions, locks, concurrency).
# Supabase's `auth` schema and roles are stubbed; everything else is the real schema.
#
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/training_security.test.sh
#
# Scenario A (existing production DB): schema before the 2026-11-14 migrations +
#   legacy data, then migrations 01-04 in order, then 04 again (idempotence).
# Scenario B (fresh DB): full supabase/schema.sql; function + grant catalog must equal A.
# Needs a non-root OS user (e.g. run as `postgres`), node + `npx tsx` in apps/web
# (reference values come from the TypeScript code, so SQL and TS cannot drift).
# Never touches a real database.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}
PORT=${PGTEST_PORT:-5497}
SCHEMA="$ROOT/schema.sql"
BASE="$DIR/base_schema.sql"; sed '/^-- >>>>>>>> /,$d' "$SCHEMA" > "$BASE"
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS  $1"; }
bad() { fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
has() { echo "$2" | grep -qi -- "$3" && ok "$1" || bad "$1" "$(echo "$2" | tr '\n' ' ' | cut -c1-200)"; }
psqlc() { psql -h "$DIR" -p $PORT -U postgres -d "$1" -qtA -v ON_ERROR_STOP=1 "${@:2}" 2>&1; }
q()  { psqlc t -c "$1"; }                       # superuser (the migration owner)
as() { printf "set role authenticated;\nselect set_config('request.jwt.claim.sub','%s',false);\n%s\n" "$1" "$2" | psqlc t | tail -n +2; }
asanon() { printf "set role anon;\n%s\n" "$1" | psqlc t; }

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
-- Supabase gives every new table/function to anon + authenticated by default; reproduce that so the test proves the REVOKEs.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
SQL
for db in t fresh; do psqlc postgres -c "create database $db" >/dev/null; psqlc $db -f "$DIR/stub.sql" >/dev/null || { echo "stub failed"; exit 1; }; done

echo "== TS reference values"
(cd "$REPO/apps/web" && npx --no-install tsx src/lib/training/dbParity.cli.ts) > "$DIR/ref.json" 2>"$DIR/ref.err" || { echo "reference script failed"; cat "$DIR/ref.err"; exit 1; }
ref() { python3 -c "import json,sys; d=json.load(open('$DIR/ref.json')); print($1)"; }
ok "TypeScript reference values computed"

echo "== Scenario A: existing production database"
psqlc t -f "$BASE" >/dev/null 2>&1 || { echo "base schema failed to apply"; exit 1; }
for m in 20261114_01_tour_season_registrations 20261114_02_league_divisions 20261114_03_profiles_lockdown; do
  psqlc t -f "$ROOT/migrations/$m.sql" >/dev/null 2>&1 || { echo "migration $m failed"; exit 1; }
done
ok "schema before migration 04 + migrations 01-03 apply"

mkplayer() { q "insert into auth.users default values returning id" | head -1; }
P1=$(mkplayer); P2=$(mkplayer); P3=$(mkplayer); ADM=$(mkplayer); P4=$(mkplayer)
ATTRS=$(python3 - <<'PY'
import json
keys="climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding roughSurface wetHandling experience".split()
print(json.dumps({k:130 for k in keys}))
PY
)
COND='{"energy":70,"fatigue":30,"form":50,"fitness":60,"morale":70}'
mkrider() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','Test','$2','Slovakia','SK',20,'$ATTRS','$COND','$COND','allrounder',80,80,70,70) returning id" | head -1; }
R1=$(mkrider "$P1" One); R2=$(mkrider "$P2" Two); R4=$(mkrider "$P4" Four)
q "insert into public.admin_users (user_id) values ('$ADM')" >/dev/null
# AI filler with hidden values, and legacy plans created BEFORE the migration
AI=$(q "insert into public.riders (player_id, is_ai, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values (null,true,'Ai','Filler','Slovakia','SK',21,'$ATTRS','$COND','$COND','climber',90,90,90,90) returning id" | head -1)
q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity, applied_at, primary_attr, primary_gain, secondary_attr, secondary_gain) values ('$R1','season-1',2,'performance','sprint','light', now(),'sprint',1,'acceleration',0)" >/dev/null
BEFORE_PLANS=$(q "select count(*) from public.training_plans"); BEFORE_RIDERS=$(q "select count(*) from public.riders")
psqlc t -f "$ROOT/migrations/20261115_01_training_security.sql" >/dev/null 2>&1 && ok "migration 04 applies on top of legacy data" || { bad "migration 04 applies" "$(psqlc t -f "$ROOT/migrations/20261115_01_training_security.sql" | tail -3)"; exit 1; }
psqlc t -f "$ROOT/migrations/20261115_01_training_security.sql" >/dev/null 2>&1 && ok "migration 04 is idempotent (second run)" || bad "migration 04 second run" "$(psqlc t -f "$ROOT/migrations/20261115_01_training_security.sql" | tail -3)"
psqlc t -f "$ROOT/migrations/20261115_02_training_calendar_rules.sql" >/dev/null 2>&1 && ok "migration 05 applies on top of 04" || { bad "migration 05 applies" "$(psqlc t -f "$ROOT/migrations/20261115_02_training_calendar_rules.sql" | tail -3)"; exit 1; }
psqlc t -f "$ROOT/migrations/20261115_02_training_calendar_rules.sql" >/dev/null 2>&1 && ok "migration 05 is idempotent (second run)" || bad "migration 05 second run" "$(psqlc t -f "$ROOT/migrations/20261115_02_training_calendar_rules.sql" | tail -3)"
psqlc t -f "$ROOT/migrations/20261115_03_rider_development_tracking.sql" >/dev/null 2>&1 && ok "migration 06 (development tracking) applies on top of 05" || { bad "migration 06 applies" "$(psqlc t -f "$ROOT/migrations/20261115_03_rider_development_tracking.sql" | tail -3)"; exit 1; }
eq "no legacy plan deleted" "$(q "select count(*) from public.training_plans")" "$BEFORE_PLANS"
eq "no legacy rider deleted" "$(q "select count(*) from public.riders")" "$BEFORE_RIDERS"
eq "legacy applied plan keeps its gains" "$(q "select primary_gain||':'||secondary_gain||':'||(applied_at is not null) from public.training_plans where rider_id='$R1'")" "1:0:true"
eq "hidden values untouched in the table" "$(q "select potential||':'||trainability||':'||professionalism||':'||recovery from public.riders where id='$R1'")" "80:80:70:70"

echo "== 1. riders: no direct client writes"
has "update attributes is denied" "$(as $P1 "update public.riders set attributes = attributes || '{\"climbing\":200}' where player_id='$P1';")" "permission denied"
has "update condition is denied" "$(as $P1 "update public.riders set condition = '{\"energy\":100,\"fatigue\":0}' where player_id='$P1';")" "permission denied"
has "update hidden potential is denied" "$(as $P1 "update public.riders set potential = 95 where player_id='$P1';")" "permission denied"
has "update ownership (player_id) is denied" "$(as $P1 "update public.riders set player_id='$P2' where player_id='$P1';")" "permission denied"
has "update age is denied" "$(as $P1 "update public.riders set age = 18 where player_id='$P1';")" "permission denied"
has "direct insert of a rider is denied" "$(as $P3 "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$P3','X','Y','Slovakia','SK',20,'$ATTRS','$COND','$COND','allrounder',95,95,95,95);")" "permission denied"
has "direct insert of an AI filler is denied" "$(as $P3 "insert into public.riders (player_id, is_ai, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values (null,true,'X','Y','Slovakia','SK',20,'$ATTRS','$COND','$COND','allrounder',95,95,95,95);")" "permission denied"
has "delete of a rider is denied" "$(as $P1 "delete from public.riders where player_id='$P1';")" "permission denied"
eq "rider still has its original attributes" "$(q "select attributes->>'climbing' from public.riders where id='$R1'")" "130"

echo "== 2. hidden values are not readable through the API"
for col in potential trainability professionalism recovery; do
  has "select $col (own rider) is denied" "$(as $P1 "select $col from public.riders where player_id='$P1';")" "permission denied"
  has "select $col (AI rider) is denied" "$(as $P1 "select $col from public.riders where is_ai;")" "permission denied"
done
has "select * is denied" "$(as $P1 "select * from public.riders;")" "permission denied"
eq "public columns are readable: own rider + AI fillers only" "$(as $P1 "select count(*) from public.riders;")" "2"
eq "another player's rider is not visible" "$(as $P1 "select count(*) from public.riders where id='$R2';")" "0"
has "anon cannot read riders" "$(asanon "select id from public.riders;")" "permission denied"
has "rider_training_progress is closed to players" "$(as $P1 "select * from public.rider_training_progress;")" "permission denied"
has "rider_training_progress is closed to anon" "$(asanon "select * from public.rider_training_progress;")" "permission denied"
ESTIMATES=$(as $P1 "select potential_stars||':'||trainability_level||':'||professionalism_level||':'||recovery_level from public.my_rider_estimates();")
L80=$(ref "[x['level'] for x in d['levels'] if x['v']==80][0]"); L70=$(ref "[x['level'] for x in d['levels'] if x['v']==70][0]")
eq "my_rider_estimates returns only 1-5 levels (potential 80, trainability 80, professionalism 70, recovery 70)" "$ESTIMATES" "$L80:$L80:$L70:$L70"
SQLLV=$(q "select string_agg(public.rider_score_to_level(v)::text, ',' order by v) from generate_series(55,95) v")
eq "SQL 1-5 levels equal lib/rider/development.ts for every value 55-95" "$SQLLV" "$(ref "','.join(str(x['level']) for x in d['levels'])")"
eq "a player without a rider gets no estimates" "$(as $P3 "select count(*) from public.my_rider_estimates();")" "0"

echo "== 3. training_plans: no direct client writes"
has "direct plan insert is denied" "$(as $P1 "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) values ('$R1','season-99',1,'performance','climbing','hard');")" "permission denied"
has "plan on an invalid season is denied" "$(as $P1 "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) values ('$R1','garbage',99,'performance','climbing','hard');")" "permission denied"
has "direct plan update is denied" "$(as $P1 "update public.training_plans set applied_at = null where rider_id='$R1';")" "permission denied"
has "direct plan delete is denied" "$(as $P1 "delete from public.training_plans where rider_id='$R1';")" "permission denied"
eq "own plans stay readable" "$(as $P1 "select count(*) from public.training_plans;")" "1"

echo "== 4. save_my_training_plan"
CUR=$(q "select public.current_season_id()"); WK=$(q "select public.training_plannable_week(now())")
SAVED=$(as $P1 "select season_id||':'||week_number||':'||week_type||':'||focus||':'||intensity||':'||(applied_at is null) from public.save_my_training_plan('performance','climbing','normal');")
eq "valid plan: season + week come from the SQL calendar, owner from auth" "$SAVED" "$CUR:$WK:performance:climbing:normal:true"
eq "the plan belongs to the caller's rider" "$(q "select rider_id from public.training_plans where season_id='$CUR' and week_number=$WK and rider_id in ('$R1','$R2')")" "$R1"
has "a confirmed plan cannot be overwritten (even before processing)" "$(as $P1 "select * from public.save_my_training_plan('performance','sprint','hard');")" "already_planned"
eq "the confirmed plan kept its focus and intensity" "$(q "select focus||':'||intensity from public.training_plans where rider_id='$R1' and season_id='$CUR' and week_number=$WK")" "climbing:normal"
eq "one row per rider and week (no duplicate)" "$(q "select count(*) from public.training_plans where rider_id='$R1' and season_id='$CUR' and week_number=$WK")" "1"
eq "technical plan stores the placeholder intensity" "$(as $P2 "select week_type||':'||focus||':'||intensity from public.save_my_training_plan('technical','cornering','hard');")" "technical:cornering:light"
has "technical + performance focus is rejected" "$(as $P2 "select * from public.save_my_training_plan('technical','climbing','light');")" "invalid_focus"
has "performance + technique focus is rejected" "$(as $P2 "select * from public.save_my_training_plan('performance','descending','light');")" "invalid_focus"
has "Tactics is not trainable" "$(as $P2 "select * from public.save_my_training_plan('performance','positioning','light');")" "invalid_focus"
has "unknown intensity is rejected" "$(as $P2 "select * from public.save_my_training_plan('performance','climbing','extreme');")" "invalid_focus"
has "unknown type is rejected" "$(as $P2 "select * from public.save_my_training_plan('banana','climbing','light');")" "invalid_focus"
has "null focus is rejected" "$(as $P2 "select * from public.save_my_training_plan('performance',null,'light');")" "invalid_focus"
has "a player without a rider cannot plan" "$(as $P3 "select * from public.save_my_training_plan('performance','climbing','light');")" "no_rider"
has "anon cannot call save_my_training_plan" "$(asanon "select * from public.save_my_training_plan('performance','climbing','light');")" "permission denied"
eq "failed calls wrote nothing for P2 except the one technical plan" "$(q "select count(*) from public.training_plans where rider_id='$R2'")" "1"
has "a plan can never be cancelled/changed by the client (no UPDATE/DELETE path)" "$(as $P1 "delete from public.training_plans where rider_id='$R1' and season_id='$CUR' and week_number=$WK;")" "permission denied"

echo "== 5. processing: only ended weeks, never early"
BEFORE_ATTR=$(q "select attributes::text from public.riders where id='$R1'")
eq "week not ended (plannable week): nothing is processed" "$(as $P1 "select public.process_my_due_training();")" "0"
q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) values ('$R4','$CUR',$(q "select public.season_week_at(now())"),'performance','climbing','hard')" >/dev/null
eq "the CURRENT week is not ended either" "$(as $P4 "select public.process_my_due_training();")" "0"
q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) values ('$R4','season-99',1,'performance','climbing','hard'), ('$R4','garbage',1,'performance','climbing','hard'), ('$R4','season-0',3,'performance','climbing','hard')" >/dev/null
eq "a foreign / future / malformed season_id never makes a plan due" "$(as $P4 "select public.process_my_due_training();")" "0"
eq "none of those plans was applied" "$(q "select count(*) from public.training_plans where rider_id='$R4' and applied_at is not null")" "0"
eq "attributes untouched so far" "$(q "select attributes::text from public.riders where id='$R1'")" "$BEFORE_ATTR"
has "the internal function is not callable by players" "$(as $P1 "select * from public.apply_training_plan_internal('$(q "select id from public.training_plans where rider_id='$R1' limit 1")');")" "permission denied"
has "the old process_training_plan no longer exists" "$(as $P1 "select * from public.process_training_plan('$(q "select id from public.training_plans where rider_id='$R1' limit 1")');")" "does not exist"
has "anon cannot process" "$(asanon "select public.process_my_due_training();")" "permission denied"

echo "== 6. a valid, ended week is processed — and equals the TypeScript formula"
PREV="season-1"; [ "$CUR" = "season-1" ] && PREV="$CUR"
if [ "$CUR" = "season-1" ] && [ "$(q "select public.season_week_at(now())")" = "1" ]; then echo "  (clock is in week 1 of season 1: no ended week exists, section skipped)"; else
q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) values ('$R1','season-1',3,'performance','climbing','normal')" >/dev/null
eq "plan of an ended week is applied for the owner" "$(as $P1 "select public.process_my_due_training();")" "1"
eq "plan is marked processed with gains recorded" "$(q "select (applied_at is not null)||':'||primary_attr||':'||secondary_attr from public.training_plans where rider_id='$R1' and season_id='season-1' and week_number=3")" "true:climbing:endurance"
eq "primary progress == TS growth.ts (readiness 0.95, normal x2)" "$(q "select round(progress::numeric, 6)::float8 from public.rider_training_progress where rider_id='$R1' and attribute='climbing'")" "$(ref "round(d['raw']['primaryRaw'], 6)")"
eq "secondary progress == TS growth.ts (35 %)" "$(q "select round(progress::numeric, 6)::float8 from public.rider_training_progress where rider_id='$R1' and attribute='endurance'")" "$(ref "round(d['raw']['secondaryRaw'], 6)")"
eq "energy/fatigue == TS condition.ts" "$(q "select (condition->>'energy')||':'||(condition->>'fatigue') from public.riders where id='$R1'")" "$(ref "str(d['cond']['energy'])+':'+str(d['cond']['fatigue'])")"
eq "condition_previous holds the pre-training snapshot" "$(q "select (condition_previous->>'energy')||':'||(condition_previous->>'fatigue') from public.riders where id='$R1'")" "70:30"
SNAP=$(q "select attributes::text||(condition::text)||(select string_agg(attribute||progress, ',' order by attribute) from public.rider_training_progress where rider_id='$R1') from public.riders where id='$R1'")
eq "calling again is a no-op (idempotent)" "$(as $P1 "select public.process_my_due_training();")" "0"
eq "nothing changed on the repeat" "$(q "select attributes::text||(condition::text)||(select string_agg(attribute||progress, ',' order by attribute) from public.rider_training_progress where rider_id='$R1') from public.riders where id='$R1'")" "$SNAP"
has "a client cannot clear applied_at to re-run it" "$(as $P1 "update public.training_plans set applied_at = null where rider_id='$R1';")" "permission denied"
eq "another player's plans are never touched by my call (P2 plan stays open)" "$(q "select count(*) from public.training_plans where rider_id='$R2' and applied_at is not null")" "0"
has "a player cannot apply someone else's plan directly" "$(as $P1 "select * from public.apply_training_plan_internal('$(q "select id from public.training_plans where rider_id='$R2' limit 1")');")" "permission denied"

echo "== 7. concurrent processing counts a training once"
q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) values ('$R2','season-1',2,'performance','climbing','normal')" >/dev/null
for i in 1 2 3 4 5 6 7 8; do
  ( printf "set role authenticated;\nselect set_config('request.jwt.claim.sub','%s',false);\nselect 'N='||public.process_my_due_training();\n" "$P2" | psqlc t > "$DIR/conc_$i.out" ) &
done
wait
TOTAL=$(cat "$DIR"/conc_*.out | grep -o 'N=[0-9]*' | cut -d= -f2 | paste -sd+ | bc)
eq "8 parallel callers applied exactly one plan in total" "$TOTAL" "1"
eq "progress equals ONE application (not 2-8x)" "$(q "select round(progress::numeric, 6)::float8 from public.rider_training_progress where rider_id='$R2' and attribute='climbing'")" "$(ref "round(d['raw']['primaryRaw'], 6)")"
eq "condition equals ONE application" "$(q "select (condition->>'energy')||':'||(condition->>'fatigue') from public.riders where id='$R2'")" "$(ref "str(d['cond']['energy'])+':'+str(d['cond']['fatigue'])")"
eq "the technical current-week plan of P2 was not touched" "$(q "select count(*) from public.training_plans where rider_id='$R2' and applied_at is null")" "1"
fi

echo "== 8. starter rider is created through the validated function"
PAYLOAD=$(ref "json.dumps(d['starterPayload'])")
NEWID=$(as $P3 "select public.create_my_starter_rider('$PAYLOAD'::jsonb);")
eq "valid generator output creates the rider for the caller" "$(q "select count(*) from public.riders where id='$NEWID' and player_id='$P3' and not is_ai")" "1"
eq "the bike is created with the rider" "$(q "select count(*) from public.bike_condition where rider_id='$NEWID'")" "1"
eq "second call is idempotent (same rider, nothing regenerated)" "$(as $P3 "select public.create_my_starter_rider('$PAYLOAD'::jsonb);")" "$NEWID"
eq "still exactly one rider for the player" "$(q "select count(*) from public.riders where player_id='$P3'")" "1"
mut() { python3 - "$PAYLOAD" "$1" <<'PY'
import json,sys
p=json.loads(sys.argv[1]); exec(sys.argv[2]); print(json.dumps(p))
PY
}
NR=$(mkplayer)
for spec in "attribute 200|p['attributes']['climbing']=200" "attribute 111|p['attributes']['sprint']=111" "missing attribute|del p['attributes']['flat']" "extra attribute|p['attributes']['hax']=130" "age 40|p['age']=40" "potential 99|p['potential']=99" "recovery 20|p['recovery']=20" "tampered condition|p['condition']['energy']=999" "unknown archetype|p['inferred_archetype']='god'" "wrong generator version|p['generator_version']='x'" "empty name|p['first_name']=''" "fractional attribute|p['attributes']['hills']=130.5"; do
  has "rejects: ${spec%%|*}" "$(as $NR "select public.create_my_starter_rider('$(mut "${spec#*|}")'::jsonb);")" "invalid_rider"
done
eq "rejected payloads created no rider" "$(q "select count(*) from public.riders where player_id='$NR'")" "0"
has "anon cannot create a rider" "$(asanon "select public.create_my_starter_rider('$PAYLOAD'::jsonb);")" "permission denied"
eq "generator output (20000 samples) stays inside the SQL bounds 112-148" "$(ref "str(d['generator']['min']>=112 and d['generator']['max']<=148)")" "True"
eq "generator archetypes are all allowed by SQL" "$(ref "','.join(d['generator']['archetypes'])")" "allrounder,classics,climber,puncheur,rouleur,sprinter,timeTrial"
eq "generator ages 18-22 and hidden values 55-95 inside SQL bounds" "$(ref "str(d['generator']['ageMin']>=18 and d['generator']['ageMax']<=22 and d['generator']['hidMin']>=55 and d['generator']['hidMax']<=95)")" "True"
eq "generator keys == the 19 keys the SQL requires" "$(ref "','.join(d['generator']['keys'])")" "acceleration,attackTiming,bikeHandling,breakawaySkill,climbing,cornering,descending,endurance,energyManagement,experience,flat,hills,packRiding,positioning,reaction,roughSurface,sprint,timeTrial,wetHandling"

echo "== 9. admin-only tools"
AIROW='[{"first_name":"A","surname":"B","country_name":"Slovakia","country_iso2":"SK","age":20,"attributes":'"$ATTRS"',"condition":'"$COND"',"condition_previous":'"$COND"',"inferred_archetype":"climber","potential":70,"trainability":70,"professionalism":70,"recovery":70,"generator_version":"ai-v1"}]'
has "non-admin cannot generate AI riders" "$(as $P1 "select public.admin_generate_ai_riders('$AIROW'::jsonb);")" "not_admin"
eq "admin generates AI riders (+ their bikes)" "$(as $ADM "select public.admin_generate_ai_riders('$AIROW'::jsonb);")" "1"
eq "the AI rider has a bike row" "$(q "select count(*) from public.bike_condition b join public.riders r on r.id=b.rider_id where r.first_name='A' and r.is_ai")" "1"
has "non-admin cannot list raw riders" "$(as $P1 "select * from public.admin_list_riders();")" "not_admin"
eq "admin reads raw rows including hidden values" "$(as $ADM "select potential from public.admin_list_riders('$R1');")" "80"
has "anon cannot call admin_list_riders" "$(asanon "select * from public.admin_list_riders();")" "permission denied"

echo "== 10. legitimate flows still work"
as $P1 "select 1;" >/dev/null
# The test must not depend on today's date: P1 saved a plan for the plannable week above, so registering for a Tour
# that runs in THAT week is (correctly) refused by the training guard. Use a throwaway Tour in a different week.
q "insert into public.tour_schedule (tour_id, week_number) values ('test-tour-policy', case when coalesce(public.training_plannable_week(now()),0) = 1 then 2 else 1 end) on conflict (tour_id) do update set week_number = excluded.week_number;" >/dev/null
has "Tour registration (policy reads riders) still works" "$(as $P1 "insert into public.tour_registrations (rider_id, tour_id) values ('$R1','test-tour-policy') returning tour_id;")" "test-tour-policy"
eq "registration list can read rider names (public columns)" "$(as $P1 "select count(*) from public.tour_registrations t join public.riders r on r.id=t.rider_id where t.rider_id='$R1';")" "1"
q "delete from public.tour_registrations where tour_id = 'test-tour-policy'; delete from public.tour_schedule where tour_id = 'test-tour-policy';" >/dev/null
eq "bike_condition of own rider is readable" "$(as $P3 "select count(*) from public.bike_condition where rider_id='$NEWID';")" "1"
has "league placement function still works for a rider owner" "$(as $P1 "select count(*) from public.assign_my_league_division();")" "1"
eq "Season aging (definer) can still update riders" "$(q "select count(*) from pg_proc where proname='process_season_aging'")" "1"

echo "== 11. calendar: SQL == lib/calendar/season.ts"
n=$(ref "len(d['calendar'])"); okc=0
for i in $(seq 0 $((n-1))); do
  at=$(ref "d['calendar'][$i]['at']"); want=$(ref "d['calendar'][$i]['season']+':'+str(d['calendar'][$i]['week'])")
  got=$(q "select public.season_id_at('$at')||':'||public.season_week_at('$at')")
  [ "$got" = "$want" ] && okc=$((okc+1)) || bad "calendar $at" "got $got want $want"
done
eq "all $n sample dates (season/week boundaries, leap day) match TypeScript" "$okc" "$n"
eq "training_plan_is_due (at 2026-11-15, season 2 week 3): earlier season yes, same week no, earlier week yes, week 11 no" "$(q "select concat_ws('', public.training_plan_is_due('season-1',9,'2026-11-15T12:00Z')::text, public.training_plan_is_due('season-2',3,'2026-11-15T12:00Z')::text, public.training_plan_is_due('season-2',2,'2026-11-15T12:00Z')::text, public.training_plan_is_due('season-2',11,'2026-11-15T12:00Z')::text)" | sed 's/true/t/g; s/false/f/g')" "tftf"

echo "== 12. approved planning rules (migration 05)"
n=$(ref "len(d['calendar'])"); okp=0
for i in $(seq 0 $((n-1))); do
  at=$(ref "d['calendar'][$i]['at']"); want=$(ref "str(d['calendar'][$i]['plannable'] if d['calendar'][$i]['plannable'] is not None else 'none')")
  got=$(q "select coalesce(public.training_plannable_week('$at')::text,'none')")
  [ "$got" = "$want" ] && okp=$((okp+1)) || bad "plannable week $at" "got $got want $want"
done
eq "plannable week: SQL == lib/training/planning.ts on all $n sample dates" "$okp" "$n"
pw() { q "select coalesce(public.training_plannable_week('$1')::text,'none')"; }
eq "Sunday 23:59:59 UTC is still week 3 -> plans week 4" "$(pw 2026-11-15T23:59:59Z)" "4"
eq "Monday 00:00:00 UTC is week 4 -> plans week 5 (deadline = Sunday 24:00 UTC)" "$(pw 2026-11-16T00:00:00Z)" "5"
eq "Monday 00:30 CET (= Sunday 23:30 UTC) still plans week 4" "$(pw 2026-11-16T00:30:00+01:00)" "4"
eq "Sunday 00:59 UTC-1 (= Monday 00:30 UTC) already plans week 5" "$(pw 2026-11-15T23:30:00-01:00)" "5"
eq "week 1 (preparatory), first second: planning is for week 2" "$(pw 2026-10-26T00:00:00Z)" "2"
eq "week 1, last second: still planning for week 2" "$(pw 2026-11-01T23:59:59Z)" "2"
eq "week 9 plans week 10" "$(pw 2026-12-22T12:00:00Z)" "10"
eq "week 10: nothing is plannable (no week 1 of the next season)" "$(pw 2026-12-30T12:00:00Z)" "none"
eq "last second of week 10 / first second of next season" "$(pw 2027-01-03T23:59:59Z)|$(pw 2027-01-04T00:00:00Z)" "none|2"
eq "no plan can ever target week 1 (plannable week is always 2..10)" "$(q "select count(*) from generate_series(timestamp '2026-08-17', timestamp '2027-12-31', interval '1 day') d where public.training_plannable_week(d::timestamptz) is not null and public.training_plannable_week(d::timestamptz) < 2")" "0"
# the calendar (Tour weeks 2/4/6/8/10) comes from migration 20261117_04 (needs _01 and _03 first); checked in a throwaway copy so scenario A stays comparable to schema.sql
psqlc postgres -c "drop database if exists t_cal" >/dev/null; psqlc postgres -c "create database t_cal template t" >/dev/null
for m in 20261117_01_development_model_v2 20261117_03_rider_state_model 20261117_04_training_plans_calendar; do [ -f "$ROOT/migrations/$m.sql" ] && psqlc t_cal -f "$ROOT/migrations/$m.sql" >/dev/null 2>&1; done
eq "tour_schedule == data/tourSchedule.ts" "$(psqlc t_cal -c "select string_agg(tour_id||':'||week_number, ',' order by tour_id) from public.tour_schedule")" "$(ref "','.join(d['tourSchedule'])")"
has "clients cannot write tour_schedule" "$(as $P1 "update public.tour_schedule set week_number = 1;")" "permission denied"
eq "clients can read tour_schedule" "$(as $P1 "select count(*) from public.tour_schedule;")" "5"

q "insert into public.tour_schedule (tour_id, week_number) values ('test-tour-wk', $WK), ('test-tour-other', $([ "$WK" = 2 ] && echo 3 || echo 2))" >/dev/null
mk() { local pl; pl=$(mkplayer); mkrider "$pl" "$1" > "$DIR/last_rider"; echo "$pl"; }
regq() { echo "insert into public.tour_registrations (rider_id, tour_id) select id, '$2' from public.riders where player_id='$1' returning tour_id;"; }
T1=$(mk TourA); T1R=$(cat "$DIR/last_rider")
has "Tour registration for the plannable week works with no plan" "$(as $T1 "$(regq $T1 test-tour-wk)")" "test-tour-wk"
has "planning is refused when registered for a Tour in that week" "$(as $T1 "select * from public.save_my_training_plan('performance','climbing','normal');")" "tour_conflict"
eq "no plan was written by the refused save" "$(q "select count(*) from public.training_plans where rider_id='$T1R'")" "0"
as $T1 "delete from public.tour_registrations where rider_id='$T1R';" >/dev/null
has "after un-registering, the same week can be planned" "$(as $T1 "select week_number from public.save_my_training_plan('performance','climbing','normal');")" "$WK"
has "Tour registration is refused when training is confirmed for that Tour's week" "$(as $T1 "$(regq $T1 test-tour-wk)")" "training_conflict"
eq "refused registration wrote nothing" "$(q "select count(*) from public.tour_registrations where rider_id='$T1R'")" "0"
has "a Tour in ANOTHER week is fine alongside the plan" "$(as $T1 "$(regq $T1 test-tour-other)")" "test-tour-other"
has "an unknown tour id is not blocked by the guard" "$(as $T1 "$(regq $T1 some-future-tour)")" "some-future-tour"

# parallel save + registration of the same rider: never both
BOTH=0; ONE=0
for i in 1 2 3 4 5 6; do
  PL=$(mk Race$i); RR=$(cat "$DIR/last_rider")
  ( as $PL "select * from public.save_my_training_plan('performance','sprint','light');" > "$DIR/race_s_$i.out" ) &
  ( as $PL "$(regq $PL test-tour-wk)" > "$DIR/race_r_$i.out" ) &
  wait
  np=$(q "select count(*) from public.training_plans where rider_id='$RR'"); nr=$(q "select count(*) from public.tour_registrations where rider_id='$RR' and tour_id='test-tour-wk'")
  [ "$np" = 1 ] && [ "$nr" = 1 ] && BOTH=$((BOTH+1)); [ $((np+nr)) = 1 ] && ONE=$((ONE+1))
done
eq "6 simultaneous save+register races: no rider ended with BOTH a plan and a Tour in the same week" "$BOTH" "0"
eq "and exactly one of the two won each race" "$ONE" "6"

# parallel saves of the same week
PS=$(mk ParSave); PSR=$(cat "$DIR/last_rider")
for f in climbing hills flat sprint timeTrial endurance acceleration climbing; do
  ( as $PS "select 'SAVED' from public.save_my_training_plan('performance','$f','hard');" > "$DIR/ps_$f.$RANDOM.out" ) &
done
wait
eq "8 parallel saves created exactly one plan" "$(q "select count(*) from public.training_plans where rider_id='$PSR'")" "1"
eq "exactly one parallel save succeeded, the rest were rejected as already_planned" "$(cat "$DIR"/ps_*.out | grep -c SAVED)|$(cat "$DIR"/ps_*.out | grep -c already_planned)" "1|7"
FIRSTFOCUS=$(q "select focus from public.training_plans where rider_id='$PSR'")
has "a later save cannot change it" "$(as $PS "select * from public.save_my_training_plan('technical','cornering','light');")" "already_planned"
eq "plan unchanged after the later attempt" "$(q "select focus from public.training_plans where rider_id='$PSR'")" "$FIRSTFOCUS"
q "delete from public.tour_registrations where tour_id like 'test-tour%' or tour_id='some-future-tour'; delete from public.tour_schedule where tour_id like 'test-tour%';" >/dev/null

# schema.sql also contains the later migration 07 (contracts); apply it to A so both sides compare like with like.
psqlc t -f "$ROOT/migrations/20261116_01_rider_contracts.sql" >/dev/null 2>&1 || { echo "migration 07 failed"; exit 1; }
psqlc t -f "$ROOT/migrations/20261116_02_market_purchase_and_swap.sql" >/dev/null 2>&1 || { echo "migration 08 failed"; exit 1; }
echo "== Scenario B: fresh database from supabase/schema.sql == scenario A"
psqlc fresh -f "$SCHEMA" >/dev/null 2>&1 && ok "full schema.sql applies on a fresh database" || bad "full schema.sql applies" "$(psqlc fresh -f "$SCHEMA" | tail -3)"
cat_of() { psqlc "$1" -c "select string_agg(p.oid::regprocedure::text||':'||p.prosecdef::text||':'||coalesce(p.proacl::text,''), E'\n' order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | md5sum; }
eq "function catalog (names, security definer, ACLs) is identical" "$(cat_of t)" "$(cat_of fresh)"
tg() { psqlc "$1" -c "select string_agg(table_name||':'||grantee||':'||privilege_type, ',' order by table_name, grantee, privilege_type) from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated')" | md5sum; }
eq "table grants are identical" "$(tg t)" "$(tg fresh)"
cg() { psqlc "$1" -c "select string_agg(table_name||'.'||column_name||':'||grantee||':'||privilege_type, ',' order by 1) from information_schema.column_privileges where table_schema='public' and table_name='riders' and grantee in ('anon','authenticated')" | md5sum; }
eq "riders column grants are identical" "$(cg t)" "$(cg fresh)"
pol() { psqlc "$1" -c "select string_agg(tablename||':'||policyname||':'||cmd, ',' order by tablename, policyname) from pg_policies where schemaname='public'" | md5sum; }
eq "RLS policies are identical" "$(pol t)" "$(pol fresh)"

echo
echo "  $pass passed, $fail failed"
[ "$fail" = 0 ]
