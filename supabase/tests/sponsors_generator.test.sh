#!/usr/bin/env bash
# Sponzori offer generator (migration 20261122_03) against a REAL local Postgres 16.
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/sponsors_generator.test.sh   (run as a non-root user, e.g. postgres)
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

echo "== 0. wrong order refused"
has "03 without 01/02 stops with a clear message" "$(psqlc empty -f "$M3")" "Run 20261122_01"
psqlc empty -f "$M1" >/dev/null 2>&1
has "03 with only 01 still refuses (needs the catalogue columns)" "$(psqlc empty -f "$M3")" "Run 20261122_01"

echo "== 1. existing players BEFORE the migration (must be left alone, filled lazily later)"
OLD1=$(q "insert into auth.users default values returning id" | head -1); OLD2=$(q "insert into auth.users default values returning id" | head -1)
psqlc t -f "$M1" >/dev/null 2>&1 && psqlc t -f "$M2" >/dev/null 2>&1 || { echo "01/02 failed"; exit 1; }
SEC=$(q "insert into public.sponsor_companies (name, kind) values ('Future Secondary Co','secondary') returning id" | head -1)
q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, created_at, expires_at) values ('$OLD1','$SEC','secondary',5,'finishTour','winStage', now() - interval '30 days', now() - interval '9 days')" >/dev/null
BEFORE_OFFERS=$(q "select count(*) from public.sponsor_offers"); BEFORE_PROF=$(q "select count(*) from public.profiles")
if psqlc t -f "$M3" >/dev/null 2>&1; then ok "03 applies on top of 01+02 with existing players"; else bad "03 applies" "$(psqlc t -f "$M3" | tail -3)"; exit 1; fi
if [ "${WITH_04:-0}" = 1 ]; then
  if psqlc t -f "$M4" >/dev/null 2>&1; then ok "04 (fixes) applied on top: ALL checks below run against 01+02+03+04"; else bad "04 applies" "$(psqlc t -f "$M4" | tail -3)"; exit 1; fi
fi
if [ "${WITH_04:-0}" = 1 ]; then
  psqlc t -f "$M4" >/dev/null 2>&1 && ok "04 is idempotent (second run)" || bad "04 second run" "$(psqlc t -f "$M4" | tail -3)"
  psqlc t -f "$M3" >/dev/null 2>&1 && bad "re-running the OLDER 03 after 04 must not silently downgrade the generator" "it ran" || ok "re-running the older 03 after 04 is refused (fail-safe, rolled back)"
else
  psqlc t -f "$M3" >/dev/null 2>&1 && ok "03 is idempotent (second run)" || bad "second run" "$(psqlc t -f "$M3" | tail -3)"
fi
eq "existing players got NO offers from the migration itself" "$(q "select count(*) from public.sponsor_offers")" "$BEFORE_OFFERS"
eq "profiles untouched" "$(q "select count(*) from public.profiles")" "$BEFORE_PROF"
eq "no contract, payout or money exists" "$(q "select (select count(*) from public.sponsor_contracts)+(select count(*) from public.sponsor_payouts)+(select count(*) from public.sponsor_offers where weekly_income_cents is not null or goal1_bonus_cents is not null or goal2_bonus_cents is not null)")" "0"

echo "== 2. goal configuration"
eq "only the 7 goals the game can evaluate are implemented" "$(q "select string_agg(goal_type, ',' order by rank) from public.sponsor_goal_catalog where implemented")" "participateTour,finishTour,top50,top10,winStage,anyJersey,winTour"
eq "Worlds, promotion and season win are NOT offered" "$(q "select string_agg(goal_type, ',' order by rank) from public.sponsor_goal_catalog where not implemented")" "winSeason,promotion,participateWorlds,top3Worlds,winWorlds"
eq "5 league windows" "$(q "select count(*) from public.sponsor_league_goal_windows")" "5"
eq "min reachable Tours: 10 weeks 3, 20 weeks 6, 5 weeks 1" "$(q "select public.sponsor_min_reachable_tours(10)||','||public.sponsor_min_reachable_tours(20)||','||public.sponsor_min_reachable_tours(5)")" "3,6,1"

echo "== 3. a NEW player gets 3 offers AT ONCE at registration (mid-season, no waiting)"
NEW=$(q "insert into auth.users default values returning id" | head -1)
eq "3 open main offers exist right after sign-up" "$(q "select count(*) from public.sponsor_offers where player_id='$NEW' and kind='main' and status='open'")" "3"
eq "all from the 30-company catalogue (main, numbered)" "$(q "select count(*) from public.sponsor_offers o join public.sponsor_companies c on c.id=o.company_id where o.player_id='$NEW' and c.kind='main' and c.catalog_no between 1 and 30")" "3"
eq "three DIFFERENT companies in the set" "$(q "select count(distinct company_id) from public.sponsor_offers where player_id='$NEW'")" "3"
eq "every offer has exactly 2 different goals" "$(q "select count(*) from public.sponsor_offers where player_id='$NEW' and goal1_type is not null and goal2_type is not null and goal1_type <> goal2_type")" "3"
eq "valid EXACTLY 21 days from creation" "$(q "select count(*) from public.sponsor_offers where player_id='$NEW' and expires_at = created_at + interval '21 days'")" "3"
eq "money columns are all NULL (Zatiaľ neurčené)" "$(q "select count(*) from public.sponsor_offers where player_id='$NEW' and (weekly_income_cents is not null or goal1_bonus_cents is not null or goal2_bonus_cents is not null)")" "0"
eq "rookie main contract length is 10 weeks" "$(q "select string_agg(distinct duration_weeks::text, ',') from public.sponsor_offers where player_id='$NEW'")" "10"
eq "rookie base goals: easy in {participateTour, finishTour}, hard in {top50, top10}" "$(q "select count(*) from public.sponsor_offers where player_id='$NEW' and goal1_type in ('participateTour','finishTour') and goal2_type in ('top50','top10')")" "3"
eq "offers record generator version + tier (base: no results yet)" "$(q "select string_agg(distinct generator_version||':'||generator_tier, ',') from public.sponsor_offers where player_id='$NEW'")" "${GEN_VER:-g1}:base"
eq "state row written for this period" "$(q "select last_fill_week_key = public.sponsor_week_key(now()) from public.sponsor_player_state where player_id='$NEW'")" "t"
eq "the old (pre-migration) players still have nothing until they open /sponsors" "$(q "select count(*) from public.sponsor_offers where player_id='$OLD2'")" "0"

echo "== 4. lazy entry point for existing players; idempotent"
eq "existing player: first visit creates 3 offers" "$(as "$OLD2" "select public.ensure_my_sponsor_offers()")" "3"
eq "second call creates nothing" "$(as "$OLD2" "select public.ensure_my_sponsor_offers()")" "0"
eq "third call creates nothing" "$(as "$OLD2" "select public.ensure_my_sponsor_offers()")" "0"
eq "still exactly 3 (no duplicates)" "$(q "select count(*) from public.sponsor_offers where player_id='$OLD2' and status='open'")" "3"
eq "the existing SECONDARY offer of OLD1 is untouched by generation" "$(as "$OLD1" "select public.ensure_my_sponsor_offers()") $(q "select status from public.sponsor_offers where company_id='$SEC'")" "3 open"
has "anonymous/NULL caller refused" "$(q "select public.ensure_my_sponsor_offers()")" "not_authenticated"

echo "== 5. individual choice, shared companies"
for i in $(seq 1 40); do q "insert into auth.users default values" >/dev/null; done
eq "every player has 3 open main offers" "$(q "select count(*) from (select player_id from public.sponsor_offers where kind='main' and status='open' group by 1 having count(*)=3) x")" "$(q "select count(*) from public.profiles")"
eq "the sets differ between players (not one shared set)" "$( [ "$(q "select count(distinct s) from (select string_agg(company_id::text, ',' order by company_id) s from public.sponsor_offers where kind='main' group by player_id) x")" -gt 20 ] && echo many )" "many"
eq "one company offers contracts to MANY players" "$( [ "$(q "select max(c) from (select count(distinct player_id) c from public.sponsor_offers where kind='main' group by company_id) x")" -gt 2 ] && echo shared )" "shared"
eq "no set ever contains a company twice" "$(q "select count(*) from (select player_id, company_id from public.sponsor_offers where kind='main' and status='open' group by 1,2 having count(*)>1) x")" "0"
eq "NO offer anywhere contains a goal the game cannot evaluate" "$(q "select count(*) from public.sponsor_offers where kind='main' and (goal1_type in ('winSeason','promotion','participateWorlds','top3Worlds','winWorlds') or goal2_type in ('winSeason','promotion','participateWorlds','top3Worlds','winWorlds'))")" "0"
eq "the hard goal is always harder than the easy goal" "$(q "select count(*) from public.sponsor_offers o join public.sponsor_goal_catalog a on a.goal_type=o.goal1_type join public.sponsor_goal_catalog b on b.goal_type=o.goal2_type where o.kind='main' and b.rank <= a.rank")" "0"

echo "== 6. players are separated"
eq "a player reads only his own offers" "$(as "$NEW" "select count(*) from public.sponsor_offers")" "3"
eq "a player sees ONLY the companies of his own offers (not the catalogue of 30)" "$(as "$NEW" "select count(*) from public.sponsor_companies")" "3"
eq "...and exactly those" "$(as "$NEW" "select count(*) from public.sponsor_companies c where c.id in (select company_id from public.sponsor_offers where player_id='$NEW')")" "3"
has "player cannot call the internal generator" "$(as "$NEW" "select public.sponsor_generate_offers_internal('$OLD2')")" "permission denied"
has "player cannot run the all-players update" "$(as "$NEW" "select public.sponsor_weekly_update()")" "permission denied"
has "player cannot read the generator configuration" "$(as "$NEW" "select * from public.sponsor_goal_catalog")" "permission denied"
has "player cannot change the configuration" "$(as "$NEW" "update public.sponsor_generator_settings set generator_enabled=false")" "permission denied"
has "player cannot insert his own offer" "$(as "$NEW" "insert into public.sponsor_offers (player_id,company_id,kind,duration_weeks,goal1_type,goal2_type,expires_at) select '$NEW', id, 'main', 10, 'finishTour','winStage', now()+interval '21 days' from public.sponsor_companies limit 1")" "permission denied"
has "player cannot read the state table" "$(as "$NEW" "select * from public.sponsor_player_state")" "permission denied"

echo "== 7. reject and the Sunday refill (Europe/Bratislava, winter UTC+1)"
FIRST=$(q "select string_agg(id::text, ',' order by id) from public.sponsor_offers where player_id='$NEW' and status='open'")
REJ=$(q "select id from public.sponsor_offers where player_id='$NEW' and status='open' order by id limit 1")
eq "reject works" "$(as "$NEW" "select public.reject_my_sponsor_offer('$REJ')")" "t"
eq "the rejected offer disappears at once (2 open left)" "$(q "select count(*) from public.sponsor_offers where player_id='$NEW' and status='open'")" "2"
eq "NOT refilled when he visits again in the same period" "$(as "$NEW" "select public.ensure_my_sponsor_offers()")" "0"
eq "still 2 open" "$(q "select count(*) from public.sponsor_offers where player_id='$NEW' and status='open'")" "2"
KEY=$(q "select public.sponsor_week_key(now())")
NEXTSUN=$(q "select (date '$KEY' + 7)::text")
# the update period ends at Sunday 00:00 Bratislava: 23:00Z of the Saturday before (winter)
BEFORE_TS=$(q "select (timestamptz '$NEXTSUN 00:00:00+01' - interval '1 minute')")
AFTER_TS=$(q "select (timestamptz '$NEXTSUN 00:00:00+01')")
KEEP=$(q "select string_agg(id::text, ',' order by id) from public.sponsor_offers where player_id='$NEW' and status='open'")
eq "Sat 23:59 local (still the old period): nothing is added" "$(q "select public.sponsor_generate_offers_internal('$NEW', '$BEFORE_TS')")" "0"
eq "Sun 00:00 local (new period): exactly the 1 missing offer is added" "$(q "select public.sponsor_generate_offers_internal('$NEW', '$AFTER_TS')")" "1"
eq "3 open again, never more" "$(q "select count(*) from public.sponsor_offers where player_id='$NEW' and status='open'")" "3"
eq "the 2 unexpired offers were KEPT (not replaced)" "$(q "select count(*) from public.sponsor_offers where player_id='$NEW' and status='open' and id = any(string_to_array('$KEEP', ',')::uuid[])")" "2"
eq "the new offer is a different company than the other open ones" "$(q "select count(distinct company_id) from public.sponsor_offers where player_id='$NEW' and status='open'")" "3"
eq "calling the update again in the same period creates nothing" "$(q "select public.sponsor_generate_offers_internal('$NEW', '$AFTER_TS')")" "0"

echo "== 8. 21-day expiry + refill at the next update"
P21=$(q "insert into auth.users default values returning id" | head -1)
T0=$(q "select created_at from public.sponsor_offers where player_id='$P21' limit 1")
LATER=$(q "select (timestamptz '$T0' + interval '22 days')")
eq "after 22 days all 3 old offers expire and 3 new ones are made" "$(q "select public.sponsor_generate_offers_internal('$P21', '$LATER')")" "3"
eq "old ones are 'expired', 3 new ones 'open'" "$(q "select string_agg(status||':'||c, ',' order by status) from (select status, count(*) c from public.sponsor_offers where player_id='$P21' group by 1) x")" "expired:3,open:3"
eq "new ones live exactly 21 days from THEIR creation" "$(q "select count(*) from public.sponsor_offers where player_id='$P21' and status='open' and expires_at = created_at + interval '21 days' and created_at = '$LATER'")" "3"

echo "== 9. summer time (UTC+2): Sat 23:59 vs Sun 00:00 local"
PS=$(q "insert into auth.users default values returning id" | head -1)
q "update public.sponsor_player_state set last_fill_week_key = date '2026-06-28', last_fill_at = '2026-06-29 12:00+00' where player_id='$PS'; update public.sponsor_offers set status='rejected' where player_id='$PS' and status='open'" >/dev/null
eq "Sat 21:59Z = 23:59 local: still period of 2026-06-28 -> nothing" "$(q "select public.sponsor_generate_offers_internal('$PS', '2026-07-04 21:59:00+00')")" "0"
eq "Sat 22:00Z = Sun 00:00 local: new period -> 3 offers" "$(q "select public.sponsor_generate_offers_internal('$PS', '2026-07-04 22:00:00+00')")" "3"
eq "state key is the Bratislava Sunday 2026-07-05" "$(q "select last_fill_week_key from public.sponsor_player_state where player_id='$PS'")" "2026-07-05"

echo "== 10. all main slots taken: offers are STILL generated, but the contract guard blocks signing"
PF=$(q "insert into auth.users default values returning id" | head -1)
CO=$(q "select company_id from public.sponsor_offers where player_id='$PF' limit 1"); OF=$(q "select id from public.sponsor_offers where player_id='$PF' and company_id='$CO'")
KC=$(q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, weekly_income_cents, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) values ('$PF','$OF','$CO','main',10,1,'finishTour',1,'winStage',1, now()+interval '10 weeks') returning id" | head -1)
q "update public.sponsor_offers set status='accepted' where id='$OF'" >/dev/null
q "update public.sponsor_offers set status='rejected' where player_id='$PF' and status='open'" >/dev/null
eq "rookie has its 1 main slot full, yet the next update fills 3 offers" "$(q "select public.sponsor_generate_offers_internal('$PF', now() + interval '8 days')")" "3"
eq "...and not with the company of the last signed contract (existing rule, unchanged)" "$(q "select count(*) from public.sponsor_offers where player_id='$PF' and status='open' and company_id='$CO'")" "0"
O2=$(q "select id from public.sponsor_offers where player_id='$PF' and status='open' limit 1"); C2=$(q "select company_id from public.sponsor_offers where id='$O2'")
has "signing a 2nd main contract is refused (slot limit)" "$(q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, weekly_income_cents, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) values ('$PF','$O2','$C2','main',10,1,'finishTour',1,'winStage',1, now()+interval '10 weeks')")" "sponsor_slots_full"

echo "== 11. no contract without finances"
O3=$(q "select id from public.sponsor_offers where player_id='$NEW' and status='open' limit 1"); C3=$(q "select company_id from public.sponsor_offers where id='$O3'")
has "a generated offer (no money) cannot become a contract" "$(q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) values ('$NEW','$O3','$C3','main',10,'finishTour',NULL,'winStage',NULL, now()+interval '10 weeks')")" "null value"
has "zero amounts are refused too" "$(q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, weekly_income_cents, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) values ('$NEW','$O3','$C3','main',10,0,'finishTour',0,'winStage',0, now()+interval '10 weeks')")" "violates check"
eq "no function can sign / pay / terminate / generate money" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and (proname like '%accept%sponsor%' or proname like '%sign%sponsor%' or proname like '%terminate%sponsor%' or proname like '%payout%')")" "0"
eq "economy switch still OFF" "$(q "select economy_enabled from public.sponsor_settings")" "f"
eq "still no contract except the one test row, no payout" "$(q "select (select count(*) from public.sponsor_contracts)||':'||(select count(*) from public.sponsor_payouts)")" "1:0"

echo "== 12. Elite: 10 or 20 weeks, harder goals, never promotion"
PE=$(q "insert into auth.users default values returning id" | head -1)
q "update public.profiles set league='elite' where id='$PE'; update public.sponsor_offers set status='rejected' where player_id='$PE'; delete from public.sponsor_player_state where player_id='$PE'" >/dev/null
for k in 1 2 3 4 5 6 7 8; do q "update public.sponsor_offers set status='rejected' where player_id='$PE' and status='open'; delete from public.sponsor_player_state where player_id='$PE'" >/dev/null; q "select public.sponsor_generate_offers_internal('$PE', now() + interval '$k days')" >/dev/null; done
eq "elite offers use 10 and/or 20 weeks only" "$(q "select count(*) from public.sponsor_offers where player_id='$PE' and duration_weeks not in (10,20)")" "0"
eq "over several sets both 10 and 20 weeks appear" "$(q "select count(distinct duration_weeks) from public.sponsor_offers where player_id='$PE'")" "2"
eq "elite never gets promotion or Worlds" "$(q "select count(*) from public.sponsor_offers where player_id='$PE' and (goal1_type in ('promotion','winSeason','participateWorlds','top3Worlds','winWorlds') or goal2_type in ('promotion','winSeason','participateWorlds','top3Worlds','winWorlds'))")" "0"
eq "elite: hard goal is winStage / anyJersey / winTour (ranks 5-7), easy is top50/top10" "$(q "select count(*) from public.sponsor_offers where player_id='$PE' and created_at > now() + interval '12 hours' and not (goal1_type in ('top50','top10') and goal2_type in ('winStage','anyJersey','winTour'))")" "0"

echo "== 13. real results (>= 2 Tours) change the goals; fewer results do not"
mkr() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','T','R','Slovakia','SK',20,'{}','{}','{}','allrounder',80,80,70,70) returning id" | head -1; }
HI=$(q "insert into auth.users default values returning id" | head -1); LO=$(q "insert into auth.users default values returning id" | head -1); ONE=$(q "insert into auth.users default values returning id" | head -1)
RH=$(mkr "$HI"); RL=$(mkr "$LO"); R1=$(mkr "$ONE")
# 17 filler riders, each owned by a fresh user, so each Tour has a field of 20 recorded results and no test subject is touched
for fu in $(seq 1 17); do FU=$(q "insert into auth.users default values returning id" | head -1); mkr "$FU" >/dev/null; done
FILL=($(q "select id from public.riders where id not in ('$RH','$RL','$R1') limit 18"))
for tour in t1 t2; do
  q "insert into public.race_results (season_id, tour_id, rider_id, position, points) values ('S1','$tour','$RH',1,50),('S1','$tour','$RL',19,1),('S1','$tour','$R1',10,10)" >/dev/null
  i=2; for f in "${FILL[@]:0:17}"; do q "insert into public.race_results (season_id, tour_id, rider_id, position, points) values ('S1','$tour','$f',$i,1) on conflict do nothing" >/dev/null; i=$((i+1)); [ $i -eq 10 ] && i=11; [ $i -eq 19 ] && i=20; done
done
eq "field size of a Tour is the number of recorded results" "$(q "select count(*) from public.race_results where tour_id='t1'")" "20"
eq "top finisher in 2 Tours -> form 'high'" "$(q "select public.sponsor_player_form('$HI')")" "high"
eq "last-place finisher in 2 Tours -> form 'low'" "$(q "select public.sponsor_player_form('$LO')")" "low"
eq "mid-field finisher -> 'base'" "$(q "select public.sponsor_player_form('$ONE')")" "base"
eq "a player with NO results -> 'base'" "$(q "select public.sponsor_player_form('$NEW')")" "base"
q "delete from public.race_results where tour_id='t2' and rider_id='$RH'" >/dev/null
eq "results of only ONE Tour are not enough -> 'base'" "$(q "select public.sponsor_player_form('$HI')")" "base"
q "insert into public.race_results (season_id, tour_id, rider_id, position, points) values ('S1','t2','$RH',1,50)" >/dev/null
# goals by tier for a rookie (windows: easy 1-2 / hard 3-4; high shifts +1, low -1)
eq "rookie HIGH form: easy in {finishTour, top50}, hard in {top10, winStage}" "$(q "select count(*) from (select (public.sponsor_pick_goals('rookie',10,'high', g::text)).* from generate_series(1,60) g) x where not (g1 in ('finishTour','top50') and g2 in ('top10','winStage'))")" "0"
eq "rookie LOW form: easy = participateTour, hard in {finishTour, top50}" "$(q "select count(*) from (select (public.sponsor_pick_goals('rookie',10,'low', g::text)).* from generate_series(1,60) g) x where not (g1 = 'participateTour' and g2 in ('finishTour','top50'))")" "0"
eq "pick_goals always returns 2 different goals for every league, tier, length" "$(q "select count(*) from (select l, t, w, (public.sponsor_pick_goals(l, w, t, g::text)).* from unnest(array['rookie','amateur','continental','pro','elite']) l, unnest(array['base','low','high']) t, unnest(array[10,20]) w, generate_series(1,25) g) x where g1 is null or g2 is null or g1 = g2")" "0"
eq "a 5-week (secondary-length) request still returns valid goals" "$(q "select count(*) from (select (public.sponsor_pick_goals('rookie',5,'base', g::text)).* from generate_series(1,20) g) x where g1 is null or g1=g2")" "0"

echo "== 14. weekly update for everybody, pause switch, empty catalogue"
q "update public.sponsor_offers set status='rejected' where status='open' and kind='main'" >/dev/null
FUTURE=$(q "select (now() + interval '60 days')")
eq "sponsor_weekly_update fills every player (3 each)" "$(q "select public.sponsor_weekly_update('$FUTURE') = 3 * (select count(*) from public.profiles)")" "t"
eq "running it again in the same period changes nothing" "$(q "select public.sponsor_weekly_update('$FUTURE')")" "0"
eq "no player ever has more than 3 open main offers" "$(q "select coalesce(max(c),0) from (select count(*) c from public.sponsor_offers where kind='main' and status='open' group by player_id) x")" "3"
q "update public.sponsor_generator_settings set generator_enabled=false" >/dev/null
PP=$(q "insert into auth.users default values returning id" | head -1)
eq "pause switch: a new player gets nothing while the generator is paused" "$(q "select count(*) from public.sponsor_offers where player_id='$PP'")" "0"
q "update public.sponsor_generator_settings set generator_enabled=true; update public.sponsor_companies set active=false where kind='main'" >/dev/null
PQ=$(q "insert into auth.users default values returning id" | head -1)
eq "empty/inactive catalogue: nothing is created and NO state is stored" "$(q "select (select count(*) from public.sponsor_offers where player_id='$PQ')||':'||(select count(*) from public.sponsor_player_state where player_id='$PQ')")" "0:0"
q "update public.sponsor_companies set active=true where kind='main'" >/dev/null
eq "once the catalogue is back, the first visit fills the market" "$(as "$PQ" "select public.ensure_my_sponsor_offers()")" "3"
USERS_BEFORE=$(q "select count(*) from auth.users"); q "alter table public.sponsor_goal_catalog rename to sponsor_goal_catalog_x" >/dev/null
BROKEN=$(q "insert into auth.users default values"); q "alter table public.sponsor_goal_catalog_x rename to sponsor_goal_catalog" >/dev/null
eq "a sign-up must never fail because of the generator (users +1 even when the generator is broken)" "$(q "select count(*) from auth.users")" "$((USERS_BEFORE+1))"
has "...and the failure is reported as a WARNING" "$BROKEN" "WARNING"
eq "...the profile exists too" "$(q "select count(*) from public.profiles")" "$(q "select count(*) from auth.users")"
eq "catalogue of 30 untouched by all of this" "$(q "select count(*) from public.sponsor_companies where kind='main' and catalog_no between 1 and 30")" "30"

echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
