#!/usr/bin/env bash
# Development model V2 — SQL vs TypeScript parity, switch behaviour, no-plan week, ageing. REAL local Postgres, never a real database.
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
if [ -z "${REF:-}" ]; then REF="$DIR/ref.json"; (cd "$REPO/apps/web" && npx --no-install tsx --tsconfig tsconfig.json src/lib/training/development/dbParityV2.cli.ts) > "$REF" || { echo "reference script failed"; exit 1; }; fi
ref() { python3 -c "import json; d=json.load(open('$REF')); print($1)"; }

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
APT() { ref "json.dumps(d['out']['$1']['aptitude'])"; }
RA=$(mkrider $A talent 19 130 climber 95 85 80 70 80 "$(APT talent)"); RB=$(mkrider $B weak 22 125 allrounder 15 20 30 30 10 "$(APT weak)"); RC=$(mkrider $C wrong 30 140 sprinter 60 55 45 90 10); RD=$(mkrider $D noplan 25 130 climber 50 50 50 50 50)
RE=$(mkrider $E prof 24 135 sprinter 80 70 60 50 50 "$(APT profile)")
RF=$(mkrider $F lowcap 18 90 sprinter 5 60 50 50 50 "$(APT lowcap)")
has "hidden Vitality is not readable by players" "$(as $A "select vitality from public.riders where player_id='$A';")" "permission denied"
has "decline_progress is not readable by players" "$(as $A "select decline_progress from public.riders where player_id='$A';")" "permission denied"

echo "== switch OFF"
has "save_my_development_plan refuses while the switch is off" "$(as $A "select * from public.save_my_development_plan(0,'full');")" "model_disabled"
has "client cannot flip the switch" "$(as $A "update public.development_model_settings set enabled = true;")" "permission denied"

echo "== switch ON: validation of the plan"
q "update public.development_model_settings set enabled = true" >/dev/null
has "invalid plan id is rejected" "$(as $A "select * from public.save_my_development_plan(7,'full');")" "invalid_focus"
has "invalid mode is rejected" "$(as $A "select * from public.save_my_development_plan(0,'half');")" "invalid_focus"
has "player without a rider cannot plan" "$(as $(mkplayer) "select * from public.save_my_development_plan(0,'full');")" "no_rider"
SAVED=$(as $A "select plan_id||':'||mode||':'||week_type||':'||focus||':'||intensity from public.save_my_development_plan(0,'basic');")
eq "valid plan: plan_id + mode stored (week/season from the SQL calendar)" "$SAVED" "0:basic:performance:climbing:normal"
has "a confirmed plan cannot be overwritten" "$(as $A "select * from public.save_my_development_plan(1,'full');")" "already_planned"
q "delete from public.training_plans" >/dev/null

echo "== migrations 03 + 04 (final state): the shared budget 58/18/14/10 % replaces the coefficient model"
psqlc t -f "$ROOT/migrations/20261117_03_rider_state_model.sql" >"$DIR/m3.out" 2>&1 && ok "migration 03 applies" || { bad "migration 03" "$(tail -3 "$DIR/m3.out")"; exit 1; }
psqlc t -f "$ROOT/migrations/20261117_04_training_plans_calendar.sql" >"$DIR/m4.out" 2>&1 && ok "migration 04 applies" || { bad "migration 04" "$(tail -3 "$DIR/m4.out")"; exit 1; }

S1O5=${S1O5:-on}   # on = S1+O5 installed (default); off = never installed; rolledback = installed, then ROLLBACK_S1O5_rozvoj.sql (docs/S1O5_rollback_postup.md). off/rolledback: old SQL function, TypeScript reverted (capSlope 1.25 / youthRoomFloor 0)
if [ "$S1O5" = on ]; then
echo "== migration 20261119_04 (S1 + O5 working model): cap slope 1.5 + youth floor, same function, TypeScript parity"
psqlc t -f "$ROOT/migrations/20261119_04_dev_cap_s1_youth_floor_o5.sql" >"$DIR/m19.out" 2>&1 && ok "S1+O5 migration applies" || { bad "S1+O5 migration" "$(tail -3 "$DIR/m19.out")"; exit 1; }
psqlc t -f "$ROOT/migrations/20261119_04_dev_cap_s1_youth_floor_o5.sql" >/dev/null 2>&1 && ok "S1+O5 migration is idempotent" || bad "S1+O5 second run" ""
GRID="$DIR/grid.json"; (cd "$REPO/apps/web" && npx --no-install tsx --tsconfig tsconfig.json src/lib/training/development/roomGrid.cli.ts) > "$GRID" || { bad "room grid reference" ""; exit 1; }
python3 - "$GRID" > "$DIR/grid.sql" <<'PY'
import json,sys
for g in json.load(open(sys.argv[1])): print(f"{g['cur']}|{g['cap']}|{g['age']}|{g['room']!r}")
PY
q "create temp table g(cur float8, cap float8, age int, room float8)" >/dev/null 2>&1
psqlc t -c "create table public.room_grid(cur float8, cap float8, age int, room float8)" >/dev/null
psqlc t -c "\\copy public.room_grid from '$DIR/grid.sql' with (format csv, delimiter '|')" >/dev/null
eq "dev_phys_room equals TypeScript roomPhys on the whole grid (ages 16..35, caps 40..230, values 1..201): max abs diff < 1e-9" "$(q "select count(*) from public.room_grid where abs(public.dev_phys_room(cur, cap, age) - room) > 1e-9")" "0"
eq "grid size (594 points)" "$(q "select count(*) from public.room_grid")" "594"
eq "age 21: floor 0.30 above the ceiling; age 26: no floor" "$(q "select round(public.dev_phys_room(150, 90, 21)::numeric,2)||':'||(public.dev_phys_room(150, 90, 26) < 0.001)")" "0.30:true"
eq "age 23: floor 0.18 (linear 21 -> 26)" "$(q "select round(public.dev_phys_room(150, 90, 23)::numeric,2)")" "0.18"
eq "hard maximum: room 0 at 200 even for age 17" "$(q "select public.dev_phys_room(200, 90, 17)")" "0"
eq "players cannot call the internal room function" "$(as $A "select public.dev_phys_room(1,1,1);" | grep -c 'permission denied')" "1"
psqlc t -c "drop table public.room_grid" >/dev/null

else
  if [ "$S1O5" = rolledback ]; then
    psqlc t -f "$ROOT/migrations/20261119_04_dev_cap_s1_youth_floor_o5.sql" >/dev/null 2>&1 && psqlc t -f "$ROOT/diagnostics/market_launch/manual_rollbacks/ROLLBACK_S1O5_rozvoj.sql" >/dev/null 2>&1 && ok "S1+O5 applied and then rolled back" || bad "apply + rollback" ""
  fi
  echo "== S1+O5 OFF: SQL keeps the old function (cap 1.25, no floor); the TypeScript reference must be the reverted one"
  eq "SQL function is the old one" "$(q "select (prosrc like '%c_cap_slope constant float8 := 1.25%')::text||':'||(prosrc not like '%dev_phys_room%')::text from pg_proc where oid='public.apply_development_plan_v2(uuid)'::regprocedure")" "true:true"
fi

echo "== a week WITHOUT a plan changes nothing"
BEFORE=$(q "select attributes::text||condition::text from public.riders where id='$RD'")
eq "processing with no plan applies nothing" "$(as $D "select public.process_my_due_training();")" "0"
eq "attributes and condition unchanged" "$(q "select attributes::text||condition::text from public.riders where id='$RD'")" "$BEFORE"
eq "no progress row was created" "$(q "select count(*) from public.rider_training_progress where rider_id='$RD'")" "0"

echo "== nine processed weeks (a season of every available week) == TypeScript core"
for s in "talent:$A:$RA:0:full" "weak:$B:$RB:6:basic" "wrongplan:$C:$RC:4:full" "profile:$E:$RE:1:full" "lowcap:$F:$RF:1:full"; do
  IFS=: read name P R plan mode <<<"$s"
  for w in 2 3 4 5 6 7 8 9 10; do q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity, plan_id, mode) values ('$R','season-1',$w,'performance','climbing','hard',$plan,'$mode')" >/dev/null; done
  eq "$name: 9 plans of an ended season are applied" "$(as $P "select public.process_my_due_training();")" "9"
  GOT=$(q "select string_agg(key||'='||value, ',' order by key) from public.riders r, jsonb_each_text(r.attributes) where r.id='$R' and key in ('climbing','hills','flat','sprint','timeTrial','endurance','acceleration','descending','bikeHandling','cornering','packRiding','wetHandling','roughSurface','experience','positioning')")
  WANT=$(ref "','.join(k+'='+str(v) for k,v in sorted(d['out']['$name']['afterWeeks']['attrs'].items()) if k in 'climbing hills flat sprint timeTrial endurance acceleration descending bikeHandling cornering packRiding wetHandling roughSurface experience positioning'.split())")
  eq "$name: every attribute equals the TypeScript result" "$GOT" "$WANT"
  eq "$name: energy/fatigue equal the TypeScript result" "$(q "select (condition->>'energy')||':'||(condition->>'fatigue') from public.riders where id='$R'")" "$(ref "str(d['out']['$name']['afterWeeks']['energy'])+':'+str(d['out']['$name']['afterWeeks']['fatigue'])")"
  PG=$(q "select string_agg(attribute||'='||round(progress::numeric,5)::float8, ',' order by attribute) from public.rider_training_progress where rider_id='$R'")
  PW=$(ref "','.join(k+'='+str(round(v,5)) for k,v in sorted(d['out']['$name']['afterWeeks']['progress'].items()))")
  eq "$name: accumulator progress equals the TypeScript result (5 decimals)" "$PG" "$PW"
  eq "$name: processing again is a no-op" "$(as $P "select public.process_my_due_training();")" "0"
  LV=$(ref "next(x['level'] for x in d['scenarios'] if x['name']=='$name')")
  eq "$name: tactics/experience untouched by training" "$(q "select (attributes->>'experience')||':'||(attributes->>'positioning') from public.riders where id='$R'")" "$LV:$LV"
done

echo "== ageing at the season change, switch ON == TypeScript seasonStart"
q "update public.development_model_settings set enabled = true; delete from public.season_transition_processing" >/dev/null
as $A "select public.process_season_aging();" >/dev/null
for s in "talent:$RA" "weak:$RB" "wrongplan:$RC" "profile:$RE" "lowcap:$RF"; do
  IFS=: read name R <<<"$s"
  eq "$name: physical attributes after the season change equal the TypeScript result" "$(q "select string_agg(key||'='||value, ',' order by key) from public.riders r, jsonb_each_text(r.attributes) where r.id='$R' and key in ('climbing','hills','flat','sprint','timeTrial','endurance','acceleration')")" "$(ref "','.join(k+'='+str(v) for k,v in sorted(d['out']['$name']['afterSeasonStart']['attrs'].items()) if k in 'climbing hills flat sprint timeTrial endurance acceleration'.split())")"
  eq "$name: fractional decline progress carried (5 decimals)" "$(q "select string_agg(key||'='||round(value::numeric,5)::float8, ',' order by key) from public.riders r, jsonb_each_text(r.decline_progress) where r.id='$R'")" "$(ref "','.join(k+'='+str(round(v,5)) for k,v in sorted(d['out']['$name']['afterSeasonStart']['decline'].items()))")"
  eq "$name: offseason +50 Energy / -50 Fatigue" "$(q "select (condition->>'energy')||':'||(condition->>'fatigue') from public.riders where id='$R'")" "$(ref "str(d['out']['$name']['afterSeasonStart']['energy'])+':'+str(d['out']['$name']['afterSeasonStart']['fatigue'])")"
done
eq "technique is not touched by ageing (equals the value after the weeks)" "$(q "select attributes->>'cornering' from public.riders where id='$RC'")" "$(ref "d['out']['wrongplan']['afterSeasonStart']['attrs']['cornering']")"
eq "the wrongplan rider (Vitality 10, age 31) really lost physical points" "$(q "select (attributes->>'flat')::int < $(ref "d['out']['wrongplan']['afterWeeks']['attrs']['flat']") from public.riders where id='$RC'")" "t"

echo "== switch OFF again: old aging behaviour"
q "update public.development_model_settings set enabled = false; delete from public.season_transition_processing" >/dev/null
SNAP=$(q "select string_agg(attributes::text||condition::text, '|' order by id) from public.riders"); AGES=$(q "select string_agg(age::text, ',' order by id) from public.riders")
as $A "select public.process_season_aging();" >/dev/null
eq "attributes and condition untouched, only age +1" "$(q "select string_agg(attributes::text||condition::text, '|' order by id) from public.riders")" "$SNAP"
eq "age +1 for every rider" "$(q "select string_agg(age::text, ',' order by id) from public.riders")" "$(python3 -c "print(','.join(str(int(x)+1) for x in '$AGES'.split(',')))")"

echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
