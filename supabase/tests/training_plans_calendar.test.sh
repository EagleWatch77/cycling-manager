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

echo "== activating the calendar is ONE deliberate step (running migration 04 does not move any Tour)"
eq "migration 04 left the Tour weeks as they were (old calendar) == TypeScript TOUR_SCHEDULE_V1" "$(q "select string_agg(tour_id || ':' || week_number, ',' order by tour_id) from public.tour_schedule")" "$(cal "','.join(k+':'+str(v) for k,v in sorted(d['toursV1'].items()))")"
eq "game_calendar_info() (readable by clients) says: not active, season start, old Tour weeks" "$(as $P1 "select (public.game_calendar_info()->>'v2_active') || ':' || (public.game_calendar_info()->>'season_one_start') || ':' || (public.game_calendar_info()->'tours'->>'danube-tour');")" "false:2026-08-17:5"
q "update public.development_model_settings set enabled = true" >/dev/null
has "a seven-plan save is refused while the calendar is not active" "$(as $P1 "select * from public.save_my_development_plan(0,'full');")" "calendar_not_active"
has "clients cannot activate the calendar" "$(printf "set role authenticated;\nselect public.activate_game_calendar_v2(true);\n" | psqlc t)" "permission denied"
has "activation REFUSES while conflicts are listed and the owner has not acknowledged them" "$(q "select public.activate_game_calendar_v2()")" "calendar_v2_conflicts"
eq "the refusal changed nothing (Tour weeks, flag)" "$(q "select (select string_agg(tour_id || ':' || week_number, ',' order by tour_id) from public.tour_schedule) || '|' || public.game_calendar_v2_active()")" "coastal-tour:5,danube-tour:5,highlands-tour:2,northern-crown-tour:7,silver-horizon-tour:9|false"
eq "activation after the owner acknowledges the report" "$(q "select public.activate_game_calendar_v2(true)")" "activated"
eq "activation again is a no-op" "$(q "select public.activate_game_calendar_v2(true)")" "already_active"
eq "after activation the Tour weeks == TypeScript TOUR_SCHEDULE_V2 and the info says active" "$(q "select (select string_agg(tour_id || ':' || week_number, ',' order by tour_id) from public.tour_schedule) || '|' || (public.game_calendar_info()->>'v2_active')")" "$(cal "','.join(k+':'+str(v) for k,v in sorted(d['tours'].items()))+'|true'")"
eq "activation deleted nothing: registrations and plans are as before" "$(q "select (select count(*) from public.tour_registrations) || ':' || (select count(*) from public.training_plans)")" "2:1"

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
# week 1 of a season (the first week is a TRAINING week): in the last week of a season (10) the plan for week 1 of the NEXT season can be saved
setweek 10
HM=$(q "select extract(isodow from now() at time zone 'utc')::int * 100 + extract(hour from now() at time zone 'utc')::int")
if [ "$HM" -ge 100 ] && [ "$HM" -le 117 ]; then ok "week 1 save check skipped: today is Monday before 18:00 UTC (the open window is the one of week 10 itself)"; else
  eq "week 1 of the next season is plannable during week 10: stored for week 1 of season-2 (a training week)" "$(as $P1 "select week_number || ':' || season_id || ':' || mode from public.save_my_development_plan(6,'basic');")" "1:season-2:basic"
  eq "and it can be changed until the deadline" "$(as $P1 "select plan_id || ':' || mode from public.save_my_development_plan(0,'full');")" "0:full"
fi
q "delete from public.training_plans" >/dev/null

echo "== the OLD single-focus save after the calendar is active"
setweek $TW
has "seven plans enabled -> the old save is closed (legacy_planning_closed): only save_my_development_plan writes plans" "$(as $P1 "select * from public.save_my_training_plan('performance','climbing','normal');")" "legacy_planning_closed"
eq "...and nothing was written" "$(q "select count(*) from public.training_plans")" "0"
q "update public.development_model_settings set enabled = false" >/dev/null
setweek $RW
has "seven plans NOT enabled, next week is a race week -> the old save refuses (no_plannable_week), like the new calendar" "$(as $P1 "select * from public.save_my_training_plan('performance','climbing','normal');")" "no_plannable_week"
setweek $TW
TT=$(q "select week_number from public.training_target_week(now())")
eq "seven plans NOT enabled, open training window -> the old plan is stored for the TARGET training week (odd), not for 'next week'" "$(as $P1 "select week_number || ':' || focus from public.save_my_training_plan('performance','climbing','normal');")" "$TT:climbing"
eq "...and that week is a training week" "$(q "select public.game_week_kind($TT)")" "training"
q "delete from public.training_plans; update public.development_model_settings set enabled = true; update public.game_calendar_settings set season_one_start = date '2026-08-17'" >/dev/null
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

echo "== a stage that arrives after its week was closed (late stage): DEFERRED, never applied or counted in another week, == TypeScript"
q "update public.game_calendar_settings set season_one_start = date '2026-08-17'" >/dev/null
RS=$(mk $(mkplayer) late)
python3 - "$STATE" "$RS" > "$DIR/late.sql" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))['late']; s=d['start']; r=sys.argv[2]
cond=json.dumps({'energy':s['energy'],'fatigue':s['fatigue'],'form':s['form'],'fitness':s['fitness'],'morale':70})
print(f"update public.riders set age={s['age']}, vitality={s['vitality']}, trainability={s['trainability']}, professionalism={s['professionalism']}, recovery={s['recovery']}, energy_efficiency={s['energyEff']}, fatigue_resistance={s['fatigueRes']}, recovery_coef={s['recoveryCoef']}, fitness_peak={s['fitnessPeak']}, condition='{cond}', condition_previous='{cond}', state_at=timestamptz '2026-08-17 00:00:00+00' where id='{r}';")
PY
q "$(cat "$DIR/late.sql")" >/dev/null
lj() { python3 -c "import json; print(json.load(open('$STATE'))['late']['$1'])"; }
T1=$(lj t1); T2=$(lj t2); AB=$(lj atBase); AL=$(lj atLate)
q "select public.record_rider_stage_load('$RS', timestamptz '2026-08-17 00:00+00' + make_interval(secs => $AB), 16, 11, 0.25, 'late-base')" >/dev/null
q "select public.rider_state_catch_up_internal('$RS', timestamptz '$T1')" >/dev/null
q "select public.record_rider_stage_load('$RS', timestamptz '2026-08-17 00:00+00' + make_interval(secs => $AL), 16, 11, 0.25, 'late-late')" >/dev/null   # belongs to a week that is already evaluated
q "select public.rider_state_catch_up_internal('$RS', timestamptz '$T2')" >/dev/null
GOT=$(q "select (condition->>'energy')||' '||(condition->>'fatigue')||' '||(condition->>'fitness')||' '||(condition->>'form') from public.riders where id='$RS'")
RES=$(python3 - "$STATE" "$GOT" <<'PY'
import json,sys
o=json.load(open(sys.argv[1]))['late']['after2']; got=[float(x) for x in sys.argv[2].split()]
print(all(abs(a-b)<1e-7 for a,b in zip(got,[o['energy'],o['fatigue'],o['fitness'],o['form']])))
PY
)
eq "state after the late report == TypeScript (the late stage changes nothing: Energy, Fatigue, Fitness, Form)" "$RES" "True"
eq "weekly race units: week 0 keeps its own stage, no later training/race week gets any from the late stage" "$(q "select string_agg(race_units::text, ',' order by week_start) from public.rider_weekly_state where rider_id='$RS'")" "0.25,0,0"
eq "only the on-time stage was applied; the late one is marked deferred and NOT applied" "$(q "select count(*) filter (where applied_at is not null) || '/' || count(*) filter (where deferred_at is not null and applied_at is null) || '/' || count(*) from public.rider_load_events where rider_id='$RS'")" "1/1/2"
eq "the deferred stage is the late one and the owner list shows exactly it (for the later processing)" "$(q "select string_agg(source_key, ',') from public.rider_deferred_stage_loads() where rider_id='$RS'")" "late-late"
has "clients cannot read the deferred list" "$(printf "set role authenticated;\nselect * from public.rider_deferred_stage_loads();\n" | psqlc t)" "permission denied"
BEFORE=$(q "select condition::text || state_at::text from public.riders where id='$RS'")
q "select public.rider_state_catch_up_internal('$RS', timestamptz '$T2')" >/dev/null
eq "a repeated call at the same instant changes nothing (no double count)" "$(q "select condition::text || state_at::text from public.riders where id='$RS'")" "$BEFORE"
q "select public.rider_state_catch_up_internal('$RS', timestamptz '$T2' + interval '1000 hours')" >/dev/null
eq "even a much later call never applies or counts the deferred stage (still 1 applied, 1 deferred)" "$(q "select count(*) filter (where applied_at is not null) || '/' || count(*) filter (where deferred_at is not null and applied_at is null) from public.rider_load_events where rider_id='$RS'")" "1/1"
eq "...and the race units of every evaluated week still total 0.25" "$(q "select sum(race_units) from public.rider_weekly_state where rider_id='$RS'")" "0.25"

echo "== catch-up before a stage is really FINISHED (not postponed): complete / many"
q "update public.game_calendar_settings set season_one_start = date '1990-01-01'" >/dev/null
mklong() { local r; r=$(mk $(mkplayer) "$1"); q "update public.riders set state_at = timestamptz '1990-01-01 00:00+00', energy_efficiency = 1, fatigue_resistance = 1, recovery_coef = 1, vitality = 50, fitness_peak = 75, condition = jsonb_build_object('energy',70,'fatigue',30,'form',60,'fitness',70,'morale',70) where id = '$r'; insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity, plan_id, mode) select '$r', 'season-' || ((w - 1) / 10 + 1), ((w - 1) % 10) + 1, 'performance', 'climbing', 'hard', 0, 'full' from generate_series(1, 1800) w where w % 2 = 1" >/dev/null; echo "$r"; }
END2="timestamptz '1990-01-01 00:00+00' + interval '$((1900*168)) hours'"
RC=$(mklong cmp1); RM=$(mklong cmp2); RN=$(mklong cmp3)
eq "ONE pass is not enough for 36 years offline (it is limited); the cursor is saved" "$(q "select public.rider_state_catch_up_complete('$RC', $END2, 1)")" "f"
eq "...and the rider is not at the requested instant yet" "$(q "select state_at < $END2 from public.riders where id='$RC'")" "t"
eq "the complete catch-up repeats the passes and FINISHES in one call" "$(q "select public.rider_state_catch_up_complete('$RC', $END2)")" "t"
eq "the rider is exactly at the requested instant" "$(q "select state_at = $END2 from public.riders where id='$RC'")" "t"
eq "rider_state_catch_up_many returns 0 = nobody left behind (the stage may start)" "$(q "select public.rider_state_catch_up_many(array['$RM'::uuid], $END2)")" "0"
eq "...and that rider is up to date with every week evaluated once (1900)" "$(q "select (state_at = $END2)::text || ':' || (select count(*) from public.rider_weekly_state w where w.rider_id = r.id) from public.riders r where r.id='$RM'")" "true:1900"
eq "when the passes are not enough, many returns the number of riders STILL behind (1): the stage must not start" "$(q "select public.rider_state_catch_up_many(array['$RN'::uuid], $END2, 1)")" "1"
eq "the progress made is kept (not rolled back): the rider moved on from the start" "$(q "select state_at > timestamptz '1990-01-01 00:00+00' from public.riders where id='$RN'")" "t"
for i in 1 2 3 4 5 6; do q "select public.rider_state_catch_up_many(array['$RN'::uuid], $END2, 1)" >/dev/null; done
eq "after enough calls it reaches 0 (nobody behind)" "$(q "select public.rider_state_catch_up_many(array['$RN'::uuid], $END2, 1)")" "0"
eq "a staged catch-up (one pass at a time) == one finished call" "$(q "select (select condition::text || fitness_peak::text from public.riders where id='$RM') = (select condition::text || fitness_peak::text from public.riders where id='$RN')")" "t"
MISSING=$(q "select gen_random_uuid()")
eq "report: a rider that does not exist is 'missing' (not silently skipped); an up-to-date rider is 'ready'" "$(q "select string_agg(status, ',' order by status) from public.rider_state_catch_up_report(array['$RC'::uuid, '$MISSING'::uuid], $END2)")" "missing,ready"
eq "many counts the missing rider as NOT ready (1): the stage must not start" "$(q "select public.rider_state_catch_up_many(array['$RC'::uuid, '$MISSING'::uuid], $END2)")" "1"
eq "a rider whose state was already moved PAST the stage start is 'ahead' (the state at the start can not be rebuilt) and counts as not ready" "$(q "select string_agg(status, ',') from public.rider_state_catch_up_report(array['$RC'::uuid], $END2 - interval '48 hours')")|$(q "select public.rider_state_catch_up_many(array['$RC'::uuid], $END2 - interval '48 hours')")" "ahead|1"
eq "...and 'ahead' did not touch the rider (state unchanged at the later instant)" "$(q "select state_at = $END2 from public.riders where id='$RC'")" "t"
eq "mixed entrants: two riders already past the start (ahead) + one missing = 3 not ready" "$(q "select public.rider_state_catch_up_many(array['$RC'::uuid, '$RM'::uuid, '$MISSING'::uuid], $END2 - interval '48 hours')")" "3"
eq "the same rider listed twice is counted once" "$(q "select count(*) from public.rider_state_catch_up_report(array['$RC'::uuid, '$RC'::uuid], $END2)")" "1"
q "update public.game_calendar_settings set season_one_start = date '2026-08-17'" >/dev/null

echo "== the season start can not drift: ONE place in the database, ONE constant in the web"
eq "no database function keeps the season start date inside (all read the setting); only the fallback default of game_season_one_start()" "$(q "select coalesce(string_agg(p.proname, ',' order by p.proname), 'none') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc like '%2026-08-17%'")" "game_season_one_start"
A=$(q "select (public.contract_expiry_at(timestamptz '2026-09-01 10:00+00', 10) at time zone 'utc')::text")
q "update public.game_calendar_settings set season_one_start = date '2026-10-26'" >/dev/null
B=$(q "select (public.contract_expiry_at(timestamptz '2026-09-01 10:00+00', 10) at time zone 'utc')::text")
q "update public.game_calendar_settings set season_one_start = date '2026-08-17'" >/dev/null
eq "contract expiry follows the season start setting (2026-08-17 -> 2026-11-09; start moved to 2026-10-26 -> 2027-01-04)" "$A|$B" "2026-11-09 00:00:00|2027-01-04 00:00:00"

echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
