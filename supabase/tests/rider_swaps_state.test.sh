#!/usr/bin/env bash
# GENERATED REGRESSION VARIANT of rider_swaps.test.sh (Scenario A only): the same 105 swap/market assertions with migrations 20261117_01 + 20261117_03 applied on top
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
MA=$(MK A1); MC=$(MK C1); ME=$(MK E1); MG=$(MK G1); MH=$(MK H1); MB=$(MK B1); MX=$(MK X1)

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

echo "== 5. the swap: old rider keeps everything, new rider is active with a new contract"
NA=$(q "select new_rider_id from public.rider_swaps where id='$SW'")
eq "A's active rider is the new one; exactly one active rider per manager" "$(q "select count(*)||':'||min(id::text) from public.riders where player_id='$A'")" "1:$NA"
eq "the new rider has the market rider's identity (name, age, hidden values)" "$(q "select first_name||'|'||surname||'|'||age||'|'||potential||'|'||trainability||'|'||professionalism||'|'||recovery from public.riders where id='$NA'")" "Mk|A1|18|66|67|68|69"
eq "exactly ONE new riders row was created for the swap" "$(q "select count(*) from public.riders")" "$((PRE_RIDERS + 1))"
eq "old rider: same id, now on the market without a manager" "$(q "select (player_id is null)::text||':'||on_market::text||':'||is_ai::text from public.riders where id='$RA'")" "true:true:false"
eq "old rider keeps identity, age and hidden attributes" "$(q "select first_name||'|'||surname||'|'||age||'|'||potential||'|'||trainability||'|'||professionalism||'|'||recovery||'|'||created_at from public.riders where id='$RA'")" "$SNAP"
eq "old rider keeps his abilities (as of closure)" "$(q "select attributes::text from public.riders where id='$RA'")" "$ATTR_RA"
eq "old rider's market row is available again, linked to him (identity), source released" "$(q "select status||':'||source||':'||(acquired_by_player_id is null)::text||':'||age from public.market_riders where acquired_rider_id='$RA'")" "available:released:true:19"
eq "market copy carries the same abilities/hidden values as the rider" "$(q "select (m.attributes = r.attributes and m.potential=r.potential and m.trainability=r.trainability and m.professionalism=r.professionalism and m.recovery=r.recovery)::text from public.market_riders m join public.riders r on r.id=m.acquired_rider_id where r.id='$RA'")" "true"
eq "old rider's career history is intact (acquisitions + attribute history only grew or stayed)" "$(q "select ((select count(*) from public.rider_acquisitions where rider_id='$RA') = $PRE_ACQ_RA and (select count(*) from public.rider_attribute_history where rider_id='$RA') >= $PRE_HIST_RA)::text")" "true"
eq "old contract ended, and the end is in his history" "$(q "select (select status from public.rider_contracts where rider_id='$RA')||':'||(select count(*) from public.rider_career_events where rider_id='$RA' and event_type='contract_ended')||':'||(select count(*) from public.rider_career_events where rider_id='$RA' and event_type='contract_signed')")" "ended:1:1"
eq "the next-week training plan of the old rider was closed WITHOUT effect (not deleted)" "$(q "select (applied_at is not null)::text||':'||coalesce(primary_gain::text,'null') from public.training_plans where rider_id='$RA' and week_number=3")" "true:null"
eq "past Tour registration + result are kept, the FUTURE registration was removed" "$(q "select (select count(*) from public.tour_registrations where rider_id='$RA' and tour_id='highlands-tour')||':'||(select count(*) from public.tour_registrations where rider_id='$RA' and tour_id='northern-crown-tour')||':'||(select count(*) from public.race_results where rider_id='$RA')")" "1:0:1"
eq "new rider: first takeover => career_start (league frozen) + contract_signed" "$(q "select string_agg(event_type||':'||coalesce(league||' 1.'||division_number,'-'), ',' order by event_type) from public.rider_career_events where rider_id='$NA'")" "career_start:rookie 1.1,contract_signed:rookie 1.1"
eq "new rider's acquisition snapshot stores the manager's league" "$(q "select kind||':'||league||' 1.'||division_number from public.rider_acquisitions where rider_id='$NA'")" "acquired:rookie 1.1"
eq "market row of the new rider: acquired by A, linked to his riders row" "$(q "select status||':'||(acquired_by_player_id::text = '$A')::text||':'||(acquired_rider_id::text = '$NA')::text from public.market_riders where id='$MA'")" "acquired:true:true"
eq "swap is completed and points at the new rider + contract" "$(q "select status||':'||(new_rider_id::text='$NA')::text||':'||(new_contract_id is not null)::text from public.rider_swaps where id='$SW'")" "completed:true:true"
eq "new contract (reserved S2 W2, takeover S2 W3) runs S2 W3 -> S3 W2" "$(q "select start_season_id||' w'||start_week||' -> '||end_season_id||' w'||end_week||' | '||duration_weeks||' | '||to_char(expires_at at time zone 'utc','YYYY-MM-DD') from public.rider_contracts where rider_id='$NA'")" "season-2 w3 -> season-3 w2 | 10 | 2027-01-18"
eq "no training plan or registration was inherited by the new rider" "$(q "select (select count(*) from public.training_plans where rider_id='$NA')||':'||(select count(*) from public.tour_registrations where rider_id='$NA')")" "0:0"

echo "== 6. the approved example: buy in S2 week 4 -> takeover S2 week 5 -> contract to the end of S3 week 4"
SWB=$(q "select id from public.reserve_market_rider_internal('$B','$MB','2026-11-18 08:30:00+00')" | head -1)
eq "reserved in week 4, takeover Monday 2026-11-23 (S2 W5)" "$(q "select to_char(takeover_at at time zone 'utc','YYYY-MM-DD HH24:MI')||' '||takeover_season_id||' w'||takeover_week from public.rider_swaps where id='$SWB'")" "2026-11-23 00:00 season-2 w5"
eq "closure at exactly Monday 00:00:00 UTC completes (legacy starter rider, no contract/plans to close)" "$(q "select public.complete_rider_swap_internal('$SWB','2026-11-23 00:00:00+00')")" "completed"
NB=$(q "select new_rider_id from public.rider_swaps where id='$SWB'")
eq "contract counts from the takeover week, NOT from the reservation: S2 W5 -> S3 W4" "$(q "select start_season_id||' w'||start_week||' -> '||end_season_id||' w'||end_week||' | '||to_char(starts_at at time zone 'utc','YYYY-MM-DD HH24:MI')||' | '||to_char(expires_at at time zone 'utc','YYYY-MM-DD') from public.rider_contracts where rider_id='$NB'")" "season-2 w5 -> season-3 w4 | 2026-11-23 00:00 | 2027-02-01"
eq "a starter rider (never had a market row) now has an identity row on the market" "$(q "select status||':'||source||':'||first_name from public.market_riders where acquired_rider_id='$RB'")" "available:released:Own"
eq "starter returned: no contract existed, so no contract_ended event was invented" "$(q "select count(*) from public.rider_career_events where rider_id='$RB'")" "0"

echo "== 7. lazy catch-up: closure is idempotent and counts from the takeover instant"
SWH=$(q "select id from public.reserve_market_rider_internal('$H','$MH','2026-11-02 10:00:00+00')" | head -1)
eq "first processing (a request after the Monday) completes 1 swap" "$(as $H "select public.process_due_rider_swaps();")" "1"
eq "second processing does nothing" "$(as $H "select public.process_due_rider_swaps();")" "0"
eq "direct re-run of the internal closure is a no-op" "$(q "select public.complete_rider_swap_internal('$SWH','2026-11-20 00:00:00+00')")" "already_completed"
NH=$(q "select new_rider_id from public.rider_swaps where id='$SWH'")
eq "exactly one contract, one acquisition, 2 events for the new rider after repeated runs" "$(q "select (select count(*) from public.rider_contracts where rider_id='$NH')||':'||(select count(*) from public.rider_acquisitions where rider_id='$NH')||':'||(select count(*) from public.rider_career_events where rider_id='$NH')")" "1:1:2"
eq "late processing still starts the contract at the takeover week (S2 W3 -> S3 W2)" "$(q "select start_season_id||' w'||start_week||' -> '||end_season_id||' w'||end_week from public.rider_contracts where rider_id='$NH'")" "season-2 w3 -> season-3 w2"
eq "no second riders row for the old rider (one identity), market rows 1:1" "$(q "select (select count(*) from public.riders where first_name='Own' and surname='Hotel')||':'||(select count(*) from public.market_riders where acquired_rider_id='$RH')")" "1:1"

echo "== 8. concurrent purchase of ONE market rider by two managers"
( printf "begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub','%s',true);\nselect public.reserve_market_rider('%s');\nselect pg_sleep(1.5);\ncommit;\n" "$C" "$MC" | psqlc t > "$DIR/c1.out" 2>&1 ) &
sleep 0.5
( printf "begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub','%s',true);\nselect public.reserve_market_rider('%s');\ncommit;\n" "$D" "$MC" | psqlc t > "$DIR/c2.out" 2>&1 ) &
wait
eq "exactly ONE pending swap exists for that market rider" "$(q "select count(*) from public.rider_swaps where market_rider_id='$MC' and status='pending'")" "1"
eq "the first buyer won, the second was refused (not_available)" "$(q "select (select manager_id::text from public.rider_swaps where market_rider_id='$MC')")" "$C"
has "second buyer's error is not_available" "$(cat "$DIR/c2.out")" "not_available"
eq "the market row is reserved once" "$(q "select status from public.market_riders where id='$MC'")" "reserved"
eq "D has no swap and keeps the rider" "$(q "select (select count(*) from public.rider_swaps where manager_id='$D')||':'||(select player_id::text from public.riders where id='$RD')")" "0:$D"
has "database backstop: a 2nd pending swap for the same market rider is impossible" "$(q "insert into public.rider_swaps (manager_id, old_rider_id, market_rider_id, takeover_at, takeover_season_id, takeover_week) values ('$D','$RD','$MC','2026-12-07',  'season-2', 7)")" "duplicate key"
has "database backstop: a 2nd pending swap for the same manager is impossible" "$(q "insert into public.rider_swaps (manager_id, old_rider_id, market_rider_id, takeover_at, takeover_season_id, takeover_week) values ('$C','$RC','$MB','2026-12-07', 'season-2', 7)")" "duplicate key"

echo "== 9. week 10 purchase cannot dodge the new season's league rules"
q "update public.league_rider_limits set acquire_max_ovr = 129 where league='rookie'" >/dev/null
has "OVR 130 rider is refused when the Rookie acquire limit is 129" "$(as $E "select public.reserve_market_rider('$ME');")" "not_eligible"
q "update public.league_rider_limits set acquire_max_ovr = 130 where league='rookie'" >/dev/null
SWE=$(q "select id from public.reserve_market_rider_internal('$E','$ME','2027-01-03 12:00:00+00')" | head -1)
SWG=$(q "select id from public.reserve_market_rider_internal('$G','$MG','2027-01-03 12:30:00+00')" | head -1)
eq "week 10 purchase: takeover is Monday 2027-01-04 00:00 = season-3 week 1" "$(q "select to_char(takeover_at at time zone 'utc','YYYY-MM-DD HH24:MI')||' '||takeover_season_id||' w'||takeover_week from public.rider_swaps where id='$SWE'")" "2027-01-04 00:00 season-3 w1"
# the season changes: E is promoted to Amateur (no Rookie limit there), the Rookie limit tightens for G who stays in Rookie
q "update public.league_divisions set number = number where false" >/dev/null
q "insert into public.league_divisions (league, number) values ('amateur', 1) on conflict do nothing" >/dev/null
q "update public.league_memberships set division_id=(select id from public.league_divisions where league='amateur' and number=1), league='amateur' where player_id='$E'" >/dev/null 2>&1
q "update public.league_rider_limits set acquire_max_ovr = 120 where league='rookie'" >/dev/null
eq "promoted manager (Amateur) is no longer bound by the Rookie limit => swap completes" "$(q "select public.complete_rider_swap_internal('$SWE','2027-01-04 00:00:00+00')")" "completed"
eq "manager who stays in Rookie is re-checked after the season change => swap cancelled, no contract" "$(q "select public.complete_rider_swap_internal('$SWG','2027-01-04 00:00:00+00')")" "cancelled"
eq "cancelled swap: reservation released, old rider kept, no contract, reason stored" "$(q "select (select status from public.market_riders where id='$MG')||':'||(select player_id::text = '$G' from public.riders where id='$RG')||':'||cancel_reason||':'||(select count(*) from public.rider_contracts where manager_id='$G') from public.rider_swaps where id='$SWG'")" "available:true:not_eligible:0"
eq "after the cancellation G may reserve again (no pending swap left)" "$(q "select count(*) from public.rider_swaps where manager_id='$G' and status='pending'")" "0"
eq "'keep' context uses its own limit (prepared for the season transition)" "$(q "update public.league_rider_limits set keep_max_ovr = 125 where league='rookie'; select public.rider_league_eligible('rookie','$ATTRS'::jsonb,'keep')::text||':'||public.rider_league_eligible('amateur','$ATTRS'::jsonb,'keep')::text" | tail -1)" "false:true"
has "invalid eligibility context is rejected" "$(q "select public.rider_league_eligible('rookie','$ATTRS'::jsonb,'x')")" "invalid_context"
q "update public.league_rider_limits set acquire_max_ovr = null, keep_max_ovr = null" >/dev/null
eq "limits are back to NULL (config only, nothing invented)" "$(q "select count(acquire_max_ovr)+count(keep_max_ovr) from public.league_rider_limits")" "0"
eq "SQL OVR of a flat-130 rider is 130 (same formula as lib/rider/score.ts)" "$(q "select public.rider_overall_rating('$ATTRS'::jsonb)")" "130"

echo "== 10. a returned rider is bought again: same identity, no new rider"
PRE_RIDERS=$(q "select count(*) from public.riders")
SWX=$(q "select id from public.reserve_market_rider_internal('$X', (select id from public.market_riders where acquired_rider_id='$RA'), '2026-12-02 10:00:00+00')" | head -1)
eq "closure for the repeat purchase completes" "$(q "select public.complete_rider_swap_internal('$SWX','2026-12-07 00:00:00+00')")" "completed"
eq "no new riders row for a transfer back (X's old rider returned, nothing created)" "$(q "select count(*) from public.riders")" "$PRE_RIDERS"
eq "the same riders row (same id) now belongs to X" "$(q "select (player_id::text='$X')::text||':'||on_market::text from public.riders where id='$RA'")" "true:false"
eq "X's old rider is the one on the market now (identity row exists once)" "$(q "select count(*)||':'||min(status) from public.market_riders where acquired_rider_id='$RX'")" "1:available"
eq "RA history: 2 acquisitions (A, X), career_start is not duplicated" "$(q "select (select count(*) from public.rider_acquisitions where rider_id='$RA' and kind='acquired')||':'||(select count(*) from public.rider_career_events where rider_id='$RA' and event_type='career_start')")" "2:1"

eq "RA: contract of A ended, contract of X active" "$(q "select count(*) filter (where status='active')||':'||count(*) filter (where status='ended') from public.rider_contracts where rider_id='$RA'")" "1:1"

echo "== 11. clients cannot write ownership, swaps, reservations, settings"
MSTAT=$(q "select string_agg(status, ',' order by id) from public.market_riders")
for stmt in "insert into public.rider_swaps (manager_id, old_rider_id, market_rider_id, takeover_at, takeover_season_id, takeover_week) values ('$B','$NB','$MX','2026-12-07','season-2',7)" "update public.rider_swaps set status='completed'" "delete from public.rider_swaps" "update public.riders set player_id='$B' where id='$NA'" "update public.riders set on_market=true" "insert into public.riders (player_id, first_name) values ('$B','x')" "update public.rider_swap_settings set enabled=false" "update public.league_rider_limits set acquire_max_ovr=1" "update public.rider_contracts set status='ended'"; do
  has "client write denied: ${stmt:0:60}" "$(as $B "$stmt;")" "permission denied\|row-level security"
done
as $B "update public.market_riders set status='available'; update public.market_riders set status='reserved';" >/dev/null 2>&1
eq "client cannot change market status (RLS hides rows from UPDATE)" "$(q "select string_agg(status, ',' order by id) from public.market_riders")" "$MSTAT"
has "client cannot call reserve_market_rider_internal" "$(as $B "select public.reserve_market_rider_internal('$B','$MX',now());")" "permission denied"
has "client cannot call complete_rider_swap_internal" "$(as $B "select public.complete_rider_swap_internal('$SWX', now());")" "permission denied"
has "client cannot call start_rider_contract_internal" "$(as $B "select public.start_rider_contract_internal('$NB','$B');")" "permission denied"
has "anon cannot reserve" "$(asanon "select public.reserve_market_rider('$MX');")" "permission denied"
has "anon cannot process swaps" "$(asanon "select public.process_due_rider_swaps();")" "permission denied"
eq "a manager reads only his own swaps" "$(as $A "select count(*) from public.rider_swaps;")" "1"
has "one active rider per manager is a database rule (UNIQUE player_id)" "$(q "update public.riders set player_id='$A' where id='$RC'")" "duplicate key"
has "a rider needs an owner, AI flag or the market state" "$(q "update public.riders set on_market=false where id='$RB'")" "riders_ai_or_player_check"
has "reserving without a rider is refused" "$(as $(mkp) "select public.reserve_market_rider('$MX');")" "no_active_rider"
has "unknown market id is not_found" "$(as $B "select public.reserve_market_rider('00000000-0000-0000-0000-000000000000');")" "not_found"
MPREM=$(q "insert into public.market_riders (season_id, tier, status, first_name, surname, country_name, country_iso2, age, attributes, condition, inferred_archetype, potential, trainability, professionalism, recovery, source) values ('season-2','premium','available','Pr','Em','Slovakia','SK',18,'$ATTRS','$COND','allrounder',70,70,70,70,'admin') returning id" | head -1)
has "a Free manager cannot buy a Premium-tier rider (treated as not found)" "$(as $B "select public.reserve_market_rider('$MPREM');")" "not_found"

echo "== 12. market rows of existing riders are protected; aging does not double-count"
has "linked market row cannot be deleted (admin test reset would orphan a rider)" "$(q "delete from public.market_riders where acquired_rider_id='$RX'")" "cannot be deleted"
eq "an unlinked available market row can still be deleted (old reset behaviour)" "$(q "delete from public.market_riders where id='$MPREM'; select count(*) from public.market_riders where id='$MPREM'" | tail -1)" "0"
q "update public.riders set created_at='2026-09-01' where id='$RX'; update public.market_riders set generated_at='2026-09-01' where id='$MX'" >/dev/null
AGE_BEFORE=$(q "select age from public.riders where id='$RX'"); UNL_BEFORE=$(q "select age from public.market_riders where id='$MX'")
as $P1 "select public.process_season_aging();" >/dev/null
eq "returned rider aged exactly +1 in riders" "$(q "select age from public.riders where id='$RX'")" "$((AGE_BEFORE + 1))"
eq "his market copy equals the riders age (NOT aged twice) and is in the current season" "$(q "select (m.age = r.age)::text||':'||m.season_id from public.market_riders m join public.riders r on r.id=m.acquired_rider_id where r.id='$RX'")" "true:season-2"
eq "an unlinked available market rider still ages +1" "$(q "select age from public.market_riders where id='$MX'")" "$((UNL_BEFORE + 1))"
eq "purge of never-bought 21+ is NOT triggered by aging and spares returned riders" "$(q "select public.purge_unsold_young_market_riders()")" "0"

echo "== 13. deleting a rider (end of career) removes his market row too"
q "delete from public.riders where id='$RX'" >/dev/null
eq "linked market row cascaded away" "$(q "select count(*) from public.market_riders where acquired_rider_id='$RX'")" "0"


echo "== 14. state model ON: the transfer brings the state up to date, then copies it - nothing is reset, coefficients never change"
q "update public.rider_state_settings set enabled = true" >/dev/null
Y=$(mkp); league_up $Y; RYY=$(mkr $Y Yankee)
q "update public.riders set condition='{\"energy\":33,\"fatigue\":61,\"form\":80,\"fitness\":77,\"morale\":66}', condition_previous='{\"energy\":33,\"fatigue\":61,\"form\":80,\"fitness\":77,\"morale\":66}',
  energy_efficiency=0.8, fatigue_resistance=1.25, recovery_coef=1.07, fitness_peak=90, state_at=timestamptz '2026-11-12 08:30:00+00', vitality=64 where id='$RYY'" >/dev/null
MKY=$(MK Y1)
q "update public.market_riders set energy_efficiency=1.1, fatigue_resistance=0.9, recovery_coef=0.93, fitness_peak=80, vitality=77, aptitude_profile='{\"climbing\":0.5}',
  condition='{\"energy\":100,\"fatigue\":0,\"form\":77,\"fitness\":80,\"morale\":62}' where id='$MKY'" >/dev/null
SWY=$(q "select id from public.reserve_market_rider_internal('$Y','$MKY','2026-11-18 08:30:00+00')" | head -1)
eq "closure completes with the state model on" "$(q "select public.complete_rider_swap_internal('$SWY','2026-11-23 00:00:00+00')")" "completed"
eq "the old rider was caught up to the exact takeover instant (state_at = 2026-11-23 00:00:00 UTC), regeneration credited for the elapsed time" "$(q "select to_char(state_at at time zone 'utc','YYYY-MM-DD HH24:MI:SS')||' '||((condition->>'energy')::float8 > 33)::text||' '||((condition->>'fatigue')::float8 < 61)::text from public.riders where id='$RYY'")" "2026-11-23 00:00:00 true true"
eq "his individual coefficients, Vitality and Fitness peak are unchanged by the transfer" "$(q "select energy_efficiency||' '||fatigue_resistance||' '||recovery_coef||' '||fitness_peak||' '||vitality from public.riders where id='$RYY'")" "0.8 1.25 1.07 90 64"
eq "the market row carries his CURRENT state (not a reset) and his hidden individual values" "$(q "select (m.condition = r.condition)::text||' '||m.energy_efficiency||' '||m.fatigue_resistance||' '||m.recovery_coef||' '||m.fitness_peak||' '||m.vitality from public.market_riders m join public.riders r on r.id = m.acquired_rider_id where r.id='$RYY'")" "true 0.8 1.25 1.07 90 64"
NY=$(q "select new_rider_id from public.rider_swaps where id='$SWY'")
eq "the NEW rider received the market rider's state and hidden values exactly (no new random draw, no Form/Fitness/Morale reset)" "$(q "select energy_efficiency||' '||fatigue_resistance||' '||recovery_coef||' '||fitness_peak||' '||vitality||' '||(aptitude_profile ->> 'climbing')||' '||(condition = '{\"energy\":100,\"fatigue\":0,\"form\":77,\"fitness\":80,\"morale\":62}'::jsonb)::text from public.riders where id='$NY'")" "1.1 0.9 0.93 80 77 0.5 true"

echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
