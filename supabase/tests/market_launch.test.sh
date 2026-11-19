#!/usr/bin/env bash
set -u
PGBIN=/usr/lib/postgresql/16/bin; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; DIR=$(mktemp -d); PORT=5533
BASE="$DIR/base.sql"; sed '/^-- >>>>>>>> /,$d' "$ROOT/schema.sql" > "$BASE"
pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  PASS  $1"; }; bad(){ fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
has(){ echo "$2" | grep -qi -- "$3" && ok "$1" || bad "$1" "$(echo "$2" | tr '\n' ' ' | cut -c1-160)"; }
psqlc(){ psql -h "$DIR" -p $PORT -U postgres -d "$1" -qtA -v ON_ERROR_STOP=1 "${@:2}" 2>&1; }
q(){ psqlc t -c "$1"; }
as(){ printf "set role authenticated;\nselect set_config('request.jwt.claim.sub','%s',false);\n%s\n" "$1" "$2" | psqlc t | tail -n +2; }
asanon(){ printf "set role anon;\n%s\n" "$1" | psqlc t; }
trap '"$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1' EXIT
"$PGBIN/initdb" -D "$DIR/data" -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
cat > "$DIR/stub.sql" <<'SQL'
do $x$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $x$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
SQL
psqlc postgres -c "create database t" >/dev/null; psqlc t -f "$DIR/stub.sql" >/dev/null
psqlc t -f "$BASE" >/dev/null 2>&1 || { echo base failed; exit 1; }
for m in $(ls $ROOT/migrations/2026*_*.sql | grep -v "20261114_league_divisions.sql\|20261119_" | sort); do
  psqlc t -f "$m" >/dev/null 2>&1 || { echo "migration $m failed"; psqlc t -f "$m" | tail -3; exit 1; }
done
echo "migrations 2026* applied"
A="$ROOT/migrations/20261119_01_market_hidden_columns_A.sql"; B="$ROOT/migrations/20261119_02_market_hidden_columns_B.sql"; RB="$ROOT/migrations/20261119_03_market_hidden_columns_ROLLBACK.sql"
has "part B refuses to run before part A (nothing changed)" "$(psqlc t -f "$B")" "Part A .* has not been run"
psqlc t -f "$A" >/dev/null || { echo "part A failed"; psqlc t -f "$A" | tail -3; exit 1; }
ok "part A runs"
psqlc t -f "$A" >/dev/null && ok "part A is idempotent (second run, no error)"
mk(){ q "insert into auth.users default values returning id" | head -1; }
PL=$(mk); PREM=$(mk); ADM=$(mk)
q "insert into public.admin_users (user_id) values ('$ADM')" >/dev/null
q "insert into public.premium_entitlements (user_id) values ('$PREM')" >/dev/null
ATT=$(python3 -c "
import json;ks='climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding roughSurface wetHandling experience'.split();print(json.dumps({k:130 for k in ks}))")
COND='{"energy":100,"fatigue":0,"form":75,"fitness":70,"morale":75}'
q "insert into public.market_riders (season_id,tier,status,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,source) values
 ('season-2','free','available','A','Free','Slovakia','SK',18,'$ATT','$COND','climber',55,40,40,40,'admin'),
 ('season-2','free','available','B','Free','Slovakia','SK',18,'$ATT','$COND','climber',75,40,40,40,'admin'),
 ('season-2','free','available','C','Free','Slovakia','SK',18,'$ATT','$COND','climber',95,40,40,40,'admin'),
 ('season-2','premium','available','D','Prem','Slovakia','SK',18,'$ATT','$COND','climber',80,40,40,40,'admin')" >/dev/null
echo "== between A and B (old code still works)"
eq "after A only, a player can still select * (old code safe)" "$(as $PL "select count(*) from public.market_riders where tier='free';")" "3"
psqlc t -f "$B" >/dev/null || { echo "part B failed"; psqlc t -f "$B" | tail -3; exit 1; }
ok "part B runs after A"
psqlc t -f "$B" >/dev/null && ok "part B is idempotent"
echo "== player (authenticated) cannot read hidden data"
has "select * is refused" "$(as $PL "select * from public.market_riders;")" "permission denied"
for c in potential trainability professionalism recovery vitality aptitude_profile energy_efficiency fatigue_resistance recovery_coef fitness_peak condition generator_version source generated_at acquired_by_player_id; do
  has "column $c is refused" "$(as $PL "select $c from public.market_riders;")" "permission denied"
done
has "hidden column in a WHERE is refused too (no side-channel filter)" "$(as $PL "select id from public.market_riders where potential > 70;")" "permission denied"
has "hidden column in ORDER BY is refused" "$(as $PL "select id from public.market_riders order by potential;")" "permission denied"
echo "== player can read exactly the public columns (free tier only; RLS still works)"
eq "free player sees 3 free available riders" "$(as $PL "select count(*) from public.market_riders where status='available' and season_id='season-2';")" "3"
eq "premium rider stays hidden from a free player (RLS policy unchanged)" "$(as $PL "select count(*) from public.market_riders where tier='premium';")" "0"
eq "premium player sees premium rider" "$(as $PREM "select count(*) from public.market_riders where tier='premium';")" "1"
eq "public columns + stars are selectable" "$(as $PL "select first_name||':'||potential_stars||':'||(attributes->>'experience') from public.market_riders where surname='Free' order by potential_stars, id limit 1;")" "A:2:130"
eq "stars: potential 55 -> 2, 75 -> 4, 95 -> 5" "$(as $PL "select string_agg(potential_stars::text, ',' order by potential_stars) from public.market_riders where tier='free';")" "2,4,5"
eq "anon reads nothing" "$(asanon "select count(*) from public.market_riders;" | tail -1 | cut -c1-60)" "ERROR:  permission denied for table market_riders"
echo "== stars equal the TypeScript formula for every potential 1..100 (bands)"
SQLSTARS=$(q "select string_agg(public.potential_to_stars(p)::text, '' order by p) from generate_series(1,100) p")
TSSTARS=$(node -e "const st=[40,60,75,88];let s='';for(let p=1;p<=100;p++){s+=1+st.filter(x=>p>=x).length}console.log(s)")
eq "SQL potential_to_stars == potentialStarsOf for p = 1..100" "$SQLSTARS" "$TSSTARS"
eq "generated column equals the function" "$(q "select count(*) from public.market_riders where potential_stars <> public.potential_to_stars(potential)")" "0"
RIDPL=$(q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$(q "insert into auth.users default values returning id" | head -1)','S','R','Slovakia','SK',20,'$ATT','$COND','$COND','climber',45,50,50,50) returning player_id" | head -1)
eq "my_rider_estimates uses the same bands (potential 45 -> 2 stars)" "$(as $RIDPL "select potential_stars from public.my_rider_estimates();")" "2"
echo "== admin"
eq "admin_market_riders as admin returns all 4 rows incl. hidden columns" "$(as $ADM "select count(*) from public.admin_market_riders('season-2') where potential is not null;")" "4"
has "admin_market_riders refuses a normal player" "$(as $PL "select * from public.admin_market_riders('season-2');")" "not_admin"
has "admin_market_riders refuses anon" "$(asanon "select * from public.admin_market_riders('season-2');")" "permission denied"
eq "admin can still insert (generation)" "$(as $ADM "insert into public.market_riders (season_id,tier,status,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,source) values ('season-2','free','available','E','New','Slovakia','SK',18,'$ATT','$COND','climber',60,1,1,1,'admin'); select 'ok';" | tail -1)" "ok"
eq "admin can reset available riders (DELETE with WHERE on granted columns, as the app does)" "$(as $ADM "delete from public.market_riders where season_id='season-2' and status='available' and acquired_rider_id is null and first_name='E'; select 'ok';" | tail -1)" "ok"
has "a normal player still cannot insert" "$(as $PL "insert into public.market_riders (season_id,tier,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,source) values ('season-2','free','X','X','X','XX',18,'$ATT','$COND','climber',60,1,1,1,'admin');")" "row-level security\|permission denied"
echo "== definer functions keep working (purchase reservation reads hidden columns internally)"
RID=$(q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$PL','Old','Rider','Slovakia','SK',20,'$ATT','$COND','$COND','climber',70,50,50,50) returning id" | head -1)
q "update public.rider_swap_settings set enabled = true" >/dev/null
MID=$(q "select id from public.market_riders where first_name='B'")
has "reserve_market_rider (SECURITY DEFINER) still works for a player" "$(as $PL "select status from public.reserve_market_rider('$MID');")" "pending"
echo "== launch market seed (100 riders)"
SEED="$ROOT/seeds/20261119_launch_market_100.sql"
BEFORE=$(q "select count(*) from public.market_riders")
OUT=$(psqlc t -f "$SEED"); has "seed runs and reports OK" "$OUT" "launch market OK: 100 riders"
eq "exactly 100 new riders added" "$(q "select count(*) from public.market_riders")" "$((BEFORE+100))"
eq "database OVR (F4) of every seeded rider is 69..75" "$(q "select min(public.rider_overall_rating(attributes))||'-'||max(public.rider_overall_rating(attributes)) from public.market_riders where generator_version='initial-market-1.0'" | awk -F- '{print ($1>=69 && $2<=75) ? "ok" : "bad"}')" "ok"
eq "all seeded riders are free + available, age 17..20, Skúsenosti 1..20" "$(q "select count(*) from public.market_riders where generator_version='initial-market-1.0' and tier='free' and status='available' and age between 17 and 20 and (attributes->>'experience')::int between 1 and 20")" "100"
eq "seeded hidden traits are on the 1..100 scale" "$(q "select count(*) from public.market_riders where generator_version='initial-market-1.0' and potential between 1 and 100 and trainability between 1 and 100 and professionalism between 1 and 100 and recovery between 1 and 100")" "100"
eq "state coefficients filled by the trigger" "$(q "select count(*) from public.market_riders where generator_version='initial-market-1.0' and energy_efficiency is not null and fitness_peak is not null")" "100"
eq "seeded potential is on 1..100 and mostly low/medium (probabilistic bands: >= 70 % of the 100 below 60)" "$(q "select (count(*) filter (where potential < 60) >= 70)::text from public.market_riders where generator_version='initial-market-1.0'")" "true"
eq "a player sees the new riders in the current season" "$(as $PL "select count(*) from public.market_riders where season_id = public.season_id_at(now()) and tier='free' and (attributes->>'experience')::int <= 20 and age <= 20 and first_name not in ('A','B','C')")" "100"
OUT2=$(psqlc t -f "$SEED"); has "second run is accepted (idempotent)" "$OUT2" "newly added: 0"
eq "second run adds nothing" "$(q "select count(*) from public.market_riders")" "$((BEFORE+100))"
eq "existing test riders A/B/C/D untouched" "$(q "select count(*) from public.market_riders where surname in ('Free','Prem')")" "4"
echo "== rollback file"
psqlc t -f "$RB" >/dev/null; has "rollback restores select of hidden columns for a player" "$(as $PL "select count(potential) from public.market_riders where tier='free';")" "^[0-9]"
psqlc t -f "$B" >/dev/null; has "part B closes it again" "$(as $PL "select potential from public.market_riders;")" "permission denied"
echo "== permanent market: riders of earlier seasons stay visible and purchasable"
q "insert into public.market_riders (season_id,tier,status,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,source) values
 ('season-1','free','available','Old','SeasonOne','Slovakia','SK',19,'$ATT','$COND','climber',45,40,40,40,'admin'),
 ('season-1','premium','available','Old','PremiumOne','Slovakia','SK',19,'$ATT','$COND','climber',70,40,40,40,'admin'),
 ('season-9','free','available','Future','SeasonNine','Slovakia','SK',19,'$ATT','$COND','climber',45,40,40,40,'admin')" >/dev/null
eq "a free player sees free riders of ANY season (season-1 and season-9 too)" "$(as $PL "select count(*) from public.market_riders where surname in ('SeasonOne','SeasonNine') and status='available';")" "2"
eq "premium rider of an earlier season stays hidden from a free player (tier rule unchanged)" "$(as $PL "select count(*) from public.market_riders where surname='PremiumOne';")" "0"
eq "premium player sees the earlier-season premium rider" "$(as $PREM "select count(*) from public.market_riders where surname='PremiumOne';")" "1"
eq "season_id is kept as history on the row" "$(as $PL "select season_id from public.market_riders where surname='SeasonOne';")" "season-1"
PL2=$(mk); q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$PL2','Moj','Druhy','Slovakia','SK',20,'$ATT','$COND','$COND','climber',70,50,50,50)" >/dev/null
OLDID=$(q "select id from public.market_riders where surname='SeasonOne'")
has "a rider generated in an earlier season can be reserved (purchase flow is season-independent)" "$(as $PL2 "select status from public.reserve_market_rider('$OLDID');")" "pending"
eq "...and then he is reserved, not deleted or relabelled" "$(q "select status||':'||season_id from public.market_riders where id='$OLDID'")" "reserved:season-1"
eq "admin_market_riders() without a season returns the WHOLE market" "$(as $ADM "select count(distinct season_id) >= 3 from public.admin_market_riders();")" "t"
eq "admin_market_riders('season-1') still filters one season" "$(as $ADM "select count(*) from public.admin_market_riders('season-1') where season_id <> 'season-1';")" "0"
has "a normal player still cannot call it without a season" "$(as $PL "select * from public.admin_market_riders();")" "not_admin"
eq "a season-9 row keeps its season_id (history is never rewritten by the market)" "$(q "select count(*) from public.market_riders where surname='SeasonNine' and season_id='season-9'")" "1"
echo; echo "$pass passed, $fail failed"
