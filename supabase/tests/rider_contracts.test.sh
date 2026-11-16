#!/usr/bin/env bash
# Rider contracts V1 + career history (migration 20261116_01) against a REAL local Postgres 16.
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/rider_contracts.test.sh   (run as a non-root user, e.g. postgres)
# Scenario A: existing production DB (legacy riders + training) -> migrations 01-06 -> 07. Scenario B: fresh schema.sql == A.
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
psqlc t -f "$M" >/dev/null 2>&1 && ok "migration applies on top of legacy data" || { bad "migration applies" "$(psqlc t -f "$M" | tail -3)"; exit 1; }
psqlc t -f "$M" >/dev/null 2>&1 && ok "migration is idempotent (second run)" || bad "second run" "$(psqlc t -f "$M" | tail -3)"


echo "== 1. legacy data untouched, nothing invented"
eq "no acquisition added or removed" "$(q "select count(*) from public.rider_acquisitions")" "$BEFORE_ACQ"
eq "no history row added" "$(q "select count(*) from public.rider_attribute_history")" "$BEFORE_HIST"
eq "legacy acquisitions have NO league (unknown, not invented)" "$(q "select count(*) from public.rider_acquisitions where league is not null or division_number is not null")" "0"
eq "no contract and no career event is created by the migration" "$(q "select (select count(*) from public.rider_contracts)||':'||(select count(*) from public.rider_career_events)")" "0:0"
eq "no rider deleted, attributes untouched" "$(q "select count(*) from public.riders")" "$BEFORE_RIDERS"
eq "R1 attributes unchanged" "$(q "select attributes::text from public.riders where id='$R1'")" "$BEFORE_ATTR"

echo "== 2. calendar helpers"
eq "week index: anchor Monday 00:00 UTC = 0" "$(q "select public.game_week_index('2026-08-17 00:00:00+00')")" "0"
eq "week index: Sunday 23:59:59 UTC is still week 0" "$(q "select public.game_week_index('2026-08-23 23:59:59+00')")" "0"
eq "week index: next Monday 00:00:00 UTC = 1" "$(q "select public.game_week_index('2026-08-24 00:00:00+00')")" "1"
eq "week index is not affected by the session time zone" "$(q "set time zone 'Pacific/Kiritimati'; select public.game_week_index('2026-08-23 23:59:59+00')" | tail -1)" "0"
eq "index <-> season/week round trip (S2 W4 = 13)" "$(q "select public.game_week_index_of('season-2',4)||':'||public.game_season_of_index(13)||':'||public.game_week_of_index(13)")" "13:season-2:4"

echo "== 3. contract rules (purchase week counts as week 1; 10 weeks; season change does not end it)"
mkp() { q "insert into auth.users default values returning id" | head -1; }
mkr() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','Buy','$2','Slovakia','SK',18,'$ATTRS','$COND','$COND','allrounder',80,80,70,70) returning id" | head -1; }
contract_at() { # manager rider timestamp -> "startS startW -> endS endW | expires | dur"
  q "select start_season_id||' w'||start_week||' -> '||end_season_id||' w'||end_week||' | '||to_char(expires_at at time zone 'utc','YYYY-MM-DD HH24:MI:SS')||' | '||duration_weeks from public.start_rider_contract_internal('$2','$1','$3')" | head -1; }
B1=$(mkp); B4=$(mkp); B10=$(mkp); BX=$(mkp); BY=$(mkp)
for p in $B1 $B4 $B10; do as $p "select public.assign_my_league_division();" >/dev/null; done
RB1=$(mkr $B1 W1); RB4=$(mkr $B4 W4); RB10=$(mkr $B10 W10)
eq "season 2 starts 2026-10-26 (S2W1)" "$(q "select public.season_id_at('2026-10-26 00:00:00+00')||' w'||public.season_week_at('2026-10-26 00:00:00+00')")" "season-2 w1"
eq "bought in S2 week 1 -> last week S2 week 10" "$(contract_at $B1 $RB1 '2026-10-28 12:00:00+00')" "season-2 w1 -> season-2 w10 | 2027-01-04 00:00:00 | 10"
eq "bought in S2 week 4 -> last week S3 week 3" "$(contract_at $B4 $RB4 '2026-11-18 08:30:00+00')" "season-2 w4 -> season-3 w3 | 2027-01-25 00:00:00 | 10"
eq "bought in S2 week 10 -> last week S3 week 9" "$(contract_at $B10 $RB10 '2027-01-03 23:00:00+00')" "season-2 w10 -> season-3 w9 | 2027-03-08 00:00:00 | 10"
eq "contract start instant is the purchase instant" "$(q "select (starts_at = '2026-11-18 08:30:00+00')::text from public.rider_contracts where rider_id='$RB4'")" "true"
eq "expiry falls on a Monday 00:00 UTC" "$(q "select string_agg(distinct to_char(expires_at at time zone 'utc','Dy HH24:MI'), ',') from public.rider_contracts")" "Mon 00:00"

echo "== 4. week boundary"
RBX=$(mkr $BX Edge1); RBY=$(mkr $BY Edge2)
eq "Sunday 23:59:59 UTC of S2 week 4 still counts as week 4" "$(contract_at $BX $RBX '2026-11-22 23:59:59+00')" "season-2 w4 -> season-3 w3 | 2027-01-25 00:00:00 | 10"
eq "Monday 00:00:00 UTC is already S2 week 5 (ends S3 week 4)" "$(contract_at $BY $RBY '2026-11-23 00:00:00+00')" "season-2 w5 -> season-3 w4 | 2027-02-01 00:00:00 | 10"

echo "== 5. state comes from the SERVER clock; expiry has no automatic consequence"
PA=$(mkp); PB=$(mkp); RA=$(mkr $PA Now); RE=$(mkr $PB Old)
contract_at $PA $RA "$(q "select clock_timestamp()")" >/dev/null
contract_at $PB $RE '2026-08-17 00:00:00+00' >/dev/null
eq "running contract: state active, remaining = 10 (current week counts)" "$(as $PA "select state||':'||remaining_weeks||':'||duration_weeks from public.my_rider_contract();")" "active:10:10"
eq "expired contract (started S1 W1): state expired, remaining 0" "$(as $PB "select state||':'||remaining_weeks from public.my_rider_contract();")" "expired:0"
eq "expiry changes nothing: row still 'active' in storage, rider still owned and present" "$(q "select (select status from public.rider_contracts where rider_id='$RE')||':'||(select player_id::text = '$PB' from public.riders where id='$RE')")" "active:true"
eq "server_now is the database clock" "$(as $PA "select (abs(extract(epoch from now() - server_now)) < 5)::text from public.my_rider_contract();")" "true"
eq "a manager without contract gets no row (nothing invented)" "$(as $P1 "select count(*) from public.my_rider_contract();")" "0"

echo "== 6. repeated processing: no duplicate contract, no duplicate events"
C1=$(q "select id from public.rider_contracts where rider_id='$RB4'")
C1b=$(q "select id from public.start_rider_contract_internal('$RB4','$B4','2026-12-01 00:00:00+00')" | head -1)
eq "second call returns the same contract (and ignores the new timestamp)" "$C1b" "$C1"
eq "still exactly one contract and two events (career_start + contract_signed) for the rider" "$(q "select (select count(*) from public.rider_contracts where rider_id='$RB4')||':'||(select count(*) from public.rider_career_events where rider_id='$RB4')")" "1:2"
eq "dates were not rewritten by the second call" "$(q "select start_season_id||start_week from public.rider_contracts where rider_id='$RB4'")" "season-24"
has "a manager who does not own the rider is refused" "$(q "select public.start_rider_contract_internal('$RB4','$B1')")" "not_rider_owner"
has "no acquisition -> refused (AI filler / unowned)" "$(q "select public.start_rider_contract_internal('$AI','$P5')")" "not_rider_owner"
eq "unique active contract per rider is enforced by the database" "$(q "insert into public.rider_contracts (rider_id, manager_id, acquisition_id, start_season_id, start_week, end_season_id, end_week, duration_weeks, starts_at, expires_at) select rider_id, manager_id, (select id from public.rider_acquisitions where rider_id='$RB4' limit 1), 'season-2', 4, 'season-3', 3, 10, starts_at, expires_at from public.rider_contracts where rider_id='$RB4'" | grep -ci "duplicate key")" "1"

echo "== 7. clients cannot create or change contracts / events"
for tbl in rider_contracts rider_career_events; do
  has "client insert into $tbl denied" "$(as $B4 "insert into public.$tbl (rider_id, manager_id) values ('$RB4','$B4');")" "permission denied"
  has "client update $tbl denied" "$(as $B4 "update public.$tbl set rider_id = rider_id;")" "permission denied"
  has "client delete from $tbl denied" "$(as $B4 "delete from public.$tbl;")" "permission denied"
  has "anon cannot read $tbl" "$(asanon "select * from public.$tbl;")" "permission denied"
done
has "client cannot call start_rider_contract_internal" "$(as $B4 "select public.start_rider_contract_internal('$RB4','$B4');")" "permission denied"
has "client cannot call purge_unsold_young_market_riders" "$(as $B4 "select public.purge_unsold_young_market_riders(true);")" "permission denied"
has "owner cannot move the contract dates (immutable)" "$(q "update public.rider_contracts set end_week = 9 where rider_id='$RB4'")" "immutable"
has "owner cannot change the contract duration (CHECK)" "$(q "update public.rider_contracts set duration_weeks = 12 where rider_id='$RB4'")" "immutable"
has "owner cannot change the contract owner" "$(q "update public.rider_contracts set manager_id = '$B1' where rider_id='$RB4'")" "immutable"
has "career events are immutable" "$(q "update public.rider_career_events set season_week = 9")" "immutable"
has "a client cannot give himself a rider (riders is read-only for clients)" "$(as $B4 "update public.riders set player_id = '$B4' where id='$RB1';")" "permission denied"

echo "== 8. reads are limited to the owner"
eq "manager sees only his own contract" "$(as $B4 "select count(*) from public.rider_contracts;")" "1"
eq "manager cannot read another manager's contract by id" "$(as $B4 "select count(*) from public.rider_contracts where rider_id='$RB1';")" "0"
eq "manager sees the events of his own rider only" "$(as $B4 "select string_agg(distinct rider_id::text, ',') from public.rider_career_events;")" "$RB4"
eq "manager cannot read another rider's events" "$(as $B4 "select count(*) from public.rider_career_events where rider_id='$RB1';")" "0"

echo "== 9. league + sub-league frozen at purchase; later promotion does not change history"
eq "purchase stored the real league + sub-league (rookie 1.1)" "$(q "select league||' 1.'||division_number from public.rider_acquisitions where rider_id='$RB4' and kind='acquired'")" "rookie 1.1"
eq "career_start event carries it" "$(q "select league||' 1.'||division_number from public.rider_career_events where rider_id='$RB4' and event_type='career_start'")" "rookie 1.1"
q "insert into public.league_divisions (league, number) values ('amateur', 1)" >/dev/null
q "update public.league_memberships set division_id=(select id from public.league_divisions where league='amateur' and number=1), league='amateur' where player_id='$B4'" >/dev/null 2>&1
eq "the manager is now really in amateur 1.1" "$(q "select d.league||' 1.'||d.number from public.league_memberships m join public.league_divisions d on d.id=m.division_id where m.player_id='$B4'")" "amateur 1.1"
eq "history still says rookie 1.1 after the promotion" "$(q "select string_agg(distinct league||' 1.'||division_number, ',') from public.rider_career_events where rider_id='$RB4'")" "rookie 1.1"
eq "acquisition snapshot still says rookie 1.1" "$(q "select league||' 1.'||division_number from public.rider_acquisitions where rider_id='$RB4' and kind='acquired'")" "rookie 1.1"
eq "a rider bought AFTER the promotion would get amateur (snapshot is taken at the moment)" "$(q "select (select d.league||' 1.'||d.number from public.league_memberships m join public.league_divisions d on d.id=m.division_id where m.player_id='$B4')")" "amateur 1.1"
eq "contract_signed event has the duration" "$(q "select duration_weeks from public.rider_career_events where rider_id='$RB4' and event_type='contract_signed'")" "10"

echo "== 10. career_start only for the FIRST purchase of a rider"
q "update public.rider_contracts set status='ended' where rider_id='$RB4'" >/dev/null
PN=$(mkp); as $PN "select public.assign_my_league_division();" >/dev/null
q "update public.riders set player_id='$PN' where id='$RB4'" >/dev/null
has "a rider still under another manager's ACTIVE contract is refused (transfer rules are an open question)" "$(q "update public.rider_contracts set status='active' where rider_id='$RB4'; select public.start_rider_contract_internal('$RB4','$PN','2026-12-01 00:00:00+00')")" "active_contract_exists"
q "update public.rider_contracts set status='ended' where rider_id='$RB4'" >/dev/null
q "select id from public.start_rider_contract_internal('$RB4','$PN','2026-12-01 00:00:00+00')" >/dev/null
eq "second manager: one more contract_signed, NO second career_start" "$(q "select count(*) filter (where event_type='career_start')||':'||count(*) filter (where event_type='contract_signed') from public.rider_career_events where rider_id='$RB4'")" "1:2"

echo "== 11. starter riders and existing riders are not touched"
STARTER=$(python3 -c "
import json
keys='climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding roughSurface wetHandling experience'.split()
print(json.dumps({'first_name':'Star','surname':'Ter','country_name':'Slovakia','country_iso2':'SK','age':19,'attributes':{k:120+i for i,k in enumerate(keys)},'condition':{'energy':100,'fatigue':0,'form':50,'fitness':60,'morale':70},'potential':70,'trainability':70,'professionalism':70,'recovery':70,'generator_version':'starter-v1','inferred_archetype':'allrounder'}))")
SID=$(as $P3 "select public.create_my_starter_rider('$STARTER'::jsonb);")
eq "starter creation makes NO contract and NO career event" "$(q "select (select count(*) from public.rider_contracts where rider_id='$SID')||':'||(select count(*) from public.rider_career_events where rider_id='$SID')")" "0:0"
eq "starter has its single acquisition snapshot (kind acquired)" "$(q "select count(*)||':'||min(kind) from public.rider_acquisitions where rider_id='$SID'")" "1:acquired"
eq "legacy rider R1 still has no contract" "$(as $P1 "select count(*) from public.my_rider_contract();")" "0"

echo "== 12. rider removal takes his history, not the manager's data"
RCASC=$(mkr $(mkp) Casc); PCASC=$(q "select player_id from public.riders where id='$RCASC'")
as $PCASC "select public.assign_my_league_division();" >/dev/null
contract_at $PCASC $RCASC '2026-11-18 08:30:00+00' >/dev/null
eq "before: 1 contract + 2 events + acquisition" "$(q "select (select count(*) from public.rider_contracts where rider_id='$RCASC')||':'||(select count(*) from public.rider_career_events where rider_id='$RCASC')||':'||(select count(*) from public.rider_acquisitions where rider_id='$RCASC')")" "1:2:1"
q "delete from public.riders where id='$RCASC'" >/dev/null
eq "after deleting the rider: contract, events, acquisition, attribute history are gone" "$(q "select (select count(*) from public.rider_contracts where rider_id='$RCASC')||':'||(select count(*) from public.rider_career_events where rider_id='$RCASC')||':'||(select count(*) from public.rider_acquisitions where rider_id='$RCASC')||':'||(select count(*) from public.rider_attribute_history where rider_id='$RCASC')")" "0:0:0:0"
eq "the manager account and his league membership are untouched" "$(q "select (select count(*) from auth.users where id='$PCASC')||':'||(select count(*) from public.league_memberships where player_id='$PCASC')")" "1:1"

echo "== 13. young market riders: removal rule prepared but NOT active"
MK() { q "insert into public.market_riders (season_id, tier, status, first_name, surname, country_name, country_iso2, age, attributes, condition, inferred_archetype, potential, trainability, professionalism, recovery, source) values ('season-2','free','$1','M','$2','Slovakia','SK',$3,'$ATTRS','$COND','allrounder',70,70,70,70,'$4') returning id" | head -1; }
M17=$(MK available a17 17 admin); M20=$(MK available a20 20 week6); M21=$(MK available a21 21 admin); M22=$(MK available a22 22 week6); MACQ=$(MK acquired acq 21 admin)
q "update public.market_riders set acquired_by_player_id='$P1', acquired_at=now() where id='$MACQ'" >/dev/null
eq "dry run (default) counts the 2 never-bought 21+ year-olds" "$(q "select public.purge_unsold_young_market_riders()")" "2"
eq "dry run deletes nothing" "$(q "select count(*) from public.market_riders")" "5"
eq "age 17 and 20 are never candidates; an acquired row is never a candidate" "$(q "select string_agg(a, ',' order by a) from (select surname a from public.market_riders where id in ('$M17','$M20','$MACQ')) x")" "a17,a20,acq"
eq "process_season_aging() does not call the purge (not activated)" "$(q "select (pg_get_functiondef('public.process_season_aging()'::regprocedure) like '%purge_unsold%')::text")" "false"
eq "no trigger/cron-like caller of the purge exists in the schema" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind = 'f' and p.proname <> 'purge_unsold_young_market_riders' and pg_get_functiondef(p.oid) like '%purge_unsold_young_market_riders%'")" "0"
DELETED=$(q "select public.purge_unsold_young_market_riders(true)")
eq "explicit apply deletes exactly those 2 (no archive table)" "$DELETED:$(q "select count(*) from public.market_riders")" "2:3"
eq "the deleted ones are the never-bought 21/22-year-olds" "$(q "select count(*) from public.market_riders where id in ('$M21','$M22')")" "0"
eq "a rider who already had a manager (riders row / acquired market row) is never deleted by it" "$(q "select (select count(*) from public.riders where id='$RB4')||':'||(select count(*) from public.market_riders where id='$MACQ')")" "1:1"

echo "== Scenario B: fresh database from supabase/schema.sql == scenario A"
psqlc fresh -f "$SCHEMA" >/dev/null 2>&1 && ok "full schema.sql applies on a fresh database" || bad "full schema.sql applies" "$(psqlc fresh -f "$SCHEMA" | tail -3)"
cat_of() { psqlc "$1" -c "select string_agg(p.oid::regprocedure::text||':'||p.prosecdef::text||':'||coalesce(p.proacl::text,''), E'\n' order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | md5sum; }
eq "function catalog identical" "$(cat_of t)" "$(cat_of fresh)"
tg() { psqlc "$1" -c "select string_agg(table_name||':'||grantee||':'||privilege_type, ',' order by table_name, grantee, privilege_type) from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated')" | md5sum; }
eq "table grants identical" "$(tg t)" "$(tg fresh)"
pol() { psqlc "$1" -c "select string_agg(tablename||':'||policyname||':'||cmd, ',' order by tablename, policyname) from pg_policies where schemaname='public'" | md5sum; }
eq "RLS policies identical" "$(pol t)" "$(pol fresh)"
trg() { psqlc "$1" -c "select string_agg(tgname, ',' order by tgname) from pg_trigger where not tgisinternal" | md5sum; }
eq "triggers identical" "$(trg t)" "$(trg fresh)"
cols() { psqlc "$1" -c "select string_agg(table_name||'.'||column_name||':'||data_type, ',' order by table_name, column_name) from information_schema.columns where table_schema='public' and table_name in ('rider_acquisitions','rider_contracts','rider_career_events')" | md5sum; }
eq "contract/acquisition columns identical" "$(cols t)" "$(cols fresh)"

echo
echo "  $pass passed, $fail failed"
[ "$fail" = 0 ]
