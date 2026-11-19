#!/usr/bin/env bash
# SAFETY OF THE ADMIN MARKET RESET + meaning of market_riders.season_id (owner request 2026-11-19). Setup copied from rider_swaps_state.test.sh (latest migration chain),
# then: real swap/return scenarios and the exact statement of resetAvailableMarketPool() run as an admin. REAL local Postgres, never a real database.
# (setup origin: GENERATED REGRESSION VARIANT of rider_swaps.test.sh (Scenario A only): the same 105 swap/market assertions with migrations 20261117_01 + 20261117_03 applied on top
# (state switch OFF = previous behaviour), plus section 14: state-model ON - a transfer carries the CURRENT state and the hidden individual values unchanged.
# Market purchase + weekly rider swap (migration 20261116_02) against a REAL local Postgres 16.
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/rider_swaps.test.sh   (run as a non-root user, e.g. postgres)
# Scenario A: existing production DB (legacy riders + training) -> migrations 01-08. Scenario B: fresh schema.sql == A.
# Supabase auth schema/roles are stubbed. Never touches a real database.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}
PORT=${PGTEST_PORT:-5498}
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

psqlc postgres -c "select 1" >/dev/null
echo "== Scenario A: existing production database with legacy riders"
psqlc t -f "$BASE" >/dev/null 2>&1 || { echo "base schema failed"; exit 1; }
for m in 20261114_01_tour_season_registrations 20261114_02_league_divisions 20261114_03_profiles_lockdown; do
  psqlc t -f "$ROOT/migrations/$m.sql" >/dev/null 2>&1 || { echo "migration $m failed"; exit 1; }
done
mkplayer() { q "insert into auth.users default values returning id" | head -1; }
P1=$(mkplayer); P2=$(mkplayer); P3=$(mkplayer); P4=$(mkplayer); P5=$(mkplayer); PREM=$(mkplayer); PREM2=$(mkplayer)
ATTRS=$(python3 -c "
import json
keys='climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding roughSurface wetHandling experience'.split()
print(json.dumps({k:130 for k in keys}))")
COND='{"energy":70,"fatigue":30,"form":50,"fitness":60,"morale":70}'
mkrider() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','Test','$2','Slovakia','SK',20,'$ATTRS','$COND','$COND','allrounder',80,80,70,70) returning id" | head -1; }
R1=$(mkrider "$P1" One); R2=$(mkrider "$P2" Two); RP=$(mkrider "$PREM" Prem); RP2=$(mkrider "$PREM2" Prem2)
AI=$(q "insert into public.riders (player_id, is_ai, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values (null,true,'Ai','Filler','Slovakia','SK',21,'$ATTRS','$COND','$COND','climber',90,90,90,90) returning id" | head -1)
for m in 20261115_01_training_security 20261115_02_training_calendar_rules; do
  psqlc t -f "$ROOT/migrations/$m.sql" >/dev/null 2>&1 || { echo "migration $m failed"; exit 1; }
done
q "insert into public.premium_entitlements (user_id) values ('$PREM'), ('$PREM2')" >/dev/null
BEFORE_RIDERS=$(q "select count(*) from public.riders"); BEFORE_ATTR=$(q "select attributes::text from public.riders where id='$R1'")
psqlc t -f "$ROOT/migrations/20261115_03_rider_development_tracking.sql" >/dev/null 2>&1 || { echo "migration 03 failed"; exit 1; }
M="$ROOT/migrations/20261116_01_rider_contracts.sql"
BEFORE_ACQ=$(q "select count(*) from public.rider_acquisitions"); BEFORE_HIST=$(q "select count(*) from public.rider_attribute_history")
psqlc t -f "$M" >/dev/null 2>&1 || { echo "migration 07 failed"; exit 1; }
M2="$ROOT/migrations/20261116_02_market_purchase_and_swap.sql"
psqlc t -f "$M2" >/dev/null 2>&1 && ok "migration 08 applies on top of legacy data" || { bad "migration 08 applies" "$(psqlc t -f "$M2" | tail -3)"; exit 1; }
psqlc t -f "$M2" >/dev/null 2>&1 && ok "migration 08 is idempotent (second run)" || bad "second run" "$(psqlc t -f "$M2" | tail -3)"
psqlc t -f "$ROOT/migrations/20261117_01_development_model_v2.sql" >/dev/null 2>&1 || { echo "dev v2 migration failed"; exit 1; }
psqlc t -f "$ROOT/migrations/20261117_03_rider_state_model.sql" >/dev/null 2>&1 || { echo "state migration failed"; exit 1; }
psqlc t -f "$ROOT/migrations/20261117_04_training_plans_calendar.sql" >/dev/null 2>&1 || { echo "migration 04 failed"; exit 1; }
ok "state-model migration applies on top"



mkp() { q "insert into auth.users default values returning id" | head -1; }
mkr() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','Own','$2','Slovakia','SK',19,'$ATTRS','$COND','$COND','allrounder',80,80,70,70) returning id" | head -1; }
MK() { q "insert into public.market_riders (season_id, tier, status, first_name, surname, country_name, country_iso2, age, attributes, condition, inferred_archetype, potential, trainability, professionalism, recovery, source) values ('season-2','free','available','Mk','$1','Slovakia','SK',${2:-18},'$ATTRS','$COND','allrounder',66,67,68,69,'admin') returning id" | head -1; }
league_up() { as "$1" "select public.assign_my_league_division();" >/dev/null; }
errtxt() { echo "$1" | tr '\n' ' ' | cut -c1-160; }

echo "== 1. legacy data untouched, switch is OFF"
eq "swap feature is disabled by default" "$(q "select enabled::text from public.rider_swap_settings")" "false"
eq "no rider deleted, attributes untouched" "$(q "select (select count(*) from public.riders)||':'||(select attributes::text from public.riders where id='$R1')" )" "$BEFORE_RIDERS:$BEFORE_ATTR"
eq "no riders row is 'on market' yet" "$(q "select count(*) from public.riders where on_market")" "0"
eq "no market row is linked to a rider yet" "$(q "select count(*) from public.market_riders where acquired_rider_id is not null")" "0"
eq "limits table has 5 leagues, ALL limits NULL (no numbers invented)" "$(q "select count(*)||':'||count(acquire_max_ovr)||':'||count(keep_max_ovr) from public.league_rider_limits")" "5:0:0"

A=$(mkp); B=$(mkp); C=$(mkp); D=$(mkp); E=$(mkp); G=$(mkp); H=$(mkp); X=$(mkp)
for p in $A $B $C $D $E $G $H $X; do league_up $p; done
RA=$(mkr $A Alpha); RB=$(mkr $B Bravo); RC=$(mkr $C Charlie); RD=$(mkr $D Delta); RE=$(mkr $E Echo); RG=$(mkr $G Golf); RH=$(mkr $H Hotel); RX=$(mkr $X Xray)
q "select id from public.start_rider_contract_internal('$RA','$A','2026-11-09 10:00:00+00')" >/dev/null
MA=$(MK A1); q "update public.market_riders set season_id='season-1' where id='$MA'" >/dev/null; MA_GEN=$(q "select generated_at::text from public.market_riders where id='$MA'"); MC=$(MK C1); ME=$(MK E1); MG=$(MK G1); MH=$(MK H1); MB=$(MK B1); MX=$(MK X1)

echo "== 2. disabled: nothing can be bought or swapped"
has "reserve refused while the feature is off" "$(as $A "select public.reserve_market_rider('$MA');")" "swap_disabled"
eq "process does nothing while off" "$(as $A "select public.process_due_rider_swaps();")" "0"
q "update public.rider_swap_settings set enabled = true" >/dev/null

echo "== 3. purchase during a Tour week with a valid contract and a training week (S2 week 2 -> takeover week 3; the real clock is S2 week 4 so week-2 plans are due)"
q "insert into public.tour_registrations (rider_id, tour_id, season_id) values ('$RA','highlands-tour','season-2'), ('$RA','northern-crown-tour','season-2')" >/dev/null
q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) values ('$RA','season-2',2,'performance','sprint','hard'), ('$RA','season-2',3,'technical','descending','light')" >/dev/null
SNAP=$(q "select first_name||'|'||surname||'|'||age||'|'||potential||'|'||trainability||'|'||professionalism||'|'||recovery||'|'||created_at from public.riders where id='$RA'")
SW=$(q "select id from public.reserve_market_rider_internal('$A','$MA','2026-11-04 10:00:00+00')" | head -1)
eq "pending swap: takeover Monday 2026-11-09 00:00 UTC = season-2 week 3" "$(q "select status||' '||to_char(takeover_at at time zone 'utc','YYYY-MM-DD HH24:MI')||' '||takeover_season_id||' w'||takeover_week from public.rider_swaps where id='$SW'")" "pending 2026-11-09 00:00 season-2 w3"
eq "the purchase did NOT swap: A still owns the same rider" "$(q "select player_id::text from public.riders where id='$RA'")" "$A"
eq "the bought rider is reserved (not available any more)" "$(q "select status from public.market_riders where id='$MA'")" "reserved"
has "nobody else can buy the reserved rider" "$(as $B "select public.reserve_market_rider('$MA');")" "not_available"
has "the same manager cannot reserve a second replacement" "$(as $A "select public.reserve_market_rider('$MB');")" "swap_pending"
eq "the other candidate stayed available" "$(q "select status from public.market_riders where id='$MB'")" "available"
eq "my_pending_swap shows the new rider's name + takeover week to the buyer" "$(as $A "select new_first_name||' '||new_surname||' '||takeover_season_id||' w'||takeover_week from public.my_pending_swap();")" "Mk A1 season-2 w3"
eq "another manager does not see it" "$(as $B "select count(*) from public.my_pending_swap();")" "0"
eq "before the closure nothing is due" "$(q "select public.complete_rider_swap_internal('$SW','2026-11-08 23:59:59+00')")" "not_due"
eq "still unchanged before the closure" "$(q "select player_id::text from public.riders where id='$RA'")" "$A"

echo "== 4. closure: races + trainings of the old rider come first"
eq "swap WAITS while the finished Tour (week 2) has no stored result" "$(q "select public.complete_rider_swap_internal('$SW','2026-11-09 00:00:01+00')")" "deferred"
eq "…and A still has the old rider, swap still pending, reason recorded" "$(q "select (select player_id::text from public.riders where id='$RA')||':'||status||':'||blocked_reason from public.rider_swaps where id='$SW'")" "$A:pending:races_not_closed"
eq "the finished training week 2 WAS applied (development closed first)" "$(q "select (applied_at is not null)::text from public.training_plans where rider_id='$RA' and week_number=2")" "true"
eq "the plan of week 3 is untouched until the swap" "$(q "select (applied_at is null)::text from public.training_plans where rider_id='$RA' and week_number=3")" "true"
q "insert into public.race_results (season_id, tour_id, rider_id, position, points) values ('season-2','highlands-tour','$RA',5,10)" >/dev/null
PRE_RIDERS=$(q "select count(*) from public.riders"); PRE_ACQ_RA=$(q "select count(*) from public.rider_acquisitions where rider_id='$RA'"); PRE_HIST_RA=$(q "select count(*) from public.rider_attribute_history where rider_id='$RA'")
ATTR_RA=$(q "select attributes::text from public.riders where id='$RA'")
eq "closure completes once the result exists" "$(q "select public.complete_rider_swap_internal('$SW','2026-11-09 00:00:01+00')")" "completed"
ADM=$(q "insert into auth.users default values returning id" | head -1); q "insert into public.admin_users (user_id) values ('$ADM')" >/dev/null
NA=$(q "select new_rider_id from public.rider_swaps where id='$SW'")

echo "== R1. return to market: what season_id / generated_at / identity really mean"
eq "row MA was created in season-1; after A bought him it is 'acquired', linked to the new rider NA, season_id still season-1" "$(q "select status||':'||season_id||':'||(acquired_rider_id::text='$NA')::text from public.market_riders where id='$MA'")" "acquired:season-1:true"
eq "old rider RA (first return): ONE identity row, available, source released, linked to RA, season_id = season of the return (season-2)" "$(q "select count(*)||':'||min(status)||':'||min(source)||':'||min(season_id) from public.market_riders where acquired_rider_id='$RA'")" "1:available:released:season-2"
RA_ROW=$(q "select id from public.market_riders where acquired_rider_id='$RA'")
# A swaps again: NA goes back to the market, A takes MB (season-2)
SW2=$(q "select id from public.reserve_market_rider_internal('$A','$MB','2026-12-02 10:00:00+00')" | head -1)
eq "second swap of A completes at Monday 00:00 UTC" "$(q "select public.complete_rider_swap_internal('$SW2','2026-12-07 00:00:00+00')")" "completed"
NB=$(q "select new_rider_id from public.rider_swaps where id='$SW2'")
eq "NA went back to the market via the SAME row MA (no second row for him)" "$(q "select count(*) from public.market_riders where acquired_rider_id='$NA'")" "1"
eq "row MA is available again, free of a manager, linked to NA" "$(q "select status||':'||(acquired_by_player_id is null)::text||':'||(acquired_rider_id::text='$NA')::text from public.market_riders where id='$MA'")" "available:true:true"
eq "FINDING: season_id of MA was UPDATED on return (season-1 -> season-2): it is the season of the last placement on the market, NOT the creation season" "$(q "select season_id from public.market_riders where id='$MA'")" "season-2"
eq "generated_at of MA is unchanged (it keeps the original creation time)" "$(q "select (generated_at::text = '$MA_GEN')::text from public.market_riders where id='$MA'")" "true"
eq "the identity of the rider is unchanged: same riders row, same name" "$(q "select first_name||' '||surname from public.riders where id='$NA'")" "Mk A1"

echo "== R2. the admin reset (exact statement of resetAvailableMarketPool) distinguishes the five kinds of rows"
N1=$(MK NeverOwned1); N2=$(MK NeverOwned2)
q "update public.market_riders set season_id='season-1' where id='$N2'" >/dev/null     # never owned, but another season
SW3=$(q "select id from public.reserve_market_rider_internal('$C','$MC','2026-12-03 10:00:00+00')" | head -1)   # reserved (pending), not yet swapped
eq "kinds before the reset: MB owned (acquired), MC reserved, MA + RA-row returned-with-history (available, linked)" "$(q "select (select status from public.market_riders where id='$MB')||','||(select status from public.market_riders where id='$MC')||','||(select status from public.market_riders where id='$MA')||','||(select status from public.market_riders where id='$RA_ROW')")" "acquired,reserved,available,available"
RIDERS_BEFORE=$(q "select count(*) from public.riders"); LINKED_BEFORE=$(q "select count(*) from public.market_riders where acquired_rider_id is not null")
DEL=$(as $ADM "with d as (delete from public.market_riders where season_id = 'season-2' and status = 'available' and acquired_rider_id is null returning id) select coalesce(string_agg(id::text, ','), 'none') from d;")
has "reset deleted the never-owned free row N1 (season-2)" "$DEL" "$N1"
eq "reset did NOT touch the never-owned row of ANOTHER season (N2, season-1)" "$(q "select count(*) from public.market_riders where id='$N2'")" "1"
eq "reset did NOT delete the returned rider with history: row MA (season-2 now, available, linked)" "$(q "select count(*) from public.market_riders where id='$MA'")" "1"
eq "reset did NOT delete the returned rider RA (identity row)" "$(q "select count(*) from public.market_riders where id='$RA_ROW'")" "1"
eq "reset did NOT delete the reserved row MC" "$(q "select status from public.market_riders where id='$MC'")" "reserved"
eq "reset did NOT delete the currently owned row MB" "$(q "select status from public.market_riders where id='$MB'")" "acquired"
eq "none of the protected ids was in the deleted list" "$(echo "$DEL" | grep -c -e "$MA" -e "$RA_ROW" -e "$MB" -e "$MC")" "0"
eq "every row linked to a rider survived (count unchanged)" "$(q "select count(*) from public.market_riders where acquired_rider_id is not null")" "$LINKED_BEFORE"
eq "riders table untouched (no rider and no history deleted)" "$(q "select count(*) from public.riders")" "$RIDERS_BEFORE"
eq "no never-owned available season-2 row is left (the reset did its job)" "$(q "select count(*) from public.market_riders where season_id='season-2' and status='available' and acquired_rider_id is null")" "0"

echo "== R3. even a direct delete cannot remove a row of a living rider (database backstop)"
for id in $MA $RA_ROW $MB; do
  has "direct admin delete of a linked row is refused ($id)" "$(as $ADM "delete from public.market_riders where id='$id';")" "cannot be deleted"
done
has "reserved row cannot be deleted either (swap FK restrict)" "$(as $ADM "delete from public.market_riders where id='$MC';")" "violates foreign key"
eq "after all attempts the five important rows still exist" "$(q "select count(*) from public.market_riders where id in ('$MA','$RA_ROW','$MB','$MC','$N2')")" "5"
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
