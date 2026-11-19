#!/usr/bin/env bash
# Read-only pre-deployment check (diagnostics/market_launch/00_predeploy_kontrola_LEN_CITANIE.sql): reports CHYBA on an old DB, no CHYBA on a production-like DB
# (migrations 20261114..20261117 + switches on), shows the A/B/S1+O5 state, never writes, runs inside a READ ONLY transaction. REAL local Postgres.
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
CHK="$ROOT/diagnostics/market_launch/00_predeploy_kontrola_LEN_CITANIE.sql"
run() { P -qAt -F'|' -f "$CHK" 2>&1; }
sed '/^-- >>>>>>>> /,$d' "$ROOT/schema.sql" > "$DIR/base.sql"; P -qf "$DIR/base.sql" >/dev/null 2>&1
OLD=$(run); eq "old database: the query itself does not fail" "$(echo "$OLD" | grep -c 'ERROR')" "0"
[ "$(echo "$OLD" | grep -c '|CHYBA|')" -ge 10 ] && ok "old database: many CHYBA rows (OVR F4 / V2 functions missing)" || bad "old db CHYBA" "$(echo "$OLD" | grep -c '|CHYBA|')"
for m in $(ls "$ROOT"/migrations/2026111[4-7]_*.sql | grep -v "20261114_league_divisions.sql"); do P -qf "$m" >/dev/null 2>&1 || echo "migration failed: $m"; done
P -qc "update public.development_model_settings set enabled=true; update public.rider_state_settings set enabled=true" >/dev/null
PROD=$(run)
eq "production-like database: no CHYBA" "$(echo "$PROD" | grep -c '|CHYBA|')" "0"
eq "OVR F4 probe gives 102" "$(echo "$PROD" | grep 'skúšobný jazdec' | cut -d'|' -f2)" "OK"
eq "reports the old development model (S1+O5 not deployed yet)" "$(echo "$PROD" | grep -c 'pôvodný model (strop 1,25)')" "1"
eq "reports migration B not run (hidden columns readable)" "$(echo "$PROD" | grep -c 'B ešte NIE JE spustená')" "1"
# a wrong F4 (mutation): the check must notice
P -qc "create or replace function public.rider_overall_rating(p_attrs jsonb) returns int language sql immutable as \$\$ select 1 \$\$" >/dev/null
eq "a wrong OVR formula is reported as CHYBA" "$(run | grep 'skúšobný jazdec' | cut -d'|' -f2)" "CHYBA"
psqlf() { :; }; P -qf "$ROOT/migrations/20261117_02_ovr_f4.sql" >/dev/null 2>&1
eq "OVR F4 restored" "$(run | grep 'skúšobný jazdec' | cut -d'|' -f2)" "OK"
for m in 20261119_01_market_hidden_columns_A 20261119_02_market_hidden_columns_B 20261119_04_dev_cap_s1_youth_floor_o5; do P -qf "$ROOT/migrations/$m.sql" >/dev/null 2>&1; done
AFTER=$(run)
eq "after A + B + S1+O5 the check reports them" "$(echo "$AFTER" | grep -c 'A je spustená')|$(echo "$AFTER" | grep -c 'B JE spustená')|$(echo "$AFTER" | grep -c 'S1+O5 JE nasadené')" "1|1|1"
eq "still no CHYBA" "$(echo "$AFTER" | grep -c '|CHYBA|')" "0"
P -qAt -c "select sum(n_tup_ins+n_tup_upd+n_tup_del) from pg_stat_user_tables" > "$DIR/w1"; sleep 1.5; run >/dev/null; sleep 1.5
P -qAt -c "select sum(n_tup_ins+n_tup_upd+n_tup_del) from pg_stat_user_tables" > "$DIR/w2"; eq "the check writes nothing (no inserts/updates/deletes)" "$(cat "$DIR/w2")" "$(cat "$DIR/w1")"
{ echo "begin read only;"; cat "$CHK"; echo; echo "rollback;"; } > "$DIR/ro.sql"
eq "runs inside a READ ONLY transaction without error" "$(P -qA -f "$DIR/ro.sql" 2>&1 | grep -c ERROR)" "0"
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
