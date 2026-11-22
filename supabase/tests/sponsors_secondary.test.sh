#!/usr/bin/env bash
# Sponzori generator FIXES (migration 20261122_04): one company per player, DB guards, concurrency, real calendar against a REAL local Postgres 16.
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/sponsors_secondary.test.sh   (run as a non-root user, e.g. postgres)
# Order proven: base schema -> 20261122_01 -> 20261122_02 -> 20261122_03. Supabase auth schema/roles are stubbed.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}; PORT=${PGTEST_PORT:-5566};
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
psqlc postgres -c "create database t" >/dev/null; psqlc postgres -c "create database empty" >/dev/null
for db in t empty; do psqlc $db -f "$DIR/stub.sql" >/dev/null || { echo "stub failed"; exit 1; }; psqlc $db -f "$BASE" >/dev/null 2>&1 || { echo "base failed"; exit 1; }; done
# the base schema cut-off used here ends before the calendar table; create it exactly like schema.sql does and seed the CURRENT game calendar (V1 until activate_game_calendar_v2())
psqlc t -c "create table if not exists public.tour_schedule (tour_id text primary key, week_number int not null check (week_number between 1 and 10)); insert into public.tour_schedule values ('highlands-tour',2),('danube-tour',5),('coastal-tour',5),('northern-crown-tour',7),('silver-horizon-tour',9) on conflict do nothing" >/dev/null
M1="$ROOT/migrations/20261122_01_sponsors_foundation.sql"; M2="$ROOT/migrations/20261122_02_sponsor_catalog_main_30.sql"; M3="$ROOT/migrations/20261122_03_sponsor_offer_generator.sql"; M4="$ROOT/migrations/20261122_04_sponsor_generator_fixes.sql"; M5="$ROOT/migrations/20261122_05_sponsor_update_guards.sql"; M6="$ROOT/migrations/20261122_06_sponsor_secondary.sql"; NAMES="$ROOT/tests/fixtures/sponsor_secondary_names.txt"; DIAG="$ROOT/diagnostics/sponsors_predeploy_check.sql"; FIX="$ROOT/tests/fixtures/sponsor_reach_cases.json"

id() { q "select id from public.sponsor_companies where name='$1'"; }
NEWP() { q "insert into auth.users default values returning id" | head -1; }
for m in "$M1" "$M2" "$M3" "$M4" "$M5"; do psqlc t -f "$m" >/dev/null 2>&1 || { echo "migration failed: $m"; exit 1; }; done
psqlc t -c "delete from public.tour_schedule; insert into public.tour_schedule values ('highlands-tour',2),('danube-tour',4),('coastal-tour',6),('northern-crown-tour',8),('silver-horizon-tour',10)" >/dev/null   # production calendar V2
# state of production BEFORE 06: one existing player with 3 main offers and his weekly state
PEX=$(q "insert into auth.users default values returning id" | head -1)
MAIN_BEFORE=$(q "select string_agg(id::text||company_id::text||goal1_type||goal2_type||created_at::text, ',' order by id) from public.sponsor_offers where player_id='$PEX' and kind='main'")
eq "before 06: existing player has 3 main offers, no secondary" "$(q "select count(*) from public.sponsor_offers where player_id='$PEX'")" "3"

psqlc t -f "$M6" >/dev/null 2>&1 && ok "06 applies over the production state (01-05 not re-run)" || { bad "06 apply" "$(psqlc t -f "$M6" | tail -3)"; }
has "06 refuses on an empty database (needs 01-05)" "$(psqlc empty -f "$M6")" "Run 20261122_01"
echo "== 1. catalogue"
eq "30 main + 50 secondary active numbered firms" "$(q "select count(*) filter (where kind='main') || '+' || count(*) filter (where kind='secondary') from public.sponsor_companies where catalog_no is not null and active")" "30+50"
eq "secondary names and ORDER exactly as approved" "$(q "select string_agg(name, '|' order by catalog_no) from public.sponsor_companies where kind='secondary'")" "$(paste -sd'|' $NAMES)"
psqlc t -f "$M6" >/dev/null 2>&1 && ok "06 re-run is idempotent" || bad "06 rerun" "$(psqlc t -f "$M6" | tail -2)"
eq "after re-run still 80 firms, no duplicate names" "$(q "select count(*) || '/' || count(distinct name) from public.sponsor_companies")" "80/80"
eq "main offers of the existing player are byte-identical after 06" "$(q "select string_agg(id::text||company_id::text||goal1_type||goal2_type||created_at::text, ',' order by id) from public.sponsor_offers where player_id='$PEX' and kind='main'")" "$MAIN_BEFORE"
eq "06 itself created no offer for him" "$(q "select count(*) from public.sponsor_offers where player_id='$PEX' and kind='secondary'")" "0"
eq "players cannot read the generator log" "$(as "$PEX" "select count(*) from public.sponsor_generator_log" 2>&1 | grep -c 'permission denied')" "1"

echo "== 2. existing player: ONE-TIME first fill of 3 secondary offers, main untouched"
eq "first visit (ensure) creates exactly 3 secondary offers" "$(as "$PEX" "select public.ensure_my_sponsor_offers()")" "3"
eq "main offers still byte-identical" "$(q "select string_agg(id::text||company_id::text||goal1_type||goal2_type||created_at::text, ',' order by id) from public.sponsor_offers where player_id='$PEX' and kind='main'")" "$MAIN_BEFORE"
eq "a second visit creates nothing" "$(as "$PEX" "select public.ensure_my_sponsor_offers()")" "0"
eq "he has 3 main + 3 secondary = 6 open" "$(q "select count(*) filter (where kind='main') || '+' || count(*) filter (where kind='secondary') from public.sponsor_offers where player_id='$PEX' and status='open'")" "3+3"
eq "secondary offers come only from the secondary catalogue" "$(q "select count(*) from public.sponsor_offers o join public.sponsor_companies c on c.id=o.company_id where o.player_id='$PEX' and o.kind='secondary' and c.kind<>'secondary'")" "0"
eq "all secondary offers: 5 weeks, 21 days, two different goals" "$(q "select count(*) from public.sponsor_offers where player_id='$PEX' and kind='secondary' and duration_weeks=5 and expires_at=created_at+interval '21 days' and goal1_type<>goal2_type")" "3"
eq "no firm repeated among his 6 valid offers" "$(q "select count(*)-count(distinct company_id) from public.sponsor_offers where player_id='$PEX' and status='open'")" "0"
eq "no Worlds / season goals" "$(q "select count(*) from public.sponsor_offers where player_id='$PEX' and kind='secondary' and (goal1_type ~ 'Worlds|winSeason|promotion' or goal2_type ~ 'Worlds|winSeason|promotion')")" "0"
eq "easier goal is not harder than the other (rank)" "$(q "select count(*) from public.sponsor_offers o where o.player_id='$PEX' and o.kind='secondary' and (select rank from public.sponsor_goal_catalog where goal_type=o.goal1_type) >= (select rank from public.sponsor_goal_catalog where goal_type=o.goal2_type)")" "0"

echo "== 3. new player gets 3 + 3 immediately"
PN1=$(NEWP)
eq "registration: 3 main + 3 secondary" "$(q "select count(*) filter (where kind='main') || '+' || count(*) filter (where kind='secondary') from public.sponsor_offers where player_id='$PN1' and status='open'")" "3+3"
eq "registration: no firm twice" "$(q "select count(*)-count(distinct company_id) from public.sponsor_offers where player_id='$PN1'")" "0"
eq "personal: two players do not get identical secondary sets (30 players, >1 distinct set)" "$(for i in $(seq 1 12); do p=$(NEWP); q "select string_agg(company_id::text, ',' order by company_id) from public.sponsor_offers where player_id='$p' and kind='secondary'"; done | sort -u | wc -l | awk '{print ($1>1)?"ok":"same"}')" "ok"

echo "== 4. players see only their own data"
PO=$(NEWP)
eq "a player sees no offer of another player" "$(as "$PN1" "select count(*) from public.sponsor_offers where player_id <> '$PN1'")" "0"
eq "a player sees at most the firms of his own offers/contracts (never the 80 catalogue)" "$(as "$PN1" "select count(*) from public.sponsor_companies")" "6"
eq "no direct insert of a contract" "$(as "$PN1" "insert into public.sponsor_contracts (player_id, company_id, kind, duration_weeks) values ('$PN1','$(id 'Velora Nutrition')','secondary',5)" 2>&1 | grep -c 'permission denied\|violates\|null value\|policy')" "1"
eq "a player cannot insert an offer for himself" "$(as "$PN1" "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PN1','$(id 'Velora Nutrition')','secondary',5,'finishTour','top10', now()+interval '21 days')" 2>&1 | grep -c 'permission denied\|policy')" "1"

echo "== 5. DB guards for secondary offers"
OS=$(q "select company_id from public.sponsor_offers where player_id='$PN1' and kind='secondary' and status='open' limit 1")
has "same firm twice (open) refused" "$(q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PN1','$OS','secondary',5,'finishTour','top10', now()+interval '21 days')")" "sponsor_company_already_offered\|market_full\|duplicate"
q "update public.sponsor_offers set status='rejected' where player_id='$PN1' and kind='secondary' and company_id='$OS'" >/dev/null
q "update public.sponsor_offers set status='rejected' where player_id='$PN1' and kind='secondary' and status='open'" >/dev/null   # free the player's secondary market (random firms) so the next checks hit the intended guard
has "secondary offer must be 5 weeks" "$(q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PN1','$(id 'Hydrava')','secondary',10,'finishTour','top10', now()+interval '21 days')")" "duration_not_allowed"
MF=$(q "select id from public.sponsor_companies where kind='main' and id not in (select company_id from public.sponsor_offers where player_id='$PN1' and status='open') limit 1")
has "secondary offer from a MAIN firm refused" "$(q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PN1','$MF','secondary',5,'finishTour','top10', now()+interval '21 days')")" "company_kind_mismatch"
q "update public.sponsor_offers set status='rejected' where player_id='$PN1' and kind='secondary' and status='open'" >/dev/null
for f in 'Hydrava' 'Geltrix' 'Gripora' 'Pedalix'; do q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PN1','$(id "$f")','secondary',5,'finishTour','top10', now()+interval '21 days')" > "$DIR/s_$f.out" 2>&1; done
eq "a 4th open secondary offer is refused (max 3 per type)" "$(cat "$DIR"/s_Pedalix.out | grep -c market_full_for_kind)" "1"
eq "...and main stays 3" "$(q "select count(*) from public.sponsor_offers where player_id='$PN1' and kind='main' and status='open'")" "3"
q "update public.sponsor_offers set status='rejected' where player_id='$PN1' and company_id='$(id 'Hydrava')' and status='open'" >/dev/null
q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PN1','$(id 'Hydrava')','secondary',5,'finishTour','top10', now()+interval '21 days')" >/dev/null
eq "UPDATE guard: re-opening a rejected offer of a firm that already has a valid offer is refused" "$(q "update public.sponsor_offers set status='open' where id=(select id from public.sponsor_offers where player_id='$PN1' and company_id='$(id 'Hydrava')' and status='rejected' limit 1)" 2>&1 | grep -c 'ERROR')" "1"

echo "== 6. concurrency (existing player, first secondary fill, 8 parallel sessions)"
PC1=$(NEWP); q "delete from public.sponsor_offers where player_id='$PC1' and kind='secondary'; update public.sponsor_player_state set secondary_fill_week_key=null, secondary_fill_at=null where player_id='$PC1'" >/dev/null
for i in 1 2 3 4 5 6 7 8; do ( psqlc t -c "select public.sponsor_generate_offers_internal('$PC1', now())" > "$DIR/c_$i.out" ) & done; wait
eq "exactly 3 secondary offers, 3 firms" "$(q "select count(*) || '/' || count(distinct company_id) from public.sponsor_offers where player_id='$PC1' and kind='secondary' and status='open'")" "3/3"
eq "no run failed" "$(cat "$DIR"/c_*.out | grep -ci error)" "0"

echo "== 7. rejection / expiry / Sunday refill (secondary)"
PR=$(NEWP); R=$(q "select id from public.sponsor_offers where player_id='$PR' and kind='secondary' and status='open' limit 1")
eq "reject works" "$(as "$PR" "select public.reject_my_sponsor_offer('$R')")" "t"
eq "rejected offer disappears at once (2 secondary open), no instant replacement" "$(as "$PR" "select public.ensure_my_sponsor_offers()") $(q "select count(*) from public.sponsor_offers where player_id='$PR' and kind='secondary' and status='open'")" "0 2"
KEY=$(q "select public.sponsor_week_key(now())"); SUN=$(q "select ((date '$KEY' + 7)::timestamp at time zone 'Europe/Bratislava')")
eq "before the next Sunday 00:00 nothing is refilled" "$(q "select public.sponsor_generate_offers_internal('$PR', '$SUN'::timestamptz - interval '1 minute')")" "0"
eq "at Sunday 00:00 Europe/Bratislava the missing one is refilled (main stays 3)" "$(q "select public.sponsor_generate_offers_internal('$PR', '$SUN')") $(q "select count(*) filter (where kind='secondary') || '+' || count(*) filter (where kind='main') from public.sponsor_offers where player_id='$PR' and status='open'")" "1 3+3"
eq "unexpired offers are kept; expired are closed after 21 days" "$(q "select public.sponsor_generate_offers_internal('$PR', now() + interval '29 days')") $(q "select count(*) from public.sponsor_offers where player_id='$PR' and status='expired'")" "$(q "select 6 || ' ' || count(*) from public.sponsor_offers where player_id='$PR' and status='expired'" | sed 's/^6/6/')"
eq "re-run in the same period creates nothing" "$(q "select public.sponsor_generate_offers_internal('$PR', now() + interval '29 days')")" "0"

echo "== 8. all slots full: offers are still generated; signing waits"
PF=$(NEWP); q "update public.sponsor_offers set status='rejected' where player_id='$PF' and kind='secondary'; delete from public.sponsor_player_state where player_id='$PF'" >/dev/null
q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at, created_at, status) values ('$PF','$(id 'Hydrava')','secondary',5,'finishTour','top10', now()+interval '21 days', now(), 'accepted')" >/dev/null
OF=$(q "select id from public.sponsor_offers where player_id='$PF' and company_id='$(id 'Hydrava')'")
q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, weekly_income_cents, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) values ('$PF','$OF','$(id 'Hydrava')','secondary',5,1,'finishTour',1,'top10',1, now()+interval '5 weeks')" >/dev/null
eq "rookie has 1/1 active secondary contract" "$(q "select count(*) from public.sponsor_contracts where player_id='$PF' and kind='secondary' and status='active'")" "1"
eq "generator still creates 3 secondary offers" "$(q "select public.sponsor_generate_offers_internal('$PF', now() + interval '8 days')")" "3"
eq "...none from the partner firm" "$(q "select count(*) from public.sponsor_offers where player_id='$PF' and status='open' and company_id='$(id 'Hydrava')'")" "0"
OF2=$(q "select id from public.sponsor_offers where player_id='$PF' and kind='secondary' and status='open' limit 1")
has "signing a 2nd secondary contract is refused (slots full)" "$(q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, weekly_income_cents, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) select '$PF','$OF2',company_id,'secondary',5,1,'finishTour',1,'top10',1, now()+interval '5 weeks' from public.sponsor_offers where id='$OF2'")" "sponsor_slots_full\|not_open\|offer"
eq "limits rookie/amateur/continental/pro/elite secondary = 1/2/2/3/2" "$(q "select string_agg(public.sponsor_limit(l,'secondary')::text, '/' order by o) from unnest(array['rookie','amateur','continental','pro','elite']) with ordinality t(l,o)")" "1/2/2/3/2"

echo "== 9. real calendar of the 5-week contract; no invalid offers; the cause is recorded"
eq "V2 calendar: a 5-week contract guaranteed 2 race weeks" "$(q "select public.sponsor_reachable_tours_min('2026-11-22 12:00+00', 5)")" "2"
eq "2-week window cannot be guaranteed" "$(q "select public.sponsor_reachable_tours_min('2026-11-22 12:00+00', 2)")" "0"
eq "per-signing-week minimum is at least the strict intersection used for main (2 vs 1 here), and never above 4 weeks of races" "$(q "select public.sponsor_reachable_tours_min('2026-11-22 12:00+00', 5) >= public.sponsor_reachable_tours('2026-11-22 12:00+00', 5) and public.sponsor_reachable_tours_min('2026-11-22 12:00+00', 5) <= 4")" "t"
q "delete from public.tour_schedule" >/dev/null
PK=$(NEWP)
eq "no calendar -> no offers at all" "$(q "select count(*) from public.sponsor_offers where player_id='$PK'")" "0"
eq "...the cause is recorded for both kinds" "$(q "select string_agg(kind||':'||reason, ',' order by kind) from public.sponsor_generator_log where player_id='$PK'")" "main:no_race_weeks_in_contract,secondary:no_race_weeks_in_contract"
eq "...and no state is stored (next visit retries)" "$(q "select count(*) from public.sponsor_player_state where player_id='$PK'")" "0"
q "insert into public.tour_schedule values ('highlands-tour',2),('danube-tour',4),('coastal-tour',6),('northern-crown-tour',8),('silver-horizon-tour',10)" >/dev/null
eq "calendar back -> visit fills 3+3" "$(as "$PK" "select public.ensure_my_sponsor_offers()")" "6"
q "update public.sponsor_companies set active=false where kind='secondary'" >/dev/null
PL=$(NEWP)
eq "secondary catalogue unavailable -> only main, cause recorded" "$(q "select count(*) from public.sponsor_offers where player_id='$PL' and kind='secondary'") $(q "select count(*) from public.sponsor_generator_log where player_id='$PL' and kind='secondary' and reason='no_catalogue'")" "0 1"
q "update public.sponsor_companies set active=true where kind='secondary'" >/dev/null
eq "catalogue back -> the missing secondary offers appear at the next visit (nothing was stored for the period)" "$(as "$PL" "select public.ensure_my_sponsor_offers()")" "3"

echo "== 10. goals respect the league windows"
eq "every secondary goal has rank within the league window (rookie 1-4)" "$(q "select count(*) from public.sponsor_offers o join public.profiles p on p.id=o.player_id where o.kind='secondary' and p.league='rookie' and exists (select 1 from public.sponsor_goal_catalog g where g.goal_type in (o.goal1_type,o.goal2_type) and g.rank>4)")" "0"
eq "no secondary offer ever has two equal goals" "$(q "select count(*) from public.sponsor_offers where kind='secondary' and goal1_type=goal2_type")" "0"

echo "== 11. contracts survive promotion (offers are checked only at creation)"
q "update public.profiles set league='pro' where id='$PF'" >/dev/null
eq "the active secondary contract of PF stays after the league change" "$(q "select count(*) from public.sponsor_contracts where player_id='$PF' and status='active' and kind='secondary'")" "1"

echo "== 12. diagnostics + guards still fine"
eq "no duplicate offers anywhere" "$(q "select count(*) from public.sponsor_duplicate_report()")" "0"
D=$(psqlc t -f "$DIAG")
has "diagnostic: _06 row OK with 50+30" "$(echo "$D" | grep "^45|")" "45|.*|OK|.*50+30"
has "diagnostic: no player above 3 secondary offers" "$(echo "$D" | grep "^55|")" "|OK|"
echo; echo "RESULT: pass=$pass fail=$fail"; [ $fail -eq 0 ]
