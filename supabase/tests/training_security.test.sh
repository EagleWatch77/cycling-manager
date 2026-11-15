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
CUR=$(q "select public.current_season_id()"); WK=$(q "select least(public.season_week_at(now())+1,10)")
SAVED=$(as $P1 "select season_id||':'||week_number||':'||week_type||':'||focus||':'||intensity||':'||(applied_at is null) from public.save_my_training_plan('performance','climbing','normal');")
eq "valid plan: season + week come from the SQL calendar, owner from auth" "$SAVED" "$CUR:$WK:performance:climbing:normal:true"
eq "the plan belongs to the caller's rider" "$(q "select rider_id from public.training_plans where season_id='$CUR' and week_number=$WK and rider_id in ('$R1','$R2')")" "$R1"
eq "an unprocessed plan can still be changed (current behaviour, D11 open)" "$(as $P1 "select focus||':'||intensity from public.save_my_training_plan('performance','sprint','hard');")" "sprint:hard"
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
# a processed plan is history: simulate the engine having applied this week's plan
q "update public.training_plans set applied_at = now() where rider_id='$R1' and season_id='$CUR' and week_number=$WK" >/dev/null
has "a processed plan can never be changed" "$(as $P1 "select * from public.save_my_training_plan('performance','flat','light');")" "already_processed"
eq "and it kept its focus" "$(q "select focus from public.training_plans where rider_id='$R1' and season_id='$CUR' and week_number=$WK")" "sprint"
q "update public.training_plans set applied_at = null where rider_id='$R1' and season_id='$CUR' and week_number=$WK" >/dev/null

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
has "Tour registration (policy reads riders) still works" "$(as $P1 "insert into public.tour_registrations (rider_id, tour_id) values ('$R1','danube-tour') returning tour_id;")" "danube-tour"
eq "registration list can read rider names (public columns)" "$(as $P1 "select count(*) from public.tour_registrations t join public.riders r on r.id=t.rider_id where t.rider_id='$R1';")" "1"
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
