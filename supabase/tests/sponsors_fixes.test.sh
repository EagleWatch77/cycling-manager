#!/usr/bin/env bash
# Sponzori generator FIXES (migration 20261122_04): one company per player, DB guards, concurrency, real calendar against a REAL local Postgres 16.
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/sponsors_fixes.test.sh   (run as a non-root user, e.g. postgres)
# Order proven: base schema -> 20261122_01 -> 20261122_02 -> 20261122_03. Supabase auth schema/roles are stubbed.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}; PORT=${PGTEST_PORT:-5564}; [ "${WITH_04:-0}" = 1 ] && GEN_VER=g2
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
M1="$ROOT/migrations/20261122_01_sponsors_foundation.sql"; M2="$ROOT/migrations/20261122_02_sponsor_catalog_main_30.sql"; M3="$ROOT/migrations/20261122_03_sponsor_offer_generator.sql"; M4="$ROOT/migrations/20261122_04_sponsor_generator_fixes.sql"; M5="$ROOT/migrations/20261122_05_sponsor_update_guards.sql"; DIAG="$ROOT/diagnostics/sponsors_predeploy_check.sql"; FIX="$ROOT/tests/fixtures/sponsor_reach_cases.json"


for m in "$M1" "$M2" "$M3" "$M4" "$M5"; do psqlc t -f "$m" >/dev/null 2>&1 || { echo "migration failed: $m"; psqlc t -f "$m" | tail -3; exit 1; }; done
ok "01+02+03+04+05 apply in order"
psqlc t -f "$M5" >/dev/null 2>&1 && ok "05 (the newest) is idempotent" || bad "05 rerun" "$(psqlc t -f "$M5" | tail -2)"
for n in 1 2 3 4; do mm=$(ls "$ROOT"/migrations/20261122_0${n}_*.sql); has "re-running 0$n after 05 is refused and changes nothing" "$(psqlc t -f "$mm" 2>&1)" "must not be run again"; done
has "04 refuses without 03" "$(psqlc empty -f "$M1" >/dev/null 2>&1; psqlc empty -f "$M4")" "Run 20261122_01"
mkr() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','T','R','Slovakia','SK',20,'{}','{}','{}','allrounder',80,80,70,70) returning id" | head -1; }
setcat() { q "update public.sponsor_companies set active = (name = any(string_to_array('$1', '|'))) where kind='main'" >/dev/null; }   # restrict the generator to the named firms
id() { q "select id from public.sponsor_companies where name='$1'"; }
contract() { # player company offer_id (prints any error)
  q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, weekly_income_cents, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) values ('$1','$3','$2','main',10,1,'finishTour',1,'winStage',1, now()+interval '10 weeks')"; }
NOW=$(q "select now()")
NEWP() { q "insert into auth.users default values returning id" | head -1; }
clear_p() { q "delete from public.sponsor_player_state where player_id='$1'; update public.sponsor_offers set status='rejected' where player_id='$1' and status='open'" >/dev/null; }
names() { q "select coalesce(string_agg(c.name, ',' order by c.name),'') from public.sponsor_offers o join public.sponsor_companies c on c.id=o.company_id where o.player_id='$1' and o.status='open'"; }

echo "== 1. a firm with a VALID offer cannot create a second offer for the same player"
setcat "Veltaro Cycling|Noryx Power|Aerovex|Rydexa"
P1=$(NEWP); eq "player starts with 3 of the 4 allowed firms" "$(q "select count(*) from public.sponsor_offers where player_id='$P1' and status='open'")" "3"
OPEN1=$(q "select company_id from public.sponsor_offers where player_id='$P1' and status='open' limit 1")
has "DB refuses a 2nd open offer of the same firm (guard)" "$(q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$P1','$OPEN1','main',10,'finishTour','winStage', now()+interval '21 days')")" "sponsor_company_already_offered\|duplicate key"
clear_p "$P1"; q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$P1','$(id 'Veltaro Cycling')','main',10,'finishTour','winStage', now()+interval '21 days')" >/dev/null
eq "generator: with one valid Veltaro offer, the next fill never repeats Veltaro (3 others, only 3 firms left)" "$(q "select public.sponsor_generate_offers_internal('$P1', now() + interval '8 days')")" "2"
eq "...so exactly Veltaro + 2 different others, never 2 Veltaro" "$(q "select count(*) from public.sponsor_offers where player_id='$P1' and status='open' and company_id='$(id 'Veltaro Cycling')'")" "1"

echo "== 2. a firm with an ACTIVE contract cannot make the player an offer"
setcat "Veltaro Cycling|Noryx Power"
P2=$(NEWP); O=$(q "select id from public.sponsor_offers where player_id='$P2' and company_id='$(id 'Veltaro Cycling')'")
eq "setup: P2 got offers from both firms" "$(names "$P2")" "Noryx Power,Veltaro Cycling"
contract "$P2" "$(id 'Veltaro Cycling')" "$O" >/dev/null; q "update public.sponsor_offers set status='accepted' where id='$O'" >/dev/null
q "update public.sponsor_offers set status='rejected' where player_id='$P2' and status='open'" >/dev/null; q "delete from public.sponsor_player_state where player_id='$P2'" >/dev/null
has "DB refuses an offer from the firm of an active contract" "$(q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$P2','$(id 'Veltaro Cycling')','main',10,'finishTour','winStage', now()+interval '21 days')")" "sponsor_company_has_active_contract\|sponsor_same_company_twice"
eq "generator offers only the OTHER firm (Veltaro is the active partner and the last signed)" "$(q "select public.sponsor_generate_offers_internal('$P2', now() + interval '8 days')")" "1"
eq "...and that is Noryx Power" "$(names "$P2")" "Noryx Power"
has "DB refuses a second ACTIVE contract with the same firm" "$(O2=$(q "select id from public.sponsor_offers where player_id='$P2' and status='open' limit 1"); contract "$P2" "$(id 'Veltaro Cycling')" "$O2")" "sponsor_company_has_active_contract\|duplicate key"

echo "== 3. Elite: BOTH active main partners are excluded"
setcat "Veltaro Cycling|Noryx Power|Aerovex|Rydexa|Kadrin Wheels"
PE=$(NEWP); q "update public.profiles set league='elite' where id='$PE'; update public.sponsor_offers set status='rejected' where player_id='$PE'; delete from public.sponsor_player_state where player_id='$PE'" >/dev/null
for n in 'Veltaro Cycling' 'Noryx Power'; do q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at, created_at) values ('$PE','$(id "$n")','main',10,'top10','winStage', now()+interval '21 days', now())" >/dev/null; done
OV=$(q "select id from public.sponsor_offers where player_id='$PE' and company_id='$(id 'Veltaro Cycling')' and status='open'"); ON=$(q "select id from public.sponsor_offers where player_id='$PE' and company_id='$(id 'Noryx Power')' and status='open'")
contract "$PE" "$(id 'Veltaro Cycling')" "$OV" >/dev/null; q "update public.sponsor_offers set status='accepted' where id='$OV'" >/dev/null
sleep 0.05; contract "$PE" "$(id 'Noryx Power')" "$ON" >/dev/null; q "update public.sponsor_offers set status='accepted' where id='$ON'" >/dev/null
eq "Elite has 2 active main contracts" "$(q "select count(*) from public.sponsor_contracts where player_id='$PE' and status='active'")" "2"
for k in 1 2 3 4 5 6; do clear_p "$PE"; q "select public.sponsor_generate_offers_internal('$PE', now() + interval '$((k*8)) days')" >/dev/null; done
eq "over 6 refills neither active partner is ever offered again" "$(q "select count(*) from public.sponsor_offers where player_id='$PE' and created_at > now() + interval '1 day' and company_id in ('$(id 'Veltaro Cycling')','$(id 'Noryx Power')')")" "0"
clear_p "$PE"; q "select public.sponsor_generate_offers_internal('$PE', now() + interval '60 days')" >/dev/null
eq "the remaining firms (Aerovex, Rydexa, Kadrin) are what he gets" "$(q "select count(*) from public.sponsor_offers where player_id='$PE' and status='open' and company_id in ('$(id 'Aerovex')','$(id 'Rydexa')','$(id 'Kadrin Wheels')')")" "3"

echo "== 4. the same firm may sponsor DIFFERENT players"
setcat "Veltaro Cycling|Noryx Power|Aerovex"
PA=$(NEWP); PB=$(NEWP); PC=$(NEWP)
eq "three players each hold an offer from the same firm" "$(q "select count(distinct player_id) from public.sponsor_offers where company_id='$(id 'Veltaro Cycling')' and player_id in ('$PA','$PB','$PC') and status='open'")" "3"
eq "a firm that has an active contract with A still offers to B" "$(q "select count(*) from public.sponsor_offers where player_id='$PB' and company_id='$(id 'Veltaro Cycling')'")" "1"

echo "== 5. concurrent runs create no duplicates (8 parallel sessions)"
setcat "Veltaro Cycling|Noryx Power|Aerovex|Rydexa|Kadrin Wheels|Solvanta Energy"
PX=$(NEWP); clear_p "$PX"
for i in 1 2 3 4 5 6 7 8; do ( psqlc t -c "select public.sponsor_generate_offers_internal('$PX', now() + interval '30 days')" > "$DIR/par_$i.out" ) & done; wait
eq "parallel generator runs: exactly 3 open offers" "$(q "select count(*) from public.sponsor_offers where player_id='$PX' and status='open'")" "3"
eq "...of 3 different firms" "$(q "select count(distinct company_id) from public.sponsor_offers where player_id='$PX' and status='open'")" "3"
eq "...the runs returned 3 in total (one worked, the rest saw its state)" "$(cat "$DIR"/par_*.out | grep -E '^[0-9]+$' | paste -sd+ | bc)" "3"
eq "no run failed" "$(cat "$DIR"/par_*.out | grep -ci error)" "0"
PY=$(NEWP); q "update public.sponsor_offers set status='rejected' where player_id='$PY'" >/dev/null
CY=$(id 'Aerovex'); rm -f "$DIR"/dup_*.out
for i in 1 2 3 4 5 6; do ( psqlc t -c "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PY','$CY','main',10,'finishTour','winStage', now()+interval '21 days')" > "$DIR/dup_$i.out" ) & done; wait
eq "6 parallel direct inserts of the SAME firm: exactly one wins" "$(q "select count(*) from public.sponsor_offers where player_id='$PY' and company_id='$CY' and status='open'")" "1"
eq "...the other 5 were refused" "$(cat "$DIR"/dup_*.out | grep -c 'ERROR')" "5"
# offer insert racing a contract insert for the same firm and player
PZ=$(NEWP); q "update public.sponsor_offers set status='rejected' where player_id='$PZ'" >/dev/null
q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PZ','$(id 'Rydexa')','main',10,'finishTour','winStage', now()+interval '21 days')" >/dev/null
OZ=$(q "select id from public.sponsor_offers where player_id='$PZ' and company_id='$(id 'Rydexa')' and status='open'")
q "update public.sponsor_offers set status='accepted' where id='$OZ'" >/dev/null
( contract "$PZ" "$(id 'Rydexa')" "$OZ" > "$DIR/race_c.out" 2>&1 ) & ( psqlc t -c "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PZ','$(id 'Rydexa')','main',10,'finishTour','winStage', now()+interval '21 days')" > "$DIR/race_o.out" ) & wait
eq "offer vs contract race: never both an active contract AND a valid offer of the firm" "$(q "select (select count(*) from public.sponsor_contracts where player_id='$PZ' and company_id='$(id 'Rydexa')' and status='active') + (select count(*) from public.sponsor_offers where player_id='$PZ' and company_id='$(id 'Rydexa')' and status='open')")" "1"

echo "== 6. a rejection creates NO immediate replacement; the refill is the Sunday update"
setcat "Veltaro Cycling|Noryx Power|Aerovex|Rydexa|Kadrin Wheels|Solvanta Energy"
PR=$(NEWP); R=$(q "select id from public.sponsor_offers where player_id='$PR' and status='open' limit 1")
eq "reject works" "$(as "$PR" "select public.reject_my_sponsor_offer('$R')")" "t"
eq "2 open right after the rejection (no instant replacement)" "$(q "select count(*) from public.sponsor_offers where player_id='$PR' and status='open'")" "2"
eq "visiting /sponsors again (ensure) in the same period adds nothing" "$(as "$PR" "select public.ensure_my_sponsor_offers()")" "0"
KEY=$(q "select public.sponsor_week_key(now())"); SUN=$(q "select (timestamptz '$(q "select (date '$KEY' + 7)::text") 00:00:00+01')")
eq "the Sunday update adds the single missing offer" "$(q "select public.sponsor_generate_offers_internal('$PR', '$SUN')")" "1"
eq "the rejected firm is available again if no rule blocks it (3 open of 6 firms)" "$(q "select count(*) from public.sponsor_offers where player_id='$PR' and status='open'")" "3"

echo "== 7. goals follow the REAL calendar (tour_schedule + season start)"
q "delete from public.tour_schedule" >/dev/null
eq "calendar V2 (Tours in weeks 2/4/6/8/10): 10-week contract signed Sun 2026-11-22 -> 3 guaranteed race weeks" "$(q "insert into public.tour_schedule values ('highlands-tour',2),('danube-tour',4),('coastal-tour',6),('northern-crown-tour',8),('silver-horizon-tour',10); select public.sponsor_reachable_tours('2026-11-22 12:00+00', 10)" | tail -1)" "3"
eq "...a 20-week contract -> 8" "$(q "select public.sponsor_reachable_tours('2026-11-22 12:00+00', 20)")" "8"
q "delete from public.tour_schedule; insert into public.tour_schedule values ('highlands-tour',2),('danube-tour',5),('coastal-tour',5),('northern-crown-tour',7),('silver-horizon-tour',9)" >/dev/null
eq "calendar V1 (Danube+Coastal share week 5 = counted ONCE): same date, 10 weeks -> 2" "$(q "select public.sponsor_reachable_tours('2026-11-22 12:00+00', 10)")" "2"
eq "a 5-week window cannot reach what a 10-week one can (shorter -> fewer or equal)" "$(q "select public.sponsor_reachable_tours('2026-11-22 12:00+00', 5) <= public.sponsor_reachable_tours('2026-11-22 12:00+00', 10)")" "t"
eq "the 21-day signing window is respected: a contract can never count a week before the latest signing week" "$(q "select public.sponsor_reachable_tours('2026-11-22 12:00+00', 4)")" "0"
eq "before season 1 starts the arithmetic does not go negative" "$(q "select public.sponsor_reachable_tours('2026-07-04 12:00+00', 10) >= 0")" "t"
q "delete from public.tour_schedule; insert into public.tour_schedule values ('only-week-5',5)" >/dev/null
eq "a calendar whose only Tour week lies OUTSIDE the contract -> 0 reachable" "$(q "select public.sponsor_reachable_tours('2026-11-22 12:00+00', 10)")" "0"
PN=$(NEWP); eq "...then NO offer is generated (no unreachable goal)" "$(q "select count(*) from public.sponsor_offers where player_id='$PN'")" "0"
eq "...and NO state is stored, so the next visit retries" "$(q "select count(*) from public.sponsor_player_state where player_id='$PN'")" "0"
q "delete from public.tour_schedule" >/dev/null
PM=$(NEWP); eq "no calendar at all -> nothing generated either" "$(q "select count(*) from public.sponsor_offers where player_id='$PM'")" "0"
q "insert into public.tour_schedule values ('highlands-tour',2),('danube-tour',4),('coastal-tour',6),('northern-crown-tour',8),('silver-horizon-tour',10)" >/dev/null
eq "calendar back: the next visit creates the offers" "$(as "$PM" "select public.ensure_my_sponsor_offers()")" "3"
# goals depend on the reach: a goal needing more Tours than reachable is never picked
q "update public.sponsor_goal_catalog set min_tours = 3 where goal_type = 'winTour'" >/dev/null
eq "reach 2: winTour (needs 3 race weeks) is never picked for Elite, over 80 seeds" "$(q "select count(*) from (select (public.sponsor_pick_goals('elite', 2, 'base', g::text)).* from generate_series(1,80) g) x where g1='winTour' or g2='winTour'")" "0"
eq "reach 3: winTour can be picked" "$(q "select count(*) > 0 from (select (public.sponsor_pick_goals('elite', 3, 'base', g::text)).* from generate_series(1,80) g) x where g1='winTour' or g2='winTour'")" "t"
eq "reach 0: no goals at all" "$(q "select count(*) from (select (public.sponsor_pick_goals('rookie', 0, 'base', g::text)).* from generate_series(1,20) g) x where g1 is not null")" "0"
q "update public.sponsor_goal_catalog set min_tours = 1 where goal_type = 'winTour'" >/dev/null
eq "every offer generated above still has 2 DIFFERENT goals, easier before harder" "$(q "select count(*) from public.sponsor_offers o join public.sponsor_goal_catalog a on a.goal_type=o.goal1_type join public.sponsor_goal_catalog b on b.goal_type=o.goal2_type where o.kind='main' and (o.goal1_type = o.goal2_type or b.rank <= a.rank)")" "0"
eq "offers record the new generator version" "$(q "select count(*) from public.sponsor_offers where generator_version='g2'")" "$(q "select count(*) from public.sponsor_offers where created_at > now() - interval '1 hour' and generator_version is not null")"

echo "== 8. existing duplicates: identified, never deleted"
setcat "Veltaro Cycling|Noryx Power|Aerovex"
PD=$(NEWP); q "update public.sponsor_offers set status='rejected' where player_id='$PD'" >/dev/null
q "alter table public.sponsor_offers disable trigger sponsor_offers_company_guard_trg; alter table public.sponsor_offers disable trigger sponsor_offers_guard_trg" >/dev/null
q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PD','$(id 'Aerovex')','main',10,'finishTour','winStage', now()+interval '21 days')" >/dev/null
OD=$(q "select id from public.sponsor_offers where player_id='$PD' and status='open'"); contract "$PD" "$(id 'Aerovex')" "$OD" >/dev/null
q "update public.sponsor_offers set status='accepted' where id='$OD'" >/dev/null
q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$PD','$(id 'Aerovex')','main',10,'top50','top10', now()+interval '21 days')" >/dev/null
q "alter table public.sponsor_offers enable trigger sponsor_offers_company_guard_trg; alter table public.sponsor_offers enable trigger sponsor_offers_guard_trg" >/dev/null
eq "report finds the legacy duplicate (open offer + active contract of the same firm)" "$(q "select count(*) from public.sponsor_duplicate_report() where issue='open_offer_and_active_contract' and player_id='$PD'")" "1"
BEF=$(q "select (select count(*) from public.sponsor_offers)||':'||(select count(*) from public.sponsor_contracts)")
eq "dry run changes nothing and says what it would do" "$(q "select action from public.sponsor_fix_duplicate_offers() where player_id='$PD'")" "would_expire"
eq "...row counts unchanged after the dry run" "$(q "select (select count(*) from public.sponsor_offers)||':'||(select count(*) from public.sponsor_contracts)")" "$BEF"
eq "...the offer is still open after the dry run" "$(q "select count(*) from public.sponsor_offers where player_id='$PD' and status='open'")" "1"
q "select count(*) from public.sponsor_fix_duplicate_offers(true)" >/dev/null
eq "apply: the conflicting OFFER is set to 'expired' (kept, not deleted)" "$(q "select count(*) from public.sponsor_offers where player_id='$PD' and status='expired' and company_id='$(id 'Aerovex')'")" "1"
eq "...no row was deleted and the contract is untouched" "$(q "select (select count(*) from public.sponsor_offers)||':'||(select count(*) from public.sponsor_contracts)||':'||(select count(*) from public.sponsor_contracts where status='active' and player_id='$PD')")" "$BEF:1"
eq "the report is clean afterwards" "$(q "select count(*) from public.sponsor_duplicate_report() where player_id='$PD'")" "0"
has "players cannot read the report" "$(as "$PD" "select * from public.sponsor_duplicate_report()")" "permission denied"
has "players cannot run the fixer" "$(as "$PD" "select * from public.sponsor_fix_duplicate_offers(true)")" "permission denied"
has "players cannot run the generator or the reach function" "$(as "$PD" "select public.sponsor_reachable_tours(now(), 10)")" "permission denied"

echo "== 9. separation, limits and money are untouched"
eq "nobody ever has more than 3 open main offers" "$(q "select coalesce(max(c),0) from (select count(*) c from public.sponsor_offers where kind='main' and status='open' group by player_id) x")" "3"
eq "a player reads only his own offers" "$(as "$PA" "select count(*) from public.sponsor_offers where player_id <> '$PA'")" "0"
eq "offers are valid exactly 21 days" "$(q "select count(*) from public.sponsor_offers where generator_version in ('g1','g2') and expires_at <> created_at + interval '21 days'")" "0"
eq "no money on any generated offer" "$(q "select count(*) from public.sponsor_offers where generator_version in ('g1','g2') and (weekly_income_cents is not null or goal1_bonus_cents is not null or goal2_bonus_cents is not null)")" "0"
eq "the unique index for active contracts exists" "$(q "select count(*) from pg_indexes where indexname='sponsor_contracts_one_active_per_company'")" "1"
eq "no payout was created by anything" "$(q "select count(*) from public.sponsor_payouts")" "0"


echo "== 10. UPDATE guards (migration 05): the rule cannot be bypassed by changing firm, player or status later"
setcat "Veltaro Cycling|Noryx Power|Aerovex|Rydexa|Kadrin Wheels|Solvanta Energy"
mkoffer() { q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, status, expires_at) values ('$1','$(id "$2")','main',10,'finishTour','winStage','${3:-open}', now()+interval '21 days') returning id" | head -1; }
endc() { q "update public.sponsor_contracts set status='ended', ended_at=now() where player_id='$1' and company_id='$(id "$2")' and status='active'" >/dev/null; }
PU=$(NEWP); clear_p "$PU"
OV=$(mkoffer "$PU" 'Veltaro Cycling'); ON=$(mkoffer "$PU" 'Noryx Power')
has "U1 changing the firm of an open offer to a firm he already has an open offer from is refused" "$(q "update public.sponsor_offers set company_id='$(id 'Veltaro Cycling')' where id='$ON'")" "sponsor_company_already_offered\|duplicate key"
OA=$(mkoffer "$PU" 'Aerovex'); contract "$PU" "$(id 'Aerovex')" "$OA" >/dev/null; q "update public.sponsor_offers set status='accepted' where id='$OA'" >/dev/null
has "U2 changing an open offer to the firm of an ACTIVE contract is refused" "$(q "update public.sponsor_offers set company_id='$(id 'Aerovex')' where id='$ON'")" "sponsor_company_has_active_contract"
has "U3 re-opening the accepted offer of an active-contract firm is refused" "$(q "update public.sponsor_offers set status='open' where id='$OA'")" "sponsor_company_has_active_contract"
OVR=$(mkoffer "$PU" 'Veltaro Cycling' rejected)
has "U4 re-opening a rejected offer while another valid offer of the firm exists is refused" "$(q "update public.sponsor_offers set status='open' where id='$OVR'")" "sponsor_company_already_offered\|duplicate key"
ORJ=$(mkoffer "$PU" 'Rydexa' rejected)
eq "U4b ...but re-opening a rejected offer of a free firm is allowed (rule does not over-block)" "$(q "update public.sponsor_offers set status='open' where id='$ORJ' returning status")" "open"
q "update public.sponsor_offers set status='rejected' where id='$ORJ'" >/dev/null
endc "$PU" 'Aerovex'
OAX=$(mkoffer "$PU" 'Aerovex' expired)
has "U5 'not twice in a row': re-opening an offer of the LAST signed (now ended) firm is refused" "$(q "update public.sponsor_offers set status='open' where id='$OAX'")" "sponsor_same_company_twice"
has "U5b ...and so is changing an open offer to the last signed firm" "$(q "update public.sponsor_offers set company_id='$(id 'Aerovex')' where id='$ON'")" "sponsor_same_company_twice"
# contracts: reactivation
PC=$(NEWP); clear_p "$PC"
O1=$(mkoffer "$PC" 'Kadrin Wheels' accepted); contract "$PC" "$(id 'Kadrin Wheels')" "$O1" >/dev/null; endc "$PC" 'Kadrin Wheels'
O2=$(mkoffer "$PC" 'Solvanta Energy' accepted); contract "$PC" "$(id 'Solvanta Energy')" "$O2" >/dev/null; endc "$PC" 'Solvanta Energy'
O3=$(mkoffer "$PC" 'Kadrin Wheels' accepted); contract "$PC" "$(id 'Kadrin Wheels')" "$O3" >/dev/null
C1=$(q "select id from public.sponsor_contracts where offer_id='$O1'")
has "U6 re-activating an ended contract while another ACTIVE contract with the firm exists is refused" "$(q "update public.sponsor_contracts set status='active', ended_at=null where id='$C1'")" "sponsor_company_has_active_contract\|duplicate key"
PC2=$(NEWP); clear_p "$PC2"
P1=$(mkoffer "$PC2" 'Kadrin Wheels' accepted); contract "$PC2" "$(id 'Kadrin Wheels')" "$P1" >/dev/null; endc "$PC2" 'Kadrin Wheels'
P2=$(mkoffer "$PC2" 'Solvanta Energy' accepted); contract "$PC2" "$(id 'Solvanta Energy')" "$P2" >/dev/null; endc "$PC2" 'Solvanta Energy'
mkoffer "$PC2" 'Kadrin Wheels' >/dev/null
CP1=$(q "select id from public.sponsor_contracts where offer_id='$P1'")
has "U7 re-activating an ended contract while a VALID offer of the firm exists is refused" "$(q "update public.sponsor_contracts set status='active', ended_at=null where id='$CP1'")" "sponsor_company_already_offered"
has "U8 a contract's firm or player can never be changed (terms immutable since 01)" "$(q "update public.sponsor_contracts set company_id='$(id 'Rydexa')' where id='$CP1'")" "contract_terms_are_immutable"
# moving an offer to another player
PV=$(NEWP); clear_p "$PV"; mkoffer "$PV" 'Veltaro Cycling' >/dev/null
has "U9 moving an offer to a player who already holds an offer of that firm is refused" "$(q "update public.sponsor_offers set player_id='$PV' where id='$OV'")" "sponsor_company_already_offered\|duplicate key"
PW=$(NEWP); clear_p "$PW"
eq "U9b ...moving it to a player without that firm is allowed (the same firm may sponsor different players)" "$(q "update public.sponsor_offers set player_id='$PW' where id='$OV' returning player_id")" "$PW"
# ordinary operations still work
eq "U10 rejecting through the player function still works" "$(as "$PU" "select public.reject_my_sponsor_offer('$ON')")" "t"
eq "U10b the weekly expiry still works" "$(q "select public.expire_sponsor_offers(now() + interval '40 days') >= 1")" "t"
PL=$(NEWP); clear_p "$PL"; OL=$(mkoffer "$PL" 'Rydexa')
eq "U10c an unrelated update of an open offer (resolved_at) is not blocked" "$(q "update public.sponsor_offers set resolved_at = null where id='$OL' returning status")" "open"
# concurrent UPDATEs
PK=$(NEWP); clear_p "$PK"; KA=$(mkoffer "$PK" 'Veltaro Cycling'); KB=$(mkoffer "$PK" 'Noryx Power'); rm -f "$DIR"/upd_*.out
( psqlc t -c "update public.sponsor_offers set company_id='$(id 'Rydexa')' where id='$KA'" > "$DIR/upd_1.out" ) & ( psqlc t -c "update public.sponsor_offers set company_id='$(id 'Rydexa')' where id='$KB'" > "$DIR/upd_2.out" ) & wait
eq "U11 two concurrent updates to the same firm: exactly one open offer of it" "$(q "select count(*) from public.sponsor_offers where player_id='$PK' and status='open' and company_id='$(id 'Rydexa')'")" "1"
eq "U11b ...the other update was refused" "$(cat "$DIR"/upd_*.out | grep -c ERROR)" "1"
PQ=$(NEWP); clear_p "$PQ"
Q1=$(mkoffer "$PQ" 'Kadrin Wheels' accepted); contract "$PQ" "$(id 'Kadrin Wheels')" "$Q1" >/dev/null; endc "$PQ" 'Kadrin Wheels'
Q2=$(mkoffer "$PQ" 'Solvanta Energy' accepted); contract "$PQ" "$(id 'Solvanta Energy')" "$Q2" >/dev/null; endc "$PQ" 'Solvanta Energy'
QX=$(mkoffer "$PQ" 'Kadrin Wheels' rejected); QC=$(q "select id from public.sponsor_contracts where offer_id='$Q1'")
( psqlc t -c "update public.sponsor_contracts set status='active', ended_at=null where id='$QC'" > "$DIR/upd_c.out" 2>&1 ) & ( psqlc t -c "update public.sponsor_offers set status='open' where id='$QX'" > "$DIR/upd_o.out" 2>&1 ) & wait
eq "U12 contract re-activation racing an offer re-opening: never both an active contract AND a valid offer of the firm" "$(q "select (select count(*) from public.sponsor_contracts where player_id='$PQ' and company_id='$(id 'Kadrin Wheels')' and status='active') + (select count(*) from public.sponsor_offers where player_id='$PQ' and company_id='$(id 'Kadrin Wheels')' and status='open')")" "1"
eq "no player ever has an active contract and a valid offer of the same firm (whole database)" "$(q "select count(*) from public.sponsor_duplicate_report() where issue in ('open_offer_and_active_contract','two_open_offers_same_company','two_active_contracts_same_company') and player_id in ('$PU','$PC','$PC2','$PK','$PQ','$PL','$PV','$PW')")" "0"

echo "== 11. the SQL calendar equals the game's TypeScript calendar (shared fixture, $(python3 -c "import json;print(len(json.load(open('$FIX'))))") cases)"
for cal in v1 v2; do
  python3 - "$FIX" "$cal" "$DIR/reach_$cal.sql" <<'PY'
import json,sys
cases=[c for c in json.load(open(sys.argv[1])) if c['calendar']==sys.argv[2]]
rows=",\n".join("('%s'::timestamptz,%d,%d)"%(c['now'],c['weeks'],c['expected']) for c in cases)
sched={'v1':"('highlands-tour',2),('danube-tour',5),('coastal-tour',5),('northern-crown-tour',7),('silver-horizon-tour',9)",'v2':"('highlands-tour',2),('danube-tour',4),('coastal-tour',6),('northern-crown-tour',8),('silver-horizon-tour',10)"}[sys.argv[2]]
open(sys.argv[3],'w').write("delete from public.tour_schedule;\ninsert into public.tour_schedule values %s;\nselect count(*) || '/' || sum((public.sponsor_reachable_tours(n, w) <> e)::int) from (values\n%s) v(n,w,e);\n"%(sched,rows))
PY
  RES=$(psqlc t -f "$DIR/reach_$cal.sql" | tail -1)
  eq "calendar $cal: every case matches (cases/mismatches)" "${RES#*/}" "0"
done
q "delete from public.tour_schedule; insert into public.tour_schedule values ('highlands-tour',2),('danube-tour',4),('coastal-tour',6),('northern-crown-tour',8),('silver-horizon-tour',10)" >/dev/null

echo "== 12. diagnostic script: read-only, works in every state"
ROQ() { PGOPTIONS='-c default_transaction_read_only=on' psql -h "$DIR" -p $PORT -U postgres -d "${2:-t}" -qtA -v ON_ERROR_STOP=1 -f "$1" 2>&1; }
SNAP() { q "select (select count(*) from public.sponsor_offers)||':'||(select count(*) from public.sponsor_contracts)||':'||(select count(*) from public.sponsor_player_state)||':'||(select count(*) from public.profiles)||':'||(select count(*) from public.tour_schedule)||':'||(select count(*) from public.sponsor_companies)"; }
q "update public.sponsor_companies set active = true where kind='main'" >/dev/null
S0=$(SNAP); OUT=$(ROQ "$DIAG"); eq "runs in a READ-ONLY transaction without error (V2 calendar, all migrations)" "$(echo "$OUT" | grep -c '^0|SÚHRN')" "1"
eq "...nothing in the database changed" "$(SNAP)" "$S0"
has "V2 calendar is recognised" "$OUT" "KALENDÁR 2"
eq "...check 32 (never 0 race weeks in a year) OK" "$(echo "$OUT" | grep '^32|' | cut -d'|' -f3)" "OK"
eq "...the generator function and the independent recount agree (31)" "$(echo "$OUT" | grep '^31|' | cut -d'|' -f3)" "OK"
eq "...all five migrations detected as applied" "$(echo "$OUT" | grep -E '^4[1-4]\|' | cut -d'|' -f3 | sort -u | tr '\n' ',')" "OK,"
eq "...the scheduler is reported as NOT connected" "$(echo "$OUT" | grep '^70|' | cut -d'|' -f3)" "WARN"
q "delete from public.tour_schedule; insert into public.tour_schedule values ('highlands-tour',2),('danube-tour',5),('coastal-tour',5),('northern-crown-tour',7),('silver-horizon-tour',9)" >/dev/null
OUT=$(ROQ "$DIAG"); has "V1 calendar is recognised" "$OUT" "KALENDÁR 1"; eq "...V1 still passes check 32" "$(echo "$OUT" | grep '^32|' | cut -d'|' -f3)" "OK"
q "delete from public.tour_schedule; insert into public.tour_schedule values ('only-week-5',5)" >/dev/null
OUT=$(ROQ "$DIAG"); eq "a calendar with a Tour week outside the contract window: check 32 = FAIL" "$(echo "$OUT" | grep '^32|' | cut -d'|' -f3)" "FAIL"
eq "...and the verdict is FAIL" "$(echo "$OUT" | grep '^0|SÚHRN' | cut -d'|' -f3)" "FAIL"
q "delete from public.tour_schedule" >/dev/null
OUT=$(ROQ "$DIAG"); eq "an EMPTY calendar: check 10 table exists but 11/12 FAIL" "$(echo "$OUT" | grep -E '^1[12]\|' | cut -d'|' -f3 | sort -u | tr '\n' ',')" "FAIL,"
q "insert into public.tour_schedule values ('highlands-tour',2),('danube-tour',4),('coastal-tour',6),('northern-crown-tour',8),('silver-horizon-tour',10)" >/dev/null
OUT=$(ROQ "$DIAG" empty); eq "on a database with NO sponsor tables and NO calendar it still runs (no error)" "$(echo "$OUT" | grep -c '^0|SÚHRN')" "1"
# a planted legacy duplicate is reported
PD2=$(NEWP); clear_p "$PD2"; q "alter table public.sponsor_offers disable trigger sponsor_offers_company_guard_trg; alter table public.sponsor_offers disable trigger sponsor_offers_guard_trg" >/dev/null
LO=$(mkoffer "$PD2" 'Rydexa' accepted); contract "$PD2" "$(id 'Rydexa')" "$LO" >/dev/null; mkoffer "$PD2" 'Rydexa' >/dev/null
q "alter table public.sponsor_offers enable trigger sponsor_offers_company_guard_trg; alter table public.sponsor_offers enable trigger sponsor_offers_guard_trg" >/dev/null
OUT=$(ROQ "$DIAG"); eq "diagnostic flags a legacy duplicate (check 51 = FAIL)" "$(echo "$OUT" | grep '^51|' | cut -d'|' -f3)" "FAIL"
q "select count(*) from public.sponsor_fix_duplicate_offers(true)" >/dev/null

echo "== 13. registration, recovery and the page view"
setcat "Veltaro Cycling|Noryx Power|Aerovex|Rydexa|Kadrin Wheels|Solvanta Energy"
q "alter table public.sponsor_goal_catalog rename to sponsor_goal_catalog_x" >/dev/null
PF=$(q "insert into auth.users default values returning id" | grep -E '^[0-9a-f-]{36}$' | head -1); q "alter table public.sponsor_goal_catalog_x rename to sponsor_goal_catalog" >/dev/null
eq "initial generation failed (sign-up still succeeded, profile exists, no offers yet)" "$(q "select (select count(*) from public.profiles where id='$PF')||':'||(select count(*) from public.sponsor_offers where player_id='$PF')")" "1:0"
eq "recovery: the first visit of /sponsors creates the 3 offers" "$(as "$PF" "select public.ensure_my_sponsor_offers()")" "3"
eq "newcomer in Rookie: basic goals (easy participate/finish, hard top50/top10), 10 weeks, 21 days" "$(q "select count(*) from public.sponsor_offers where player_id='$PF' and goal1_type in ('participateTour','finishTour') and goal2_type in ('top50','top10') and duration_weeks=10 and expires_at=created_at+interval '21 days'")" "3"
PS=$(NEWP); POTHER=$(NEWP)
q "update public.sponsor_offers set status='rejected' where player_id='$PS'; delete from public.sponsor_player_state where player_id='$PS'; select public.sponsor_generate_offers_internal('$PS', now())" >/dev/null
OS=$(q "select id from public.sponsor_offers where player_id='$PS' and status='open' limit 1"); CS=$(q "select company_id from public.sponsor_offers where id='$OS'")
contract "$PS" "$CS" "$OS" >/dev/null; q "update public.sponsor_offers set status='accepted' where id='$OS'" >/dev/null
eq "page view: a player sees only his own offers (<= 3, all open main)" "$(as "$PS" "select count(*) from public.sponsor_offers where status='open'")" "2"
eq "page view: no offer or contract of another player is visible" "$(as "$PS" "select (select count(*) from public.sponsor_offers where player_id <> '$PS')||':'||(select count(*) from public.sponsor_contracts where player_id <> '$PS')")" "0:0"
eq "page view: the player sees only the firms of his own offers/contracts (not the 30-firm catalogue)" "$(as "$PS" "select count(*) from public.sponsor_companies")" "$(q "select count(distinct company_id) from (select company_id from public.sponsor_offers where player_id='$PS' union all select company_id from public.sponsor_contracts where player_id='$PS') x")"
eq "page view: every open offer has exactly 2 different goals" "$(as "$PS" "select count(*) from public.sponsor_offers where status='open' and goal1_type is not null and goal2_type is not null and goal1_type <> goal2_type")" "2"
eq "page view: another player's rows stay invisible the other way round too" "$(as "$POTHER" "select count(*) from public.sponsor_contracts")" "0"
has "a player cannot write offers, contracts or payouts" "$(as "$PS" "update public.sponsor_contracts set status='ended'")" "permission denied"

echo "== 14. migration safety: order, dependencies, rollback on failure"
has "05 without 04 is refused" "$(psqlc empty -f "$M5" 2>&1)" "Run 20261122_01"
psqlc nocal -c "select 1" >/dev/null 2>&1 || { psqlc postgres -c "create database nocal" >/dev/null; psqlc nocal -f "$DIR/stub.sql" >/dev/null; psqlc nocal -f "$BASE" >/dev/null 2>&1; for m in "$M1" "$M2" "$M3"; do psqlc nocal -f "$m" >/dev/null 2>&1; done; }
has "04 without the calendar table is refused with a clear message" "$(psqlc nocal -f "$M4" 2>&1)" "tour_schedule"
eq "...and a refused 04 leaves NOTHING behind (transaction rolled back: no function, no trigger)" "$(psqlc nocal -c "select (select count(*) from pg_proc where proname in ('sponsor_reachable_tours','sponsor_offer_company_guard','sponsor_duplicate_report'))||':'||(select count(*) from pg_trigger where tgname like 'sponsor_%company_guard%')")" "0:0"
eq "no sponsor migration deletes or rewrites player data (no delete/truncate/drop table/drop column in any of the five)" "$(cat "$ROOT"/migrations/20261122_0[1-5]_*.sql | sed 's/--.*$//' | grep -ciE '\bdelete from\b|\btruncate\b|\bdrop table\b|\bdrop column\b')" "0"

echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
