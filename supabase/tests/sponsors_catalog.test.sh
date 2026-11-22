#!/usr/bin/env bash
# Sponzori catalogue of 30 main sponsors (migration 20261122_02) against a REAL local Postgres 16.
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/sponsors_catalog.test.sh   (run as a non-root user, e.g. postgres)
# Order proven here: base schema -> 20261122_01 -> (data may already exist) -> 20261122_02, plus "02 without 01 refuses".
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}; PORT=${PGTEST_PORT:-5563}
BASE="$DIR/base_schema.sql"; sed '/^-- >>>>>>>> /,$d' "$ROOT/schema.sql" > "$BASE"
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
for db in t empty; do psqlc postgres -c "create database $db" >/dev/null; psqlc $db -f "$DIR/stub.sql" >/dev/null || { echo "stub failed"; exit 1; }; psqlc $db -f "$BASE" >/dev/null 2>&1 || { echo "base failed"; exit 1; }; done
M1="$ROOT/migrations/20261122_01_sponsors_foundation.sql"; M2="$ROOT/migrations/20261122_02_sponsor_catalog_main_30.sql"
NAMES="Veltaro Cycling|Kadrin Wheels|Aerovex|Torvello Bikes|Rydexa|Solvanta Energy|Noryx Power|Voltaris Group|Eltrava Energy|Energonix|Veltrion Motors|Arvexa Automotive|Nordaris Mobility|Motravia|Axeron Motors|Datrix Systems|Quantelis|Nexoria Tech|Syntrava|Corevanta|Monvera Capital|Asteriq Finance|Valtrix Bank|Norvella Insurance|Fintravo|Altivex Logistics|Montaris Group|Avendra Global|Trinex Industries|Orvanta Holdings"

echo "== 0. the wrong order is refused, harmlessly"
has "02 without 01 stops with a clear message" "$(psqlc empty -f "$M2")" "Run 20261122_01"
eq "nothing was created by the refused run" "$(psqlc empty -c "select to_regclass('public.sponsor_companies') is null")" "t"

echo "== 1. pre-existing sponsor data (a test company, an open offer) must survive"
psqlc t -f "$M1" >/dev/null 2>&1 || { echo "01 failed"; exit 1; }
mk() { local id; id=$(q "insert into auth.users default values returning id" | head -1); q "insert into public.profiles (id, league) values ('$id', '$1') on conflict (id) do update set league='$1'" >/dev/null; echo "$id"; }
P1=$(mk rookie); P2=$(mk rookie)
q "insert into public.sponsor_companies (name) values ('Aerovex'), ('Pre-existing Co')" >/dev/null      # one catalogue name already present, one foreign
PRE=$(q "select id from public.sponsor_companies where name='Pre-existing Co'"); AERO=$(q "select id from public.sponsor_companies where name='Aerovex'")
q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$P1','$PRE','main',10,'finishTour','winStage', now() + interval '21 days')" >/dev/null
BEFORE_OFFERS=$(q "select count(*) from public.sponsor_offers"); BEFORE_PROFILES=$(q "select count(*) from public.profiles")
psqlc t -f "$M2" >/dev/null 2>&1 && ok "02 applies on top of 01 with existing data" || { bad "02 applies" "$(psqlc t -f "$M2" | tail -3)"; exit 1; }

echo "== 2. exactly the 30 approved main sponsors"
eq "30 main sponsors with catalogue number 1..30" "$(q "select count(*) from public.sponsor_companies where kind='main' and catalog_no between 1 and 30")" "30"
eq "names + order == the approved list" "$(q "select string_agg(name, '|' order by catalog_no) from public.sponsor_companies where catalog_no is not null")" "$NAMES"
eq "all active" "$(q "select count(*) from public.sponsor_companies where catalog_no is not null and active")" "30"
eq "the already-existing 'Aerovex' was NOT duplicated and got its number" "$(q "select count(*)||':'||max(catalog_no)||':'||bool_and(id='$AERO') from public.sponsor_companies where name='Aerovex'")" "1:3:true"
eq "the foreign company is untouched (no catalogue number)" "$(q "select catalog_no is null and kind='main' from public.sponsor_companies where id='$PRE'")" "t"
eq "existing offers and profiles untouched" "$(q "select count(*) from public.sponsor_offers")|$(q "select count(*) from public.profiles")" "$BEFORE_OFFERS|$BEFORE_PROFILES"
eq "no money, contract or payout was created" "$(q "select (select count(*) from public.sponsor_contracts)+(select count(*) from public.sponsor_payouts)+(select count(*) from public.sponsor_offers where weekly_income_cents is not null)")" "0"
eq "economy switch still OFF" "$(q "select economy_enabled from public.sponsor_settings")" "f"

echo "== 3. re-running is harmless"
psqlc t -f "$M2" >/dev/null 2>&1 && ok "second run succeeds" || bad "second run" "$(psqlc t -f "$M2" | tail -3)"
psqlc t -f "$M2" >/dev/null 2>&1 && ok "third run succeeds" || bad "third run" "$(psqlc t -f "$M2" | tail -3)"
eq "still exactly 30 catalogue rows (+1 foreign)" "$(q "select count(*) from public.sponsor_companies")" "31"
eq "no duplicate names" "$(q "select count(*) from (select lower(name) from public.sponsor_companies group by 1 having count(*)>1) x")" "0"
eq "01 can be re-run after 02 too" "$(psqlc t -f "$M1" >/dev/null 2>&1 && echo ok)" "ok"
eq "and 02 again after that" "$(psqlc t -f "$M2" >/dev/null 2>&1 && q "select count(*) from public.sponsor_companies where catalog_no is not null")" "30"

echo "== 4. rules that must not change"
C=($(q "select id from public.sponsor_companies where catalog_no is not null order by catalog_no"))
offer() { q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$1','${C[$2]}','main',${3:-10},'finishTour','winStage', now() + interval '21 days') returning id"; }
offer "$P2" 0 >/dev/null; offer "$P2" 1 >/dev/null; offer "$P2" 2 >/dev/null
has "4th open MAIN offer refused (max 3)" "$(offer "$P2" 3)" "market_full_for_kind"
eq "the same companies can sponsor ANOTHER player (no global exclusivity)" "$(offer "$P1" 0 >/dev/null; offer "$P1" 1 >/dev/null; q "select count(distinct player_id) from public.sponsor_offers where company_id in ('${C[0]}','${C[1]}')")" "2"
eq "one company, many different players" "$(for i in 1 2 3 4 5; do p=$(mk rookie); offer "$p" 5 >/dev/null; done; q "select count(distinct player_id) from public.sponsor_offers where company_id='${C[5]}'")" "5"
has "offer must live EXACTLY 21 days (20 refused)" "$(q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$(mk rookie)','${C[7]}','main',10,'finishTour','winStage', now() + interval '20 days')")" "sponsor_offers_valid_21_days"
has "offer must live EXACTLY 21 days (22 refused)" "$(q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$(mk rookie)','${C[7]}','main',10,'finishTour','winStage', now() + interval '22 days')")" "sponsor_offers_valid_21_days"
has "a MAIN offer cannot come from a company of another kind" "$(q "insert into public.sponsor_companies (name, kind) values ('Future Secondary Co','secondary')" >/dev/null; q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) select '$(mk rookie)', id, 'main', 10, 'finishTour', 'winStage', now() + interval '21 days' from public.sponsor_companies where name='Future Secondary Co'")" "company_kind_mismatch"
eq "a SECONDARY catalogue can be added later (kind secondary accepted)" "$(q "select kind from public.sponsor_companies where name='Future Secondary Co'")" "secondary"
has "catalogue numbers stay unique within a kind" "$(q "insert into public.sponsor_companies (name, kind, catalog_no) values ('Dup Number Co','main',1)")" "duplicate key"
has "unknown kind refused" "$(q "insert into public.sponsor_companies (name, kind) values ('Bad Kind Co','tertiary')")" "violates check"
echo "-- locked things stay locked"
eq "no function to sign / pay / terminate / generate exists" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and (proname like '%accept%sponsor%' or proname like '%sign%sponsor%' or proname like '%terminate%sponsor%' or proname like '%generate%sponsor%' or proname like '%payout%')")" "0"

echo "== 5. a player cannot change the catalogue; can read it"
eq "player reads the catalogue" "$(as "$P1" "select count(*) from public.sponsor_companies where catalog_no is not null")" "30"
has "player cannot insert a company" "$(as "$P1" "insert into public.sponsor_companies (name, kind) values ('Hack Co','main')")" "permission denied"
has "player cannot rename a sponsor" "$(as "$P1" "update public.sponsor_companies set name='Hacked' where catalog_no=1")" "permission denied"
has "player cannot deactivate a sponsor" "$(as "$P1" "update public.sponsor_companies set active=false")" "permission denied"
has "player cannot delete a sponsor" "$(as "$P1" "delete from public.sponsor_companies")" "permission denied"
has "player cannot renumber the catalogue" "$(as "$P1" "update public.sponsor_companies set catalog_no=99")" "permission denied"
eq "catalogue unchanged after the attempts" "$(q "select string_agg(name, '|' order by catalog_no) from public.sponsor_companies where catalog_no is not null")" "$NAMES"
eq "anon cannot read it" "$(printf "set role anon;\nselect count(*) from public.sponsor_companies;\n" | psqlc t 2>&1 | grep -c 'permission denied')" "1"
eq "an inactive company is hidden from players (RLS)" "$(q "update public.sponsor_companies set active=false where catalog_no=30" >/dev/null; as "$P1" "select count(*) from public.sponsor_companies where catalog_no is not null"; q "update public.sponsor_companies set active=true where catalog_no=30" >/dev/null)" "29"

echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
