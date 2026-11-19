#!/usr/bin/env bash
# Tests the three scripts in supabase/diagnostics/market_launch (check, backup+delete of the 45 old starter-v1 riders, restore). REAL local Postgres, never a real database.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/diagnostics/market_launch"; DIR=$(mktemp -d); PORT=5544
BASE="$DIR/base.sql"; sed '/^-- >>>>>>>> /,$d' "$ROOT/schema.sql" > "$BASE"
pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  PASS  $1"; }; bad(){ fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
has(){ echo "$2" | grep -qi -- "$3" && ok "$1" || bad "$1" "$(echo "$2" | tr '\n' ' ' | cut -c1-200)"; }
psqlc(){ psql -h "$DIR" -p $PORT -U postgres -d t -qtA -v ON_ERROR_STOP=1 "$@" 2>&1; }
q(){ psqlc -c "$1"; }
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
psql -h "$DIR" -p $PORT -U postgres -d postgres -qtA -c "create database t" >/dev/null; psqlc -f "$DIR/stub.sql" >/dev/null
psqlc -f "$BASE" >/dev/null 2>&1 || { echo base failed; exit 1; }
for m in $(ls $ROOT/migrations/2026*_*.sql | grep -v "20261114_league_divisions.sql\|20261119_" | sort); do psqlc -f "$m" >/dev/null 2>&1 || { echo "migration $m failed"; exit 1; }; done
psqlc -f $ROOT/migrations/20261119_01_market_hidden_columns_A.sql >/dev/null && psqlc -f $ROOT/migrations/20261119_02_market_hidden_columns_B.sql >/dev/null || { echo draft failed; exit 1; }
echo "database ready (all migrations + hidden-columns draft)"
ATT=$(python3 -c "
import json;ks='climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding roughSurface wetHandling experience'.split();print(json.dumps({k:130 for k in ks}))")
ATTN=$(python3 -c "
import json;ks='climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding roughSurface wetHandling'.split();d={k:75 for k in ks};d['experience']=10;print(json.dumps(d))")
COND='{"energy":100,"fatigue":0,"form":75,"fitness":70,"morale":75}'
ins(){ # version tier status n
 q "insert into public.market_riders (season_id,tier,status,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,generator_version,source) select 'season-2','$2','$3','$5'||g,'X','Slovakia','SK',19,'$6','$COND','climber',70,60,60,60,'$1','admin' from generate_series(1,$4) g" >/dev/null; }
ins starter-v1 free available 30 old "$ATT"; ins starter-v1 premium available 15 oldp "$ATT"     # 45 old test riders
ins starter-v1 free reserved 2 res "$ATT"; ins starter-v1 free acquired 1 acq "$ATT"               # old but NOT deletable (status)
ins initial-market-1.0 free available 100 new "$ATTN"                                                 # the new 100 must never be touched
PL=$(q "insert into auth.users default values returning id" | head -1)
RID=$(q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$PL','Moj','Jazdec','Slovakia','SK',20,'$ATT','$COND','$COND','climber',70,50,50,50) returning id" | head -1)
q "update public.market_riders set acquired_rider_id='$RID', acquired_by_player_id='$PL', acquired_at=now() where first_name='acq1'" >/dev/null
q "update public.rider_swap_settings set enabled = true" >/dev/null
RES=$(q "select id from public.market_riders where first_name='res1'")
q "insert into public.rider_swaps (manager_id, old_rider_id, market_rider_id, takeover_at, takeover_season_id, takeover_week) values ('$PL','$RID','$RES', now() + interval '3 days','season-2',5)" >/dev/null
echo "== 01 kontrola"
OUT01=$(psqlc -f $OUT/01_stare_trhove_kontrola.sql); has "01 runs without error" "$OUT01" "kontrolny\|jazdec\|oldp"
CNT=$(q "with cand as (select m.id from public.market_riders m where m.generator_version='starter-v1' and m.status='available' and m.acquired_rider_id is null and m.acquired_by_player_id is null and m.acquired_at is null and m.source in ('admin','week6') and not exists (select 1 from public.rider_swaps s where s.market_rider_id=m.id)) select count(*) from cand")
SUM=$(q "with cand as (select m.id from public.market_riders m where m.generator_version='starter-v1' and m.status='available' and m.acquired_rider_id is null and m.acquired_by_player_id is null and m.acquired_at is null and m.source in ('admin','week6') and not exists (select 1 from public.rider_swaps s where s.market_rider_id=m.id)) select md5(string_agg(id::text, ',' order by id)) from cand")
eq "exactly 45 candidates" "$CNT" "45"
has "obstacles listed (reserved + acquired starter-v1 rows)" "$(echo "$OUT01" | grep -c 'reserved\|acquired')" "[3-9]"
echo "== 02 aborts on wrong count / wrong checksum, deletes nothing"
sed "s/f8830b1336a1a3a025dccac1619b5d13/SEM_VLOZ_KONTROLNY_SUCET_Z_KROKU_01/" $OUT/02_stare_trhove_zaloha_a_zmazanie.sql > $DIR/02tmpl.sql   # the repo copy has the owner checksum prefilled; the test swaps it
sed "s/SEM_VLOZ_KONTROLNY_SUCET_Z_KROKU_01/deadbeef/" $DIR/02tmpl.sql > $DIR/wrongsum.sql
has "wrong checksum -> aborted" "$(psqlc -f $DIR/wrongsum.sql)" "kontrolný súčet nesedí"
eq "...nothing deleted (starter-v1 still 48)" "$(q "select count(*) from public.market_riders where generator_version='starter-v1'")" "48"
eq "...backup table empty after the abort" "$(q "select count(*) from public.market_riders_backup_20261119")" "0"
q "update public.market_riders set generator_version='starter-v1' where first_name='new1'" >/dev/null   # a 46th candidate appears
sed "s/SEM_VLOZ_KONTROLNY_SUCET_Z_KROKU_01/$SUM/" $DIR/02tmpl.sql > $DIR/real.sql
has "a 46th candidate appeared -> aborted (count)" "$(psqlc -f $DIR/real.sql)" "nájdených 46"
eq "...still nothing deleted" "$(q "select count(*) from public.market_riders where generator_version='starter-v1'")" "49"
q "update public.market_riders set generator_version='initial-market-1.0' where first_name='new1'" >/dev/null
echo "== 02 real run"
has "02 succeeds" "$(psqlc -f $DIR/real.sql)" "HOTOVO: zálohovaných 45 a zmazaných 45"
eq "the 45 are gone" "$(q "select count(*) from public.market_riders where generator_version='starter-v1' and status='available'")" "0"
eq "backup holds exactly the 45" "$(q "select count(*) from public.market_riders_backup_20261119")" "45"
eq "reserved + acquired starter-v1 rows untouched (3)" "$(q "select count(*) from public.market_riders where generator_version='starter-v1'")" "3"
eq "the new 100 untouched" "$(q "select count(*) from public.market_riders where generator_version='initial-market-1.0'")" "100"
eq "the player's rider and his link untouched" "$(q "select count(*) from public.riders where id='$RID' and player_id='$PL'")" "1"
eq "pending swap untouched" "$(q "select count(*) from public.rider_swaps where status='pending'")" "1"
has "backup is not readable by players" "$(printf "set role authenticated;\nselect count(*) from public.market_riders_backup_20261119;\n" | psqlc)" "permission denied for table market_riders_backup"
echo "== rerun is harmless"
has "second run aborts (found 0), changes nothing" "$(psqlc -f $DIR/real.sql)" "nájdených 0"
eq "...backup still 45" "$(q "select count(*) from public.market_riders_backup_20261119")" "45"
echo "== restore"
psqlc -f $OUT/03_obnovenie_zo_zalohy_AK_TREBA.sql >/dev/null
eq "restore brings the 45 back" "$(q "select count(*) from public.market_riders where generator_version='starter-v1' and status='available'")" "45"
eq "restored rows equal the originals (checksum of ids)" "$(q "select md5(string_agg(id::text, ',' order by id)) from public.market_riders where generator_version='starter-v1' and status='available'")" "$SUM"
echo; echo "$pass passed, $fail failed"
