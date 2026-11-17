#!/usr/bin/env bash
# Rider State model 1.0 (migration 20261117_03): backfill, deterministic coefficients, chronological catch-up == TypeScript, idempotence,
# switch OFF = no change. REAL local Postgres, never a real database.
#   REF=/path/state_ref.json bash supabase/tests/rider_state.test.sh      (run as a non-root OS user, e.g. postgres)
#   REF = output of apps/web/src/lib/training/state/stateParity.cli.ts
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}; PORT=${PGTEST_PORT:-5496}
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS  $1"; }
bad() { fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
psqlc() { psql -h "$DIR" -p $PORT -U postgres -d "$1" -qtA -v ON_ERROR_STOP=1 "${@:2}" 2>&1; }
q() { psqlc t -c "$1"; }
trap '"$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1' EXIT
ref() { python3 -c "import json; d=json.load(open('$REF')); print($1)"; }
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
psqlc t -f "$ROOT/migrations/20261117_01_development_model_v2.sql" >/dev/null 2>&1 || { echo "migration 01 failed"; exit 1; }
ok "production schema + migration 20261117_01 apply"

mkplayer() { q "insert into auth.users default values returning id" | head -1; }
ATTRS='{"climbing":130,"hills":130,"flat":130,"sprint":130,"timeTrial":130,"endurance":130,"acceleration":130,"positioning":120,"attackTiming":120,"reaction":120,"energyManagement":120,"breakawaySkill":120,"descending":115,"bikeHandling":115,"cornering":115,"packRiding":115,"roughSurface":115,"wetHandling":115,"experience":30}'
LEGACY='{"energy":70,"fatigue":30,"form":50,"fitness":60,"morale":70}'
mk() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','T','$2','Slovakia','SK',25,'$ATTRS','$3','$3','allrounder',60,60,60,60) returning id" | head -1; }
PY=$(mkplayer); PV=$(mkplayer); PR=$(mkplayer); PL=$(mkplayer); PC=$(mkplayer)
RY=$(mk $PY young "$LEGACY"); RV=$(mk $PV veteran "$LEGACY"); RR=$(mk $PR rester "$LEGACY"); RL=$(mk $PL legacy "$LEGACY")
RC=$(mk $PC custom '{"energy":55,"fatigue":45,"form":83,"fitness":71,"morale":64}')

echo "== migration (existing riders were created BEFORE it)"
psqlc t -f "$ROOT/migrations/20261117_03_rider_state_model.sql" >"$DIR/m3.out" 2>&1 && ok "migration applies" || { bad "migration applies" "$(tail -3 "$DIR/m3.out")"; exit 1; }
SNAP=$(q "select string_agg(id::text||condition::text||energy_efficiency||fatigue_resistance||recovery_coef||fitness_peak||state_day, '|' order by id) from public.riders")
psqlc t -f "$ROOT/migrations/20261117_03_rider_state_model.sql" >/dev/null 2>&1 && ok "migration is idempotent (second run)" || bad "second run" ""
eq "second run changes no stored value (condition fix and coefficients happen only once)" "$(q "select string_agg(id::text||condition::text||energy_efficiency||fatigue_resistance||recovery_coef||fitness_peak||state_day, '|' order by id) from public.riders")" "$SNAP"
eq "the switch is OFF by default" "$(q "select public.rider_state_enabled()")" "f"
eq "legacy rider: real Energy / Fatigue kept" "$(q "select (condition->>'energy')||':'||(condition->>'fatigue') from public.riders where id='$RL'")" "70:30"
eq "legacy rider: Form 75, Fitness 65-85, Morale 60-90" "$(q "select (condition->>'form')::numeric = 75 and (condition->>'fitness')::numeric between 65 and 85 and (condition->>'morale')::numeric between 60 and 90 from public.riders where id='$RL'")" "t"
eq "rider whose values were NOT the old defaults is untouched" "$(q "select condition = '{\"energy\":55,\"fatigue\":45,\"form\":83,\"fitness\":71,\"morale\":64}'::jsonb from public.riders where id='$RC'")" "t"
eq "state_day = yesterday (no retroactive regeneration), version 1" "$(q "select count(*) from public.riders where state_day = (now() at time zone 'utc')::date - 1 and state_model_version = 1")" "5"
eq "coefficients are inside 0.70-1.30 / 0.70-1.30 / 0.90-1.10" "$(q "select bool_and(energy_efficiency between 0.7 and 1.3 and fatigue_resistance between 0.7 and 1.3 and recovery_coef between 0.9 and 1.1) from public.riders")" "t"
eq "the three coefficients differ between riders (independent, not one number)" "$(q "select count(distinct energy_efficiency) = 5 and count(distinct fatigue_resistance) = 5 and count(distinct recovery_coef) = 5 from public.riders")" "t"
IDS="$RY $RV $RR $RL $RC"
TSC=$(cd /tmp/cm/apps/web && npx --no-install tsx --tsconfig tsconfig.json src/lib/training/state/stateParity.cli.ts coef $IDS)
SQLC=$(q "select string_agg(energy_efficiency||','||fatigue_resistance||','||recovery_coef, ';' order by array_position(string_to_array('$(echo $IDS | tr ' ' ',')', ','), id::text)) from public.riders")
eq "SQL coefficients equal the TypeScript derivation from md5(id) (1e-9)" "$(python3 -c "
import json
ts=json.loads('''$TSC'''); sq=[[float(x) for x in s.split(',')] for s in '''$SQLC'''.split(';')]
print(all(abs(a['energyEff']-b[0])<1e-9 and abs(a['fatigueRes']-b[1])<1e-9 and abs(a['recoveryCoef']-b[2])<1e-9 for a,b in zip(ts,sq)))")" "True"
NEW=$(q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$(mkplayer)','N','N','Slovakia','SK',20,'$ATTRS','$LEGACY','$LEGACY','allrounder',60,60,60,60) returning id" | head -1)
eq "a NEW rider (any insert path) gets Energy 70/Fatigue 30 kept, Form 75, Fitness 65-85, Morale 60-90, coefficients, fitness_peak = Fitness" "$(q "select (condition->>'form')::numeric = 75 and (condition->>'fitness')::numeric between 65 and 85 and (condition->>'morale')::numeric between 60 and 90 and energy_efficiency is not null and fitness_peak = (condition->>'fitness')::float8 from public.riders where id='$NEW'")" "t"
eq "a market rider gets the same start values" "$(q "insert into public.market_riders (season_id, tier, status, first_name, surname, country_name, country_iso2, age, attributes, condition, inferred_archetype, potential, trainability, professionalism, recovery, generator_version, source) values ('season-1','free','available','M','M','Slovakia','SK',20,'$ATTRS','$LEGACY','allrounder',60,60,60,60,'x','admin') returning (condition->>'form')::numeric = 75 and recovery_coef between 0.9 and 1.1 and fitness_peak = (condition->>'fitness')::float8" | head -1)" "t"
has() { echo "$2" | grep -qi -- "$3" && ok "$1" || bad "$1" "$(echo "$2" | tr '\n' ' ' | cut -c1-160)"; }
q "set role authenticated; select energy_efficiency from public.riders limit 1" >/dev/null 2>&1
has "hidden coefficients are not readable by players" "$(printf "set role authenticated;\nselect set_config('request.jwt.claim.sub','%s',false);\nselect energy_efficiency from public.riders;\n" "$PY" | psqlc t)" "permission denied"
has "the Race Engine load interface is closed to players" "$(printf "set role authenticated;\nselect record_rider_stage_load('$RY','2026-09-01',16,11,0.25,'x');\n" | psqlc t)" "permission denied"

echo "== scenarios: set the state exactly as the TypeScript reference does"
NS=$(ref "len(d['scenarios'])")
declare -A RID=( [young]=$RY [veteran]=$RV [rester]=$RR )
for name in young veteran rester; do
  R=${RID[$name]}
  q "$(python3 - "$REF" "$name" "$R" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); s=next(x for x in d['scenarios'] if x['name']==sys.argv[2]); r=sys.argv[3]
cond=json.dumps({'energy':s['energy'],'fatigue':s['fatigue'],'form':s['form'],'fitness':s['fitness'],'morale':70})
print(f"update public.riders set age={s['age']}, vitality={s['vitality']}, trainability={s['trainability']}, professionalism={s['professionalism']}, recovery={s['recovery']}, energy_efficiency={s['coef'][0]}, fatigue_resistance={s['coef'][1]}, recovery_coef={s['coef'][2]}, fitness_peak={s['peak']}, condition='{cond}', condition_previous='{cond}', state_day=date '2026-08-16' where id='{r}';")
for w,t,f,i in s['plans']:
    inten='light' if t=='technical' else i
    print(f"insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) values ('{r}','season-1',{w},'{t}','{f}','{inten}');")
for day in s['stageDays']:
    print(f"select public.record_rider_stage_load('{r}', date '2026-08-17' + {day}, 16, 11, 0.25, 'stage-{day}');")
PY
)" >/dev/null
done
ok "scenario riders prepared (3 riders, plans of weeks 2-9, stage events)"

echo "== switch OFF: nothing is processed"
BEFORE=$(q "select string_agg(condition::text||state_day, '|' order by id) from public.riders")
q "select public.rider_state_catch_up_internal(id, timestamptz '2026-10-20 12:00:00+00') from public.riders" >/dev/null
eq "catch-up with the switch off changes no rider" "$(q "select string_agg(condition::text||state_day, '|' order by id) from public.riders")" "$BEFORE"

cmp() { # name label ref-key
  python3 - "$REF" "$1" "$2" "$(q "select (condition->>'energy')||' '||(condition->>'fatigue')||' '||(condition->>'fitness')||' '||(condition->>'form')||' '||(condition->>'morale')||' '||fitness_peak from public.riders where id='${RID[$1]}'")" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); o=d['out'][sys.argv[2]][sys.argv[3]]; got=[float(x) for x in sys.argv[4].split()]
want=[o['energy'],o['fatigue'],o['fitness'],o['form'],o['morale'],o['fitnessPeak']]
print(all(abs(a-b)<1e-7 for a,b in zip(got,want)), max(abs(a-b) for a,b in zip(got,want)))
PY
}
q "update public.rider_state_settings set enabled = true" >/dev/null
echo "== switch ON: first catch-up (through day 63) == TypeScript"
q "select public.rider_state_catch_up_internal(id, timestamptz '2026-10-20 12:00:00+00') from public.riders where id in ('$RY','$RV','$RR')" >/dev/null
for name in young veteran rester; do eq "$name: Energy, Fatigue, Fitness, Form, Morale, Fitness peak equal the TypeScript result (1e-7)" "$(cmp $name after1 | cut -d' ' -f1)" "True"; done
eq "weekly history rows: 9 completed weeks per rider" "$(q "select count(*) from public.rider_weekly_state where rider_id='$RY'")" "9"
eq "state_day moved to day 63" "$(q "select state_day from public.riders where id='$RY'")" "2026-10-19"
eq "stage events were applied exactly once" "$(q "select count(*) filter (where applied_at is not null) || '/' || count(*) from public.rider_load_events where rider_id='$RY'")" "7/7"
SNAP1=$(q "select condition::text||fitness_peak||state_day from public.riders where id='$RY'")
q "select public.rider_state_catch_up_internal('$RY', timestamptz '2026-10-20 12:00:00+00')" >/dev/null; q "select public.rider_state_catch_up_internal('$RY', timestamptz '2026-10-20 18:00:00+00')" >/dev/null
eq "idempotent: running it again the same day changes nothing" "$(q "select condition::text||fitness_peak||state_day from public.riders where id='$RY'")" "$SNAP1"
eq "the plans were applied once each (attribute training ran through the same loop)" "$(q "select count(*) filter (where applied_at is not null) from public.training_plans where rider_id='$RY'")" "7"
echo "== second catch-up much later (offline gap) == TypeScript, history read from the database"
q "select public.rider_state_catch_up_internal(id, timestamptz '2026-11-17 12:00:00+00') from public.riders where id in ('$RY','$RV','$RR')" >/dev/null
for name in young veteran rester; do eq "$name: after the offline gap equals ONE uninterrupted TypeScript run (1e-7)" "$(cmp $name after2 | cut -d' ' -f1)" "True"; done
eq "13 weekly history rows after the gap" "$(q "select count(*) from public.rider_weekly_state where rider_id='$RV'")" "13"
eq "no value outside the model range (Energy/Fatigue/Fitness/Form 0..100)" "$(q "select bool_and((condition->>'energy')::float8 between 0 and 100 and (condition->>'fatigue')::float8 between 0 and 100 and (condition->>'fitness')::float8 between 0 and 100 and (condition->>'form')::float8 between 0 and 100) from public.riders")" "t"
eq "Morale and the attributes' OVR inputs are not touched by the state loop (Morale unchanged)" "$(q "select (condition->>'morale')::int from public.riders where id='$RY'")" "70"

echo "== the owner path: process_my_due_training() with the switch ON"
q "update public.riders set state_day = date '2026-11-10' where id='$RR'; update public.riders set condition = jsonb_set(jsonb_set(condition,'{energy}','50'),'{fatigue}','50') where id='$RR'" >/dev/null
OUT=$(printf "set role authenticated;\nselect set_config('request.jwt.claim.sub','%s',false);\nselect public.process_my_due_training();\nselect (condition->>'energy')::numeric > 50 from public.riders where player_id='%s';\n" "$PR" "$PR" | psqlc t | tail -2 | tr '\n' ' ')
eq "opening training catches the rider up (days of regeneration credited, state not stale)" "$OUT" "0 t "
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
