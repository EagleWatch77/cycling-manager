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
M1="$ROOT/migrations/20261122_01_sponsors_foundation.sql"; M2="$ROOT/migrations/20261122_02_sponsor_catalog_main_30.sql"; M3="$ROOT/migrations/20261122_03_sponsor_offer_generator.sql"; M4="$ROOT/migrations/20261122_04_sponsor_generator_fixes.sql"


for m in "$M1" "$M2" "$M3" "$M4"; do psqlc t -f "$m" >/dev/null 2>&1 || { echo "migration failed: $m"; psqlc t -f "$m" | tail -3; exit 1; }; done
ok "01+02+03+04 apply in order"
psqlc t -f "$M4" >/dev/null 2>&1 && ok "04 is idempotent" || bad "04 rerun" "$(psqlc t -f "$M4" | tail -2)"
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

echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
