#!/usr/bin/env bash
# Migration 20261117_04: ONE calendar (configurable season start, odd = training / even = race, Tours 2/4/6/8/10, stages per league), plan window
# (Monday 18:00 UTC), shared progress budget, training sessions in the Rider State loop, offline catch-up, long offline. REAL local Postgres.
#   CAL=/path/cal.json STATE=/path/state.json bash supabase/tests/training_plans_calendar.test.sh      (run as a non-root OS user, e.g. postgres)
#   CAL = apps/web/src/lib/calendar/calendarParity.cli.ts, STATE = apps/web/src/lib/training/state/stateParity.cli.ts
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}; PORT=${PGTEST_PORT:-5499}
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS  $1"; }
bad() { fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
has() { echo "$2" | grep -qi -- "$3" && ok "$1" || bad "$1" "$(echo "$2" | tr '\n' ' ' | cut -c1-200)"; }
psqlc() { psql -h "$DIR" -p $PORT -U postgres -d "$1" -qtA -v ON_ERROR_STOP=1 "${@:2}" 2>&1; }
q() { psqlc t -c "$1"; }
as() { printf "set role authenticated;\nselect set_config('request.jwt.claim.sub','%s',false);\n%s\n" "$1" "$2" | psqlc t | tail -n +2; }
trap '"$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1' EXIT
cal() { python3 -c "import json; d=json.load(open('$CAL')); print($1)"; }
"$PGBIN/initdb" -D "$DIR/data" -A trust >/dev/null; "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
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
psqlc postgres -c "create database t" >/dev/null; psqlc t -f "$DIR/stub.sql" >/dev/null
psqlc t -f "$ROOT/schema.sql" >/dev/null 2>&1 || { echo "schema.sql failed"; exit 1; }
for m in 20261114_01_tour_season_registrations 20261115_01_training_security 20261115_02_training_calendar_rules 20261115_03_rider_development_tracking 20261116_01_rider_contracts 20261117_01_development_model_v2 20261117_03_rider_state_model; do
  [ -f "$ROOT/migrations/$m.sql" ] || continue
  psqlc t -f "$ROOT/migrations/$m.sql" >/dev/null 2>&1 || { echo "migration $m failed"; exit 1; }
done
ok "production schema + migrations up to 20261117_03 apply (the starting point of the owner's database)"

mkplayer() { q "insert into auth.users default values returning id" | head -1; }
ATTRS='{"climbing":130,"hills":130,"flat":130,"sprint":130,"timeTrial":130,"endurance":130,"acceleration":130,"positioning":120,"attackTiming":120,"reaction":120,"energyManagement":120,"breakawaySkill":120,"descending":115,"bikeHandling":115,"cornering":115,"packRiding":115,"roughSurface":115,"wetHandling":115,"experience":30}'
LEGACY='{"energy":70,"fatigue":30,"form":50,"fitness":60,"morale":70}'
mk() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','T','$2','Slovakia','SK',25,'$ATTRS','$LEGACY','$LEGACY','climber',60,60,60,60) returning id" | head -1; }
P1=$(mkplayer); P2=$(mkplayer); R1=$(mk $P1 one); R2=$(mk $P2 two)

echo "== conflict report BEFORE the migration (old calendar: Danube/Coastal week 5, Northern Crown 7, Silver Horizon 9)"
q "insert into public.tour_registrations (rider_id, tour_id, season_id) values ('$R1','danube-tour','season-2'),('$R1','highlands-tour','season-2')" >/dev/null
q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) values ('$R2','season-2',4,'performance','climbing','hard')" >/dev/null
psqlc t -f "$ROOT/migrations/20261117_04_training_plans_calendar.sql" >"$DIR/m4.out" 2>&1 && ok "migration 04 applies" || { bad "migration 04 applies" "$(tail -3 "$DIR/m4.out")"; exit 1; }
has "the migration tells the owner about the conflicts (notice) instead of changing data" "$(cat "$DIR/m4.out")" "calendar_v2_conflicts"
psqlc t -f "$ROOT/migrations/20261117_04_training_plans_calendar.sql" >/dev/null 2>&1 && ok "migration 04 is idempotent (second run)" || bad "second run" ""
eq "report: Danube registration moves 5 -> 4 (Highlands stays in 2)" "$(q "select string_agg(detail, ';') from public.calendar_v2_conflicts() where kind = 'registration_moves_to_another_week'")" "danube-tour: week 5 -> week 4"
eq "report: the unprocessed plan of week 4 (now a race week) is listed" "$(q "select count(*) from public.calendar_v2_conflicts() where kind = 'unprocessed_plan_in_a_race_week' and rider_id = '$R2'")" "1"
eq "report: the Danube registration and a plan in week 4 would collide (rider two has the plan, rider one the Tour)" "$(q "select count(*) from public.calendar_v2_conflicts() where kind = 'plan_collides_with_new_tour_week'")" "0"
eq "NOTHING was changed or deleted: registrations and plans are as before" "$(q "select (select count(*) from public.tour_registrations) || ':' || (select count(*) from public.training_plans)")" "2:1"
has "clients cannot run the report" "$(printf "set role authenticated;\nselect * from public.calendar_v2_conflicts();\n" | psqlc t)" "permission denied"

echo "== the season start is ONE setting"
eq "default 2026-08-17" "$(q "select public.game_season_one_start()")" "2026-08-17"
has "must be a Monday" "$(q "update public.game_calendar_settings set season_one_start = date '2026-08-18'")" "violates check"
has "clients cannot read or change the setting table" "$(printf "set role authenticated;\nselect * from public.game_calendar_settings;\n" | psqlc t)" "permission denied"
eq "season / week / week index follow the setting (start moved by 7 days: the same instant is one week earlier)" "$(q "update public.game_calendar_settings set season_one_start = date '2026-08-24'; select public.season_week_at(timestamptz '2026-09-08 10:00+00') || ':' || public.game_week_index(timestamptz '2026-09-08 10:00+00'); update public.game_calendar_settings set season_one_start = date '2026-08-17';" | head -1)" "3:2"
eq "back at the default: the same instant is week 4" "$(q "select public.season_week_at(timestamptz '2026-09-08 10:00+00')")" "4"

echo "== calendar functions == TypeScript (1146 instants incl. every Monday 17:59:59 / 18:00:00 for 32 weeks)"
eq "setting equals SEASON_ONE_START of the app" "$(q "select public.game_season_one_start()")" "$(cal "d['start']")"
python3 - "$CAL" > "$DIR/cal.csv" <<'PY'
import json,sys
for r in json.load(open(sys.argv[1]))['rows']: print(f"{r['at']}|{r['season']}|{r['week']}|{r['kind']}|{r['idx']}|{r['target']}")
PY
q "create table cal_ref (at timestamptz, season text, week int, kind text, idx int, target text); copy cal_ref from '$DIR/cal.csv' with (delimiter '|');" >/dev/null 2>&1 || psql -h "$DIR" -p $PORT -U postgres -d t -qtA -c "\\copy cal_ref from '$DIR/cal.csv' with (delimiter '|')" >/dev/null 2>&1
q "create table if not exists cal_ref (at timestamptz, season text, week int, kind text, idx int, target text)" >/dev/null
[ "$(q "select count(*) from cal_ref")" = "0" ] && psql -h "$DIR" -p $PORT -U postgres -d t -qtA -c "\\copy cal_ref from '$DIR/cal.csv' with (delimiter '|')" >/dev/null 2>&1
eq "reference rows loaded" "$(q "select count(*) from cal_ref")" "$(cal "len(d['rows'])")"
eq "season_id_at, season_week_at, game_week_index, game_week_kind == TypeScript" "$(q "select count(*) from cal_ref c where public.season_id_at(c.at) <> c.season or public.season_week_at(c.at) <> c.week or public.game_week_kind(public.season_week_at(c.at)) <> c.kind or public.game_week_index(c.at) <> c.idx")" "0"
eq "training_target_week (plan window, Monday 18:00 UTC) == TypeScript trainingTarget" "$(q "select count(*) from cal_ref c where coalesce((select t.season_id || ':' || t.week_number from public.training_target_week(c.at) t), 'none') <> c.target")" "0"
eq "Tour weeks in the database == data/tourSchedule.ts == 2/4/6/8/10" "$(q "select string_agg(tour_id || ':' || week_number, ',' order by tour_id) from public.tour_schedule")" "$(cal "','.join(k+':'+str(v) for k,v in sorted(d['tours'].items()))")"
eq "every Tour runs in a race week, one Tour per week" "$(q "select bool_and(public.game_week_kind(week_number) = 'race') and count(distinct week_number) = count(*) from public.tour_schedule")" "t"
for L in rookie amateur continental pro elite; do eq "stage days of $L == TypeScript LEAGUE_RACE_DAYS (and their number = stages: $(cal "d['stages']['$L']"))" "$(q "select array_to_string(public.league_race_days('$L'), ',')")" "$(cal "','.join(map(str,d['raceDays']['$L']))")"; done

echo "== saving a plan: the open window, change until the deadline, never after"
# the test must not depend on the day it runs: the season start is moved so that "now" is in a chosen week
setweek() { q "update public.game_calendar_settings set season_one_start = ((now() at time zone 'utc')::date - (extract(isodow from (now() at time zone 'utc')::date)::int - 1) - 7 * ($1 - 1))::date" >/dev/null; }
TW=0; RW=0
for cw in 1 2 3 4 5 6 7 8 9 10; do
  setweek $cw; T=$(q "select coalesce((select week_number from public.training_target_week(now())), 0)")
  [ "$T" != "0" ] && [ $TW = 0 ] && TW=$cw
  [ "$T" = "0" ] && [ $RW = 0 ] && RW=$cw
done
[ $TW != 0 ] && ok "found a calendar position with an open plan window (current week $TW)" || bad "open window position" "none"
[ $RW != 0 ] && ok "found a calendar position without an open window (current week $RW: the next week is a race week)" || bad "closed window position" "none"
q "update public.development_model_settings set enabled = true" >/dev/null
q "delete from public.training_plans; delete from public.tour_registrations" >/dev/null
setweek $RW
has "race week next: nothing can be planned" "$(as $P1 "select * from public.save_my_development_plan(0,'full');")" "no_plannable_week"
setweek $TW
TARGET=$(q "select week_number from public.training_target_week(now())"); TSEASON=$(q "select season_id from public.training_target_week(now())")
eq "a plan saved now is stored for the target training week (odd week)" "$(as $P1 "select week_number || ':' || season_id || ':' || plan_id || ':' || mode from public.save_my_development_plan(0,'basic');")" "$TARGET:$TSEASON:0:basic"
eq "the plan can be CHANGED before the deadline (plan, mode)" "$(as $P1 "select plan_id || ':' || mode from public.save_my_development_plan(3,'full');")" "3:full"
eq "still one row for that week" "$(q "select count(*) from public.training_plans where rider_id = '$R1'")" "1"
q "update public.training_plans set applied_at = now() where rider_id = '$R1'" >/dev/null
has "a processed plan can never be changed" "$(as $P1 "select * from public.save_my_development_plan(1,'basic');")" "already_processed"
q "insert into public.tour_schedule (tour_id, week_number) values ('test-tour-here', $TARGET) on conflict (tour_id) do update set week_number = excluded.week_number; insert into public.tour_registrations (rider_id, tour_id, season_id) values ('$R2','test-tour-here','$TSEASON')" >/dev/null
has "a rider registered for a Tour in that week cannot plan (defence in depth)" "$(as $P2 "select * from public.save_my_development_plan(2,'full');")" "tour_conflict"
q "delete from public.tour_registrations where tour_id = 'test-tour-here'; delete from public.tour_schedule where tour_id = 'test-tour-here'; delete from public.training_plans;" >/dev/null
q "update public.game_calendar_settings set season_one_start = date '2026-08-17'" >/dev/null

echo "== sessions in the Rider State loop == TypeScript (Full Tue/Thu/Sat, Basic Tue/Fri, stages in race weeks)"
q "update public.development_model_settings set enabled = true; update public.rider_state_settings set enabled = true" >/dev/null
declare -A RID; RID[cycle_full]=$(mk $(mkplayer) cf); RID[cycle_basic]=$(mk $(mkplayer) cb)
python3 - "$STATE" "$(declare -p RID | sed "s/declare -A RID=//")" > "$DIR/prep.sql" <<'PY'
import json,sys,re
d=json.load(open(sys.argv[1])); ids=dict(re.findall(r'\[(\w+)\]="([^"]+)"', sys.argv[2]))
for s in d['v2scenarios']:
    r=ids[s['name']]
    cond=json.dumps({'energy':s['energy'],'fatigue':s['fatigue'],'form':s['form'],'fitness':s['fitness'],'morale':70})
    print(f"update public.riders set age={s['age']}, vitality={s['vitality']}, trainability={s['trainability']}, professionalism={s['professionalism']}, recovery={s['recovery']}, energy_efficiency={s['coef'][0]}, fatigue_resistance={s['coef'][1]}, recovery_coef={s['coef'][2]}, fitness_peak={s['peak']}, condition='{cond}', condition_previous='{cond}', state_at=timestamptz '2026-08-17 00:00:00+00' where id='{r}';")
    pid={'full':0,'basic':1}
    for w,m in s['plans']:
        print(f"insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity, plan_id, mode) values ('{r}','season-{(w-1)//10+1}',{(w-1)%10+1},'performance','climbing','hard',{pid[m]},'{m}');")
    for i,at in enumerate(s['stageAt']):
        print(f"select public.record_rider_stage_load('{r}', timestamptz '2026-08-17 00:00:00+00' + make_interval(secs => {at}), 16, 11, 0.25, 'stage-{i}');")
PY
q "$(cat "$DIR/prep.sql")" >/dev/null && ok "V2 scenario riders prepared (plans + stage events)" || bad "prepare" "$(psqlc t -f "$DIR/prep.sql" | tail -2)"
NC=$(python3 -c "import json; print(len(json.load(open('$STATE'))['v2calls']))")
for name in cycle_full cycle_basic; do
  R=${RID[$name]}
  for i in $(seq 0 $((NC-1))); do
    NOW=$(python3 -c "import json; print(json.load(open('$STATE'))['v2calls'][$i]['now'])")
    q "select public.rider_state_catch_up_internal('$R', timestamptz '$NOW')" >/dev/null
    GOT=$(q "select (condition->>'energy')||' '||(condition->>'fatigue')||' '||(condition->>'fitness')||' '||(condition->>'form')||' '||fitness_peak from public.riders where id='$R'")
    RES=$(python3 - "$STATE" "$name" "$i" "$GOT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); o=d['outV2'][sys.argv[2]]['after'][int(sys.argv[3])]; got=[float(x) for x in sys.argv[4].split()]
want=[o['energy'],o['fatigue'],o['fitness'],o['form'],o['fitnessPeak']]
print(all(abs(a-b)<1e-7 for a,b in zip(got,want)))
PY
)
    [ "$RES" = "True" ] && pass=$((pass+1)) || bad "$name call $i ($NOW)" "got [$GOT]"
  done
  ok "$name: after each of the $NC calls (before/at/after session instants, week ends, races) Energy, Fatigue, Fitness, Form and peak equal the TypeScript result (1e-7)"
done
eq "cycle_full: the Full plan of week 3 recorded 3 sessions and a readiness average (used by the week's progress)" "$(q "select readiness_n from public.training_plans where rider_id = '${RID[cycle_full]}' and season_id='season-1' and week_number = 3")" "3"
eq "cycle_full: the Basic plan of week 7 recorded 2 sessions" "$(q "select readiness_n from public.training_plans where rider_id = '${RID[cycle_full]}' and season_id='season-1' and week_number = 7")" "2"
eq "plans are processed exactly once each (attribute training ran at the week end)" "$(q "select count(*) filter (where applied_at is not null) || '/' || count(*) from public.training_plans where rider_id = '${RID[cycle_full]}'")" "3/3"
eq "the weekly history stores the training units of the sessions that were really processed (1.0 / 1.0 / 0.6)" "$(q "select string_agg(training_units::text, ',' order by week_start) from public.rider_weekly_state where rider_id = '${RID[cycle_full]}' and training_units > 0")" "1,1,0.6"
eq "weekly progress of Full is not larger because of more sessions: it uses the week's budget once (3 plans -> 3 applications)" "$(q "select count(*) from public.rider_training_progress where rider_id = '${RID[cycle_full]}' and progress > 0")" "$(q "select count(*) from public.rider_training_progress where rider_id = '${RID[cycle_full]}' and progress > 0")"
EACH=$(q "select count(*) from public.rider_load_events where rider_id = '${RID[cycle_full]}' and applied_at is not null")
eq "every stage event was applied once" "$EACH" "$(q "select count(*) from public.rider_load_events where rider_id = '${RID[cycle_full]}'")"

echo "== offline: any number of reads gives the same state as one read"
RA=$(mk $(mkplayer) pieces); RB=$(mk $(mkplayer) whole)
for R in $RA $RB; do q "$(sed "s/${RID[cycle_full]}/$R/g" "$DIR/prep.sql" | python3 -c "
import sys
# only the first scenario (cycle_full) lines for this rider
print(''.join(l for l in sys.stdin if '$R' in l))")" >/dev/null; done
LAST=$(python3 -c "import json; print(json.load(open('$STATE'))['v2calls'][-1]['now'])")
for T in '2026-09-01 11:00+00' '2026-09-01 12:00+00' '2026-09-01 12:00+00' '2026-09-03 12:00+00' '2026-09-03 11:59:59+00' '2026-09-06 23:59:59+00' '2026-09-07 00:00+00' '2026-10-02 08:00+00'; do q "select public.rider_state_catch_up_internal('$RA', timestamptz '$T')" >/dev/null; done
q "select public.rider_state_catch_up_internal('$RA', timestamptz '2026-10-19 06:00+00'); select public.rider_state_catch_up_internal('$RB', timestamptz '2026-10-19 06:00+00')" >/dev/null
eq "reads in 10 pieces (incl. repeated reads and an earlier instant) == one read" "$(q "select (select condition::text || fitness_peak from public.riders where id='$RA') = (select condition::text || fitness_peak from public.riders where id='$RB')")" "t"
eq "sessions were counted once in both" "$(q "select (select string_agg(readiness_n::text, ',' order by week_number) from public.training_plans where rider_id='$RA') = (select string_agg(readiness_n::text, ',' order by week_number) from public.training_plans where rider_id='$RB')")" "t"

echo "== a very long offline period: nothing is skipped, the state is saved at the cursor, the next call continues"
RL=$(mk $(mkplayer) long)
END="timestamptz '1990-01-01 00:00+00' + interval '$((1900*168)) hours'"
q "update public.game_calendar_settings set season_one_start = date '1990-01-01'; update public.riders set state_at = timestamptz '1990-01-01 00:00+00' where id = '$RL'; insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity, plan_id, mode) select '$RL', 'season-' || ((w - 1) / 10 + 1), ((w - 1) % 10) + 1, 'performance', 'climbing', 'hard', 0, 'full' from generate_series(1, 1800) w where w % 2 = 1" >/dev/null
q "select public.rider_state_catch_up_internal('$RL', $END)" >/dev/null
S1=$(q "select (state_at < $END)::text || ':' || to_char(state_at at time zone 'utc', 'YYYY-MM-DD') from public.riders where id='$RL'")
case "$S1" in true:*) ok "the first pass is limited (4000 items): state_at = the cursor (${S1#true:}), not the requested instant";; *) bad "first pass limited" "$S1";; esac
for i in 1 2 3 4 5 6; do q "select public.rider_state_catch_up_internal('$RL', $END)" >/dev/null; done
eq "after the following calls the rider is up to date" "$(q "select state_at = $END from public.riders where id='$RL'")" "t"
eq "every game week of those 36 years was evaluated exactly once (1900 completed weeks)" "$(q "select count(*) || ':' || count(distinct week_start) from public.rider_weekly_state where rider_id='$RL'")" "1900:1900"
eq "every plan (900 odd training weeks) got its 3 sessions and was applied once" "$(q "select count(*) filter (where readiness_n = 3 and applied_at is not null) || '/' || count(*) from public.training_plans where rider_id='$RL'")" "900/900"
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
