#!/usr/bin/env bash
# Phased read-only check (diagnostics/market_launch/00_predeploy_kontrola_LEN_CITANIE.sql). For EVERY deployment phase it must say SPLNENÉ / ČAKÁ / CHYBA correctly and
# give the right "ĎALŠÍ KROK". Never writes; runs in a READ ONLY transaction. Also guards that supabase/migrations holds no rollback file. REAL local Postgres.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; DIR=$(mktemp -d); PORT=${PGTEST_PORT:-5551}
pass=0; fail=0; ok(){ pass=$((pass+1)); echo "  PASS  $1"; }; bad(){ fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
trap '"$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1' EXIT
"$PGBIN/initdb" -D "$DIR/data" -A trust >/dev/null; "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
P() { psql -h "$DIR" -p $PORT -U postgres -d t -v ON_ERROR_STOP=1 "$@"; }
psql -h "$DIR" -p $PORT -U postgres -d postgres -qc "create database t"
cat > "$DIR/stub.sql" <<'SQL'
do $x$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $x$;
create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL
P -qf "$DIR/stub.sql" >/dev/null
CHK="$ROOT/diagnostics/market_launch/00_predeploy_kontrola_LEN_CITANIE.sql"; MR="$ROOT/diagnostics/market_launch/manual_rollbacks"
run() { P -qAt -F'|' -f "$CHK" 2>&1; }
verdict() { run | grep "VERDIKT FÁZY: FÁZA $1" | cut -d'|' -f3; }          # SPLNENÉ / ČAKÁ / CHYBA
V() { echo "$(verdict 0)/$(verdict 1)/$(verdict 2)/$(verdict 3)/$(verdict 4)/$(verdict 5)"; }
NEXT() { run | grep '|ĎALŠÍ KROK|' | cut -d'|' -f4; }
has() { echo "$2" | grep -q -- "$3" && ok "$1" || bad "$1" "$(echo "$2" | cut -c1-160)"; }

echo "== no rollback inside supabase/migrations"
eq "migrations folder contains no rollback/undo/revert file" "$(ls "$ROOT/migrations" | grep -ci 'rollback\|undo\|revert')" "0"
eq "every manual rollback lives in manual_rollbacks/ (3 SQL scripts, the S1+O5 TypeScript patch and its 4 prepared files)" "$(ls "$MR" | tr "\n" " ")" "ROLLBACK_B_ODOMKNE_SKRYTE_HODNOTY.sql ROLLBACK_S1O5_rozvoj.sql S1O5_navrat_subory S1O5_typescript_navrat.patch SAFE_B_nudzove_zatvorenie_trhu.sql "

echo "== STAV 0: stará databáza bez V2/F4 -> fáza 0 CHYBA, nič ďalej"
sed '/^-- >>>>>>>> /,$d' "$ROOT/schema.sql" > "$DIR/base.sql"; P -qf "$DIR/base.sql" >/dev/null 2>&1
OLD=$(run); eq "the query itself does not fail on an old database" "$(echo "$OLD" | grep -c ERROR)" "0"
eq "phase 0 = CHYBA" "$(verdict 0)" "CHYBA"; has "next step says STOP" "$(NEXT)" "STOP"

echo "== STAV 1: produkcia PRED nasadením (V2+F4 hotové, A/B/S1+O5/seed ešte nie, 45 starých na trhu)"
for m in $(ls "$ROOT"/migrations/2026111[4-7]_*.sql); do P -qf "$m" >/dev/null 2>&1 || echo "migration failed: $m"; done
P -qc "update public.development_model_settings set enabled=true; update public.rider_state_settings set enabled=true" >/dev/null
ATT=$(python3 -c "
import json
k='climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding wetHandling roughSurface experience'.split()
print(json.dumps({x:130 for x in k}))")
COND='{"energy":100,"fatigue":0,"form":50,"fitness":60,"morale":70}'
P -qc "insert into public.market_riders (season_id,tier,status,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,source,generator_version)
  select 'season-2','free','available','Old','R'||g,'Slovakia','SK',25,'$ATT','$COND','climber',60,60,60,60,'admin','starter-v1' from generate_series(1,45) g" >/dev/null
SUM=$(P -qAt -c "select md5(string_agg(id::text, ',' order by id)) from public.market_riders where generator_version='starter-v1'")
eq "the check and script 02 carry the SAME owner checksum" "$(grep -c f8830b1336a1a3a025dccac1619b5d13 "$CHK")|$(grep -c f8830b1336a1a3a025dccac1619b5d13 "$ROOT/diagnostics/market_launch/02_stare_trhove_zaloha_a_zmazanie.sql")" "1|1"
sed "s/f8830b1336a1a3a025dccac1619b5d13/$SUM/" "$CHK" > "$DIR/chk.sql"; CHK="$DIR/chk.sql"   # the sandbox has other ids than production: swap the checksum like the old-riders test does
eq "before deployment: 0 ok, A/B/S1+O5/seed/cleanup wait (no CHYBA)" "$(V)" "SPLNENÉ/ČAKÁ/ČAKÁ/ČAKÁ/ČAKÁ/ČAKÁ"
has "next step = KROK 1 (migration A)" "$(NEXT)" "KROKOM 1"
eq "overall no CHYBA row at all (missing A/B/S1+O5 is NOT an error before their step)" "$(run | grep -c '|CHYBA|')" "0"

echo "== STAV 2: po migrácii A"
P -qf "$ROOT/migrations/20261119_01_market_hidden_columns_A.sql" >/dev/null 2>&1
eq "A done, rest waits" "$(V)" "SPLNENÉ/SPLNENÉ/ČAKÁ/ČAKÁ/ČAKÁ/ČAKÁ"; has "next step = KROK 2 then 3 (code, green build, then B)" "$(NEXT)" "KROK 2"

echo "== STAV 3: po migrácii B (kód nasadený)"
P -qf "$ROOT/migrations/20261119_02_market_hidden_columns_B.sql" >/dev/null 2>&1
eq "B done" "$(V)" "SPLNENÉ/SPLNENÉ/SPLNENÉ/ČAKÁ/ČAKÁ/ČAKÁ"; has "next step = KROK 4 (S1+O5)" "$(NEXT)" "KROK 4"

echo "== STAV 4: po S1+O5"
P -qf "$ROOT/migrations/20261119_04_dev_cap_s1_youth_floor_o5.sql" >/dev/null 2>&1
eq "S1+O5 done" "$(V)" "SPLNENÉ/SPLNENÉ/SPLNENÉ/SPLNENÉ/ČAKÁ/ČAKÁ"; has "next step = KROK 5 (seed)" "$(NEXT)" "KROK 5"

echo "== STAV 5: po vložení 100 jazdcov"
P -qf "$ROOT/seeds/20261119_launch_market_100.sql" >/dev/null 2>&1
eq "seed done, 45 old still waiting" "$(V)" "SPLNENÉ/SPLNENÉ/SPLNENÉ/SPLNENÉ/SPLNENÉ/ČAKÁ"; has "next step = KROK 6/7 (old riders)" "$(NEXT)" "KROK 6"
eq "no CHYBA anywhere in the normal flow" "$(run | grep -c '|CHYBA|')" "0"

echo "== STAV 6: po čistení 45 starých (záloha existuje a je presne tých 45)"
P -qc "create table public.market_riders_backup_20261119 as select * from public.market_riders where generator_version='starter-v1'" >/dev/null
P -qc "delete from public.market_riders where generator_version='starter-v1'" >/dev/null
eq "everything done" "$(V)" "SPLNENÉ/SPLNENÉ/SPLNENÉ/SPLNENÉ/SPLNENÉ/SPLNENÉ"; has "next step says all done" "$(NEXT)" "Všetko je hotové"
has "the backup row says: exactly 45 correct riders" "$(run | grep 'záloha starých jazdcov')" "presne 45 správnych jazdcov (kontrolný súčet sedí)"

echo "== F5 chybové prípady: jazdci zmizli bez platnej zálohy = CHYBA"
P -qc "alter table public.market_riders_backup_20261119 rename to bak_hidden" >/dev/null
eq "old riders gone and NO backup table -> phase 5 CHYBA" "$(verdict 5)" "CHYBA"; has "reason names the missing backup" "$(run | grep 'záloha starých jazdcov')" "ZÁLOHA NEEXISTUJE"; has "STOP" "$(NEXT)" "STOP"
P -qc "alter table public.bak_hidden rename to market_riders_backup_20261119" >/dev/null
eq "backup back -> SPLNENÉ again" "$(verdict 5)" "SPLNENÉ"
P -qc "delete from public.market_riders_backup_20261119 where id = (select id from public.market_riders_backup_20261119 limit 1)" >/dev/null
eq "backup with 44 rows -> CHYBA" "$(verdict 5)" "CHYBA"; has "reason says 44" "$(run | grep 'záloha starých jazdcov')" "44 riadkov"
P -qc "truncate public.market_riders_backup_20261119" >/dev/null
eq "empty backup table -> CHYBA" "$(verdict 5)" "CHYBA"
P -qc "insert into public.market_riders_backup_20261119 select * from public.market_riders_backup_20261119 where false" >/dev/null
P -qc "insert into public.market_riders (id,season_id,tier,status,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,source,generator_version)
  select gen_random_uuid(),'season-2','free','available','Fake','B'||g,'Slovakia','SK',25,'$ATT','$COND','climber',60,60,60,60,'admin','starter-v1' from generate_series(1,45) g" >/dev/null
P -qc "insert into public.market_riders_backup_20261119 select * from public.market_riders where generator_version='starter-v1'" >/dev/null
P -qc "delete from public.market_riders where generator_version='starter-v1'" >/dev/null
eq "backup holds 45 riders but NOT the ones from the step-01 list (checksum differs) -> CHYBA" "$(verdict 5)" "CHYBA"; has "reason: checksum" "$(run | grep 'záloha starých jazdcov')" "kontrolný súčet nesedí"
P -qc "truncate public.market_riders_backup_20261119; insert into public.market_riders_backup_20261119 select * from public.market_riders where false" >/dev/null
# restore the correct backup from the original list: rebuild by regenerating? simpler - re-create the 45 originals with their ORIGINAL ids is impossible, so re-run the whole scenario below
echo "== F5: po opravenej zálohe (nový čistý scenár na tej istej DB)"
P -qc "drop table public.market_riders_backup_20261119" >/dev/null
P -qc "insert into public.market_riders (season_id,tier,status,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,source,generator_version)
  select 'season-2','free','available','Old','R'||g,'Slovakia','SK',25,'$ATT','$COND','climber',60,60,60,60,'admin','starter-v1' from generate_series(1,45) g" >/dev/null
SUM=$(P -qAt -c "select md5(string_agg(id::text, ',' order by id)) from public.market_riders where generator_version='starter-v1'")
sed "s/f8830b1336a1a3a025dccac1619b5d13/$SUM/" "$ROOT/diagnostics/market_launch/00_predeploy_kontrola_LEN_CITANIE.sql" > "$DIR/chk.sql"
eq "45 old riders present, no backup yet -> phase 5 ČAKÁ (not an error)" "$(verdict 5)" "ČAKÁ"
P -qc "create table public.market_riders_backup_20261119 as select * from public.market_riders where generator_version='starter-v1'" >/dev/null
eq "backup already exists but the old riders are still on the market -> CHYBA (unfinished cleanup)" "$(verdict 5)" "CHYBA"
P -qc "delete from public.market_riders where generator_version='starter-v1' and id in (select id from public.market_riders_backup_20261119)" >/dev/null
eq "correct backup of exactly the 45 + riders gone -> SPLNENÉ" "$(verdict 5)" "SPLNENÉ"
P -qc "update public.market_riders_backup_20261119 set generator_version='initial-market-1.0' where id = (select id from public.market_riders_backup_20261119 limit 1)" >/dev/null
eq "one backed-up rider is not a starter-v1 rider -> CHYBA" "$(verdict 5)" "CHYBA"; has "reason names it" "$(run | grep 'záloha starých jazdcov')" "nie sú zo starého generátora"
P -qc "update public.market_riders_backup_20261119 set generator_version='starter-v1'" >/dev/null
P -qc "insert into public.market_riders (id,season_id,tier,status,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,source,generator_version) select id,season_id,tier,status,first_name,surname,country_name,country_iso2,age,attributes,condition,inferred_archetype,potential,trainability,professionalism,recovery,source,'x' from public.market_riders_backup_20261119 limit 1" >/dev/null
eq "a backed-up rider is back on the market -> CHYBA (guard)" "$(verdict 5)" "CHYBA"
P -qc "delete from public.market_riders where generator_version='x'" >/dev/null
eq "restored -> SPLNENÉ" "$(verdict 5)" "SPLNENÉ"

echo "== Chybové stavy sa musia poznať (mutácie)"
P -qc "grant select (potential) on public.market_riders to authenticated" >/dev/null
eq "B partly undone (one hidden column readable) -> phase 2 CHYBA, STOP" "$(verdict 2)" "CHYBA"; has "STOP" "$(NEXT)" "STOP"
P -qc "grant select on public.market_riders to authenticated" >/dev/null
eq "hidden columns reopened while the 100 riders are on the market -> CHYBA (also the order guard)" "$(verdict 2)/$(verdict 4)" "ČAKÁ/CHYBA"
P -qf "$ROOT/migrations/20261119_02_market_hidden_columns_B.sql" >/dev/null 2>&1
eq "B run again -> clean" "$(verdict 2)/$(verdict 4)" "SPLNENÉ/SPLNENÉ"
P -qc "revoke select on public.market_riders from public, anon, authenticated" >/dev/null
has "emergency closure (SAFE script state): public columns closed too -> flagged, STOP" "$(run | grep 'verejné stĺpce trhu musia ostať')" "CHYBA"
P -qf "$ROOT/migrations/20261119_02_market_hidden_columns_B.sql" >/dev/null 2>&1
P -qc "update public.market_riders set generator_version='x' where generator_version='initial-market-1.0' and id in (select id from public.market_riders where generator_version='initial-market-1.0' limit 3)" >/dev/null
eq "seed with 97 rows -> phase 4 CHYBA" "$(verdict 4)" "CHYBA"
P -qc "update public.market_riders set generator_version='initial-market-1.0' where generator_version='x'" >/dev/null
P -qc "update public.market_riders set age = 30 where id = (select id from public.market_riders where generator_version='initial-market-1.0' limit 1)" >/dev/null
eq "a seeded rider outside the rules (age 30) -> phase 4 CHYBA" "$(verdict 4)" "CHYBA"
P -qc "create or replace function public.rider_overall_rating(p_attrs jsonb) returns int language sql immutable as \$\$ select 1 \$\$" >/dev/null
eq "wrong OVR formula -> phase 0 CHYBA" "$(verdict 0)" "CHYBA"
P -qf "$ROOT/migrations/20261117_02_ovr_f4.sql" >/dev/null 2>&1
P -qc "update public.development_model_settings set enabled=false" >/dev/null
eq "V2 switch off -> phase 0 CHYBA" "$(verdict 0)" "CHYBA"
P -qc "update public.development_model_settings set enabled=true" >/dev/null

echo "== iba čítanie"
P -qAt -c "select sum(n_tup_ins+n_tup_upd+n_tup_del) from pg_stat_user_tables" > "$DIR/w1"; sleep 1.5; run >/dev/null; sleep 1.5
P -qAt -c "select sum(n_tup_ins+n_tup_upd+n_tup_del) from pg_stat_user_tables" > "$DIR/w2"; eq "the check writes nothing" "$(cat "$DIR/w2")" "$(cat "$DIR/w1")"
{ echo "begin read only;"; cat "$CHK"; echo; echo "rollback;"; } > "$DIR/ro.sql"
eq "runs inside a READ ONLY transaction without error" "$(P -qA -f "$DIR/ro.sql" 2>&1 | grep -c ERROR)" "0"
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
