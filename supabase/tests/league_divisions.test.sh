#!/usr/bin/env bash
# Leagues & sub-leagues V1 — SQL tests against a REAL local Postgres (real
# concurrency, real constraints/triggers). Supabase's auth schema is stubbed.
#
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/league_divisions.test.sh
#
# Starts a throwaway cluster in a temp dir (needs a non-root OS user, e.g. run
# as `postgres`), applies supabase/migrations/20261114_league_divisions.sql
# and checks the rules. Never touches any real database.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
DIR=${PGTEST_DIR:-$(mktemp -d)}
PORT=${PGTEST_PORT:-5498}
MIG="$(cd "$(dirname "$0")/.." && pwd)/migrations/20261114_league_divisions.sql"
PSQL="psql -h $DIR -p $PORT -U postgres -d t -qtA -v ON_ERROR_STOP=1"
pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  PASS  $1"; }
bad()  { fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq()   { [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
q()    { $PSQL -c "$1" 2>&1; }
as()   { # as <uuid> <sql> — run as an authenticated player
  $PSQL -c "set role authenticated; select set_config('request.jwt.claim.sub','$1',false); $2" 2>&1 | tail -1; }

cleanup() { "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$DIR/data" -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
psql -h "$DIR" -p $PORT -U postgres -qc "create database t" || exit 1
$PSQL <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text, league text not null default 'rookie', created_at timestamptz not null default now());
create table public.riders (id uuid primary key default gen_random_uuid(), player_id uuid unique references auth.users(id) on delete cascade, first_name text, surname text, country_name text, country_iso2 text, age int);
grant usage on schema public to authenticated;
SQL
$PSQL -f "$MIG" >/dev/null 2>&1 || { echo "migration failed"; exit 1; }
$PSQL -f "$MIG" >/dev/null 2>&1 && ok "migration is idempotent (second run)" || bad "migration is idempotent" "second run failed"

newuser() { $PSQL -c "with u as (insert into auth.users default values returning id) insert into public.profiles (id) select id from u returning id;" | head -1; }
div_of()  { $PSQL -c "select d.league||' 1.'||d.number from public.league_memberships m join public.league_divisions d on d.id=m.division_id where m.player_id='$1'"; }
count_in(){ $PSQL -c "select member_count from public.league_divisions where league='$1' and number=$2"; }

echo "-- 1. first player creates Rookie 1.1, next ones share it"
U1=$(newuser); as "$U1" "select public.assign_my_league_division('season-2');" >/dev/null
eq "first player -> rookie 1.1" "$(div_of $U1)" "rookie 1.1"
eq "profiles.league synced" "$(q "select league from public.profiles where id='$U1'")" "rookie"
eq "joined season stored (global season)" "$(q "select joined_season_id from public.league_memberships where player_id='$U1'")" "season-2"
U2=$(newuser); as "$U2" "select public.assign_my_league_division('season-2');" >/dev/null
eq "second player -> same rookie 1.1" "$(div_of $U2)" "rookie 1.1"
eq "no empty sub-league created in advance" "$(q "select count(*) from public.league_divisions")" "1"

echo "-- 2. idempotent assignment"
D_A=$(as "$U1" "select public.assign_my_league_division('season-9');"); D_B=$(as "$U1" "select public.assign_my_league_division('season-2');")
eq "repeat call returns same sub-league" "$D_A" "$D_B"
eq "repeat call keeps count" "$(count_in rookie 1)" "2"
eq "repeat call keeps original joined season" "$(q "select joined_season_id from public.league_memberships where player_id='$U1'")" "season-2"
r=$($PSQL -c "set role authenticated; select set_config('request.jwt.claim.sub','$U1',false); select public.assign_my_league_division('bogus');" 2>&1); echo "$r" | grep -q invalid_season && ok "invalid season rejected" || bad "invalid season rejected" "$r"

echo "-- 3. fill to 50, 51st opens Rookie 1.2, 101st opens 1.3"
for i in $(seq 3 50); do u=$(newuser); as "$u" "select public.assign_my_league_division('season-2');" >/dev/null; done
eq "50 players fill rookie 1.1" "$(count_in rookie 1)" "50"
eq "still one sub-league at exactly 50" "$(q "select count(*) from public.league_divisions")" "1"
U51=$(newuser); as "$U51" "select public.assign_my_league_division('season-2');" >/dev/null
eq "51st player -> rookie 1.2" "$(div_of $U51)" "rookie 1.2"
for i in $(seq 52 101); do u=$(newuser); [ $i = 101 ] && U101=$u; as "$u" "select public.assign_my_league_division('season-2');" >/dev/null; done
eq "101st player -> rookie 1.3" "$(div_of $U101)" "rookie 1.3"
eq "labels are numbered 1..3" "$(q "select string_agg(number::text, ',' order by number) from public.league_divisions where league='rookie'")" "1,2,3"

echo "-- 4. concurrent registrations never exceed capacity"
CU=(); for i in $(seq 1 120); do CU+=("$(newuser)"); done
printf '%s\n' "${CU[@]}" | xargs -P 24 -I{} bash -c "psql -h $DIR -p $PORT -U postgres -d t -qtA -c \"set role authenticated; select set_config('request.jwt.claim.sub','{}',false); select public.assign_my_league_division('season-2');\" >/dev/null 2>&1"
eq "all 120 concurrent players placed" "$(q "select count(*) from public.league_memberships where player_id = any(array['$(IFS=,; echo "${CU[*]}" | sed "s/,/','/g")']::uuid[])")" "120"
eq "no sub-league above 50" "$(q "select count(*) from public.league_divisions where member_count > 50")" "0"
eq "total members = 101 + 120" "$(q "select count(*) from public.league_memberships")" "221"
eq "counters equal real member counts" "$(q "select count(*) from public.league_divisions d where member_count <> (select count(*) from public.league_memberships m where m.division_id=d.id)")" "0"
eq "5 rookie sub-leagues (221 players)" "$(q "select count(*) from public.league_divisions where league='rookie'")" "5"
eq "no duplicate sub-league numbers" "$(q "select count(*) from (select league, number from public.league_divisions group by 1,2 having count(*)>1) x")" "0"

echo "-- 5. same player registering concurrently twice"
UD=$(newuser)
printf '%s\n%s\n%s\n%s\n' $UD $UD $UD $UD | xargs -P 4 -I{} bash -c "psql -h $DIR -p $PORT -U postgres -d t -qtA -c \"set role authenticated; select set_config('request.jwt.claim.sub','{}',false); select public.assign_my_league_division('season-2');\" >/dev/null 2>&1"
eq "one membership only" "$(q "select count(*) from public.league_memberships where player_id='$UD'")" "1"
eq "counters still consistent" "$(q "select count(*) from public.league_divisions d where member_count <> (select count(*) from public.league_memberships m where m.division_id=d.id)")" "0"

echo "-- 6. hard rules at database level"
DUP=$(q "insert into public.league_memberships (player_id, division_id, league, joined_season_id) select '$U1', id, 'rookie', 'season-2' from public.league_divisions where league='rookie' and number=2" )
echo "$DUP" | grep -qi "duplicate key" && ok "a player cannot hold two memberships" || bad "a player cannot hold two memberships" "$DUP"
FULLID=$(q "select id from public.league_divisions where league='rookie' and number=1"); NU=$(newuser)
OVER=$(q "insert into public.league_memberships (player_id, division_id, league, joined_season_id) values ('$NU','$FULLID','rookie','season-2')")
echo "$OVER" | grep -qi "member_count_range" && ok "direct insert into a full sub-league is rejected" || bad "direct insert into a full sub-league" "$OVER"
MIS=$(q "insert into public.league_memberships (player_id, division_id, league, joined_season_id) values ('$NU','$FULLID','pro','season-2')")
echo "$MIS" | grep -qi "foreign key" && ok "league and sub-league cannot disagree" || bad "league/sub-league mismatch" "$MIS"
eq "failed inserts left counter intact" "$(count_in rookie 1)" "50"
W=$(as "$NU" "insert into public.league_memberships (player_id, division_id, league, joined_season_id) values ('$NU','$FULLID','rookie','season-2');"); echo "$W" | grep -qi "permission denied" && ok "player cannot write memberships directly" || bad "player cannot write memberships" "$W"
W=$(as "$NU" "update public.league_divisions set capacity = 999;"); echo "$W" | grep -qi "permission denied" && ok "player cannot change capacity" || bad "player cannot change capacity" "$W"
W=$(as "$NU" "select public.allocate_league_division('rookie');"); echo "$W" | grep -qi "permission denied" && ok "allocator is not callable by players" || bad "allocator not callable by players" "$W"

echo "-- 7. Elite: one sub-league only"
q "select public.allocate_league_division('elite')" >/dev/null
eq "elite 1.1 created on first allocation" "$(q "select count(*) from public.league_divisions where league='elite' and number=1")" "1"
EID=$(q "select id from public.league_divisions where league='elite'")
for i in $(seq 1 50); do u=$(newuser); q "insert into public.league_memberships (player_id, division_id, league, joined_season_id) values ('$u','$EID','elite','season-2')" >/dev/null; done
eq "elite 1.1 holds 50" "$(count_in elite 1)" "50"
E=$(q "select public.allocate_league_division('elite')"); echo "$E" | grep -q elite_full && ok "51st elite player: no second elite sub-league" || bad "elite 51st" "$E"
E=$(q "insert into public.league_divisions (league, number) values ('elite', 2)"); echo "$E" | grep -qi "elite_single" && ok "elite sub-league 2 rejected by CHECK" || bad "elite 2 CHECK" "$E"
eq "profiles.league follows membership (elite)" "$(q "select count(*) from public.profiles p join public.league_memberships m on m.player_id=p.id where m.league='elite' and p.league <> 'elite'")" "0"
E=$(q "select public.allocate_league_division('nonsense')"); echo "$E" | grep -q invalid_league && ok "unknown league rejected" || bad "unknown league" "$E"

echo "-- 8. moving a player keeps counters right (future promotion/relegation)"
PID=$(q "select id from public.league_divisions where league='pro'" ); [ -z "$PID" ] && PID=$(q "select public.allocate_league_division('pro')")
b1=$(count_in rookie 2); q "update public.league_memberships set division_id='$PID', league='pro' where player_id='$U51'" >/dev/null
eq "source counter -1" "$(count_in rookie 2)" "$((b1-1))"
eq "target counter +1" "$(count_in pro 1)" "1"
eq "profiles.league synced on move" "$(q "select league from public.profiles where id='$U51'")" "pro"

echo "-- 9. members view: only own sub-league, public fields only"
for u in "$U1" "$U2"; do q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age) values ('$u','F','S','Slovakia','SK',20)" >/dev/null; done
q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age) select '$U101','X','Y','Czechia','CZ',21" >/dev/null
eq "view shows own sub-league members (rookie 1.1)" "$(as "$U1" "select count(*) from public.division_members;")" "2"
eq "view hides other sub-leagues" "$(as "$U101" "select count(*) from public.division_members where number = 1;")" "0"
eq "caller without membership sees nothing" "$(as "$NU" "select count(*) from public.division_members;")" "0"

echo "-- 10. migration places existing accounts (oldest first)"
q "truncate public.league_memberships; update public.league_divisions set member_count = 0;" >/dev/null
q "delete from public.league_divisions" >/dev/null
for i in 1 2 3; do newuser >/dev/null; done
$PSQL -f "$MIG" >/dev/null 2>&1
eq "backfill placed every profile" "$(q "select count(*) from public.profiles p where not exists (select 1 from public.league_memberships m where m.player_id=p.id)")" "0"
eq "backfill respects capacity" "$(q "select count(*) from public.league_divisions where member_count > capacity")" "0"

echo; echo "  $pass passed, $fail failed"; [ "$fail" = 0 ]
