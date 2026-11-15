#!/usr/bin/env bash
# SQL tests for migrations 01-03 against a REAL local Postgres (real
# constraints, triggers, RLS, column grants, concurrency). Supabase's `auth`
# schema and roles are stubbed; everything else is the project's real schema.
#
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/league_divisions.test.sh
#
# Scenario A (existing production DB): the schema as it was BEFORE the
# migrations (schema.sql up to the first ">>>>>>>>" marker) + legacy rows, then
# migrations 01, 02, 03 in order, then each again (idempotence).
# Scenario B (fresh DB): the full supabase/schema.sql; its catalog must equal A.
# Needs a non-root OS user (run as `postgres`). Never touches a real database.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}
PORT=${PGTEST_PORT:-5498}
M1="$ROOT/migrations/20261114_01_tour_season_registrations.sql"
M2="$ROOT/migrations/20261114_02_league_divisions.sql"
M3="$ROOT/migrations/20261114_03_profiles_lockdown.sql"
SCHEMA="$ROOT/schema.sql"
BASE="$DIR/base_schema.sql"; sed '/^-- >>>>>>>> /,$d' "$SCHEMA" > "$BASE"
# This test covers migrations 01-03 only: cut later migrations (04+) off the full schema.
SCHEMA3="$DIR/schema_01_03.sql"; sed '/^-- >>>>>>>> 20261115_/,$d' "$SCHEMA" > "$SCHEMA3"
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS  $1"; }
bad() { fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
has() { echo "$2" | grep -qi "$3" && ok "$1" || bad "$1" "$(echo "$2" | tr '\n' ' ' | cut -c1-160)"; }
psqlc() { psql -h "$DIR" -p $PORT -U postgres -d "$1" -qtA -v ON_ERROR_STOP=1 "${@:2}" 2>&1; }
PSQL() { psqlc t "$@"; }
q()  { PSQL -c "$1"; }
as() { # as <uuid> <sql> — one transaction as an authenticated player; prints everything
  PSQL -c "set role authenticated; select set_config('request.jwt.claim.sub','$1',false); $2" | grep -v '^$' | tail -n +2; }
asanon() { PSQL -c "set role anon; $1"; }

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
SQL
for db in t fresh; do psqlc postgres -c "create database $db" >/dev/null; psqlc $db -f "$DIR/stub.sql" >/dev/null || { echo "stub failed"; exit 1; }; done

echo "== Scenario A: existing production database"
psqlc t -f "$BASE" >/dev/null 2>&1 || { echo "base schema failed to apply"; exit 1; }
ok "pre-migration schema applies"
# Legacy data created BEFORE the migrations: 3 players (one with a stored league 'amateur'), one rider, one registration.
L1=$(q "insert into auth.users default values returning id" | head -1)
L2=$(q "insert into auth.users default values returning id" | head -1)
L3=$(q "insert into auth.users default values returning id" | head -1)
q "update public.profiles set league='amateur' where id='$L3'" >/dev/null
q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$L1','A','B','Slovakia','SK',20,'{}','{}','{}','climber',100,100,70,70)" >/dev/null
q "insert into public.tour_registrations (rider_id, tour_id) select id, 'danube-tour' from public.riders where player_id='$L1'" >/dev/null
for m in "$M1" "$M2" "$M3"; do PSQL -f "$m" >/dev/null 2>&1 && ok "applied $(basename $m)" || { bad "applied $(basename $m)" "$(PSQL -f "$m" | tail -3)"; exit 1; }; done
for m in "$M1" "$M2" "$M3"; do PSQL -f "$m" >/dev/null 2>&1 && ok "re-run $(basename $m) (idempotent)" || bad "re-run $(basename $m)" "failed"; done
eq "legacy registration backfilled to season-1" "$(q "select season_id from public.tour_registrations limit 1")" "season-1"
eq "legacy players all placed" "$(q "select count(*) from public.league_memberships")" "3"
eq "legacy amateur stays amateur 1.1" "$(q "select d.league||' 1.'||d.number from public.league_memberships m join public.league_divisions d on d.id=m.division_id where m.player_id='$L3'")" "amateur 1.1"
eq "legacy rookies share rookie 1.1" "$(q "select count(*) from public.league_memberships m join public.league_divisions d on d.id=m.division_id where d.league='rookie' and d.number=1")" "2"

echo "== Scenario B: fresh database from supabase/schema.sql == scenario A"
psqlc fresh -f "$SCHEMA3" >/dev/null 2>&1 && ok "schema.sql (up to migration 03) applies on a fresh database" || bad "schema.sql applies" "$(psqlc fresh -f "$SCHEMA3" | tail -3)"
dump() { pg_dump -h "$DIR" -p $PORT -U postgres -s --no-owner --no-privileges "$1" | grep -v '^--' | grep -v '^$' | grep -v 'SET \|set_config\|^SELECT pg_catalog\|^.restrict\|^.unrestrict' | sort; }
DIFFN=$(diff <(dump t) <(dump fresh) | grep -c '^[<>]')
eq "catalog identical (A: base+3 migrations, B: schema.sql)" "$DIFFN" "0"
[ "$DIFFN" != 0 ] && diff <(dump t) <(dump fresh) | head -12
GR=$(for db in t fresh; do psqlc $db -c "select string_agg(table_name||':'||grantee||':'||privilege_type, ',' order by table_name, grantee, privilege_type) from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated')" | md5sum; done | uniq | wc -l)
eq "table grants identical in A and B" "$GR" "1"

mkrider() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','F','S','Slovakia','SK',20,'{}','{}','{}','climber',1,1,70,70) returning id" | head -1; }
newuser() { q "insert into auth.users default values returning id" | head -1; }
div_of()  { q "select d.league||' 1.'||d.number from public.league_memberships m join public.league_divisions d on d.id=m.division_id where m.player_id='$1'"; }
count_in(){ q "select member_count from public.league_divisions where league='$1' and number=$2"; }
assign()  { as "$1" "select public.assign_my_league_division();" | tail -1; }
reset_leagues() { q "truncate public.league_memberships; delete from public.league_divisions;" >/dev/null; }

echo "-- game season computed in SQL (matches lib/calendar/season.ts)"
for pair in "2026-08-16 season-1" "2026-08-17 season-1" "2026-10-25 season-1" "2026-10-26 season-2" "2027-01-03 season-2" "2027-01-04 season-3"; do
  set -- $pair; eq "season_id_at($1) = $2" "$(q "select public.season_id_at('$1 23:59:59+00')")" "$2"; done
eq "boundary uses UTC midnight" "$(q "select public.season_id_at('2026-10-25 23:59:59+00')||','||public.season_id_at('2026-10-26 00:00:00+00')")" "season-1,season-2"
eq "current_season_id() = season_id_at(now())" "$(q "select public.current_season_id() = public.season_id_at(now())")" "t"

echo "-- 1. placement (clean sub-league tables)"
reset_leagues
U1=$(newuser); assign "$U1" >/dev/null
eq "first player -> rookie 1.1" "$(div_of $U1)" "rookie 1.1"
eq "profiles.league synced" "$(q "select league from public.profiles where id='$U1'")" "rookie"
eq "joined season = current GLOBAL season (server time)" "$(q "select joined_season_id = public.current_season_id() from public.league_memberships where player_id='$U1'")" "t"
U2=$(newuser); assign "$U2" >/dev/null
eq "second player -> same rookie 1.1" "$(div_of $U2)" "rookie 1.1"
eq "no empty sub-league created in advance" "$(q "select count(*) from public.league_divisions")" "1"
A=$(assign "$U1"); B=$(assign "$U1"); eq "repeat call is idempotent" "$A" "$B"
eq "repeat call keeps count" "$(count_in rookie 1)" "2"

echo "-- 2. fill to 50 / 51st / 101st"
for i in $(seq 3 50); do u=$(newuser); assign "$u" >/dev/null; done
eq "50 players fill rookie 1.1" "$(count_in rookie 1)" "50"
U51=$(newuser); assign "$U51" >/dev/null; eq "51st player -> rookie 1.2" "$(div_of $U51)" "rookie 1.2"
for i in $(seq 52 101); do u=$(newuser); [ $i = 101 ] && U101=$u; assign "$u" >/dev/null; done
eq "101st player -> rookie 1.3" "$(div_of $U101)" "rookie 1.3"

echo "-- 3. concurrent registrations never exceed capacity"
CU=(); for i in $(seq 1 120); do CU+=("$(newuser)"); done
printf '%s\n' "${CU[@]}" | xargs -P 24 -I{} bash -c "psql -h $DIR -p $PORT -U postgres -d t -qtA -c \"set role authenticated; select set_config('request.jwt.claim.sub','{}',false); select public.assign_my_league_division();\" >/dev/null 2>&1"
eq "all 120 concurrent players placed" "$(q "select count(*) from public.league_memberships")" "221"
eq "no sub-league above 50" "$(q "select count(*) from public.league_divisions where member_count > 50")" "0"
eq "counters equal real member counts" "$(q "select count(*) from public.league_divisions d where member_count <> (select count(*) from public.league_memberships m where m.division_id=d.id)")" "0"
eq "5 rookie sub-leagues (221 players)" "$(q "select count(*) from public.league_divisions where league='rookie'")" "5"
UD=$(newuser); printf '%s\n%s\n%s\n%s\n' $UD $UD $UD $UD | xargs -P 4 -I{} bash -c "psql -h $DIR -p $PORT -U postgres -d t -qtA -c \"set role authenticated; select set_config('request.jwt.claim.sub','{}',false); select public.assign_my_league_division();\" >/dev/null 2>&1"
eq "same player registering 4x concurrently -> one membership" "$(q "select count(*) from public.league_memberships where player_id='$UD'")" "1"
eq "counters still consistent" "$(q "select count(*) from public.league_divisions d where member_count <> (select count(*) from public.league_memberships m where m.division_id=d.id)")" "0"

echo "-- 4. database-level rules (even for a trusted writer)"
FULLID=$(q "select id from public.league_divisions where league='rookie' and number=1"); NU=$(newuser)
has "a player cannot hold two memberships" "$(q "insert into public.league_memberships (player_id, division_id, league, joined_season_id) select '$U1', id, 'rookie', 'season-2' from public.league_divisions where league='rookie' and number=2")" "duplicate key"
has "direct insert into a full sub-league is rejected" "$(q "insert into public.league_memberships (player_id, division_id, league, joined_season_id) values ('$NU','$FULLID','rookie','season-2')")" "member_count_range"
has "league and sub-league cannot disagree" "$(q "insert into public.league_memberships (player_id, division_id, league, joined_season_id) values ('$NU','$FULLID','pro','season-2')")" "foreign key"
eq "failed inserts left counter intact" "$(count_in rookie 1)" "50"
q "select public.allocate_league_division('elite')" >/dev/null
EID=$(q "select id from public.league_divisions where league='elite'")
for i in $(seq 1 50); do u=$(newuser); q "insert into public.league_memberships (player_id, division_id, league, joined_season_id) values ('$u','$EID','elite','season-2')" >/dev/null; done
has "51st elite player: no second elite sub-league" "$(q "select public.allocate_league_division('elite')")" "elite_full"
has "elite sub-league 2 rejected by CHECK" "$(q "insert into public.league_divisions (league, number) values ('elite', 2)")" "elite_single"
has "unknown league rejected" "$(q "select public.allocate_league_division('nonsense')")" "invalid_league"
PID=$(q "select public.allocate_league_division('pro')"); b1=$(count_in rookie 2)
q "update public.league_memberships set division_id='$PID', league='pro' where player_id='$U51'" >/dev/null
eq "moving a player: source counter -1" "$(count_in rookie 2)" "$((b1-1))"
eq "moving a player: target counter +1" "$(count_in pro 1)" "1"
eq "moving a player: profiles.league synced by the trusted trigger" "$(q "select league from public.profiles where id='$U51'")" "pro"

echo "-- 5. SECURITY (O-007): a player cannot forge league, sub-league or season"
SP=$(newuser); assign "$SP" >/dev/null; OTHER=$(newuser)
has "player can still change display_name" "$(as "$SP" "update public.profiles set display_name='Mirko' where id='$SP' returning display_name;")" "Mirko"
has "player can still change preferred_language" "$(as "$SP" "update public.profiles set preferred_language='en' where id='$SP' returning preferred_language;")" "en"
has "player cannot set own league (column grant)" "$(as "$SP" "update public.profiles set league='elite' where id='$SP';")" "permission denied"
has "player cannot set league together with allowed columns" "$(as "$SP" "update public.profiles set display_name='x', league='pro' where id='$SP';")" "permission denied"
eq "league unchanged after attempts" "$(q "select league from public.profiles where id='$SP'")" "rookie"
has "player cannot change own profile id" "$(as "$SP" "update public.profiles set id=gen_random_uuid() where id='$SP';")" "permission denied"
has "player cannot change created_at" "$(as "$SP" "update public.profiles set created_at=now() where id='$SP';")" "permission denied"
has "player cannot insert a profile" "$(as "$SP" "insert into public.profiles (id) values (gen_random_uuid());")" "permission denied"
has "player cannot delete a profile" "$(as "$SP" "delete from public.profiles where id='$SP';")" "permission denied"
eq "player cannot edit another player's profile (0 rows)" "$(as "$SP" "update public.profiles set display_name='hack' where id='$OTHER' returning 1;" | grep -c 1)" "0"
eq "other player's profile untouched" "$(q "select coalesce(display_name,'-') from public.profiles where id='$OTHER'")" "-"
# Defence in depth: even a careless table-wide GRANT must not reopen the hole.
q "grant update on public.profiles to authenticated" >/dev/null
has "guard trigger blocks league change even with a wide GRANT" "$(as "$SP" "update public.profiles set league='elite' where id='$SP';")" "league_is_server_controlled"
has "guard trigger blocks id change even with a wide GRANT" "$(as "$SP" "update public.profiles set id=gen_random_uuid() where id='$SP';")" "profile_id_is_immutable"
PSQL -f "$M3" >/dev/null 2>&1
has "re-running migration 03 restores the column grants" "$(as "$SP" "update public.profiles set league='elite' where id='$SP';")" "permission denied"
eq "league still rookie" "$(q "select league from public.profiles where id='$SP'")" "rookie"
echo "  -- memberships / sub-leagues"
DIV_BEFORE=$(div_of $SP)
has "player cannot insert a membership" "$(as "$OTHER" "insert into public.league_memberships (player_id, division_id, league, joined_season_id) values ('$OTHER','$EID','elite','season-2');")" "permission denied"
has "player cannot move own membership" "$(as "$SP" "update public.league_memberships set division_id='$EID', league='elite' where player_id='$SP';")" "permission denied"
has "player cannot delete own membership" "$(as "$SP" "delete from public.league_memberships where player_id='$SP';")" "permission denied"
has "player cannot change a sub-league (capacity)" "$(as "$SP" "update public.league_divisions set capacity=999;")" "permission denied"
has "player cannot create a sub-league" "$(as "$SP" "insert into public.league_divisions (league, number) values ('rookie', 99);")" "permission denied"
has "allocator not callable by players" "$(as "$SP" "select public.allocate_league_division('elite');")" "permission denied"
eq "membership unchanged" "$(div_of $SP)" "$DIV_BEFORE"
echo "  -- assignment takes no client input"
has "client-supplied season is impossible (old signature gone)" "$(as "$OTHER" "select public.assign_my_league_division('season-1');")" "does not exist"
has "client-supplied league/player is impossible (no such parameters)" "$(as "$OTHER" "select public.assign_my_league_division('elite', 'season-1');")" "does not exist"
assign "$OTHER" >/dev/null
eq "assigned player always lands in Rookie" "$(div_of $OTHER | cut -d' ' -f1)" "rookie"
eq "assigned player's season = server season" "$(q "select joined_season_id = public.current_season_id() from public.league_memberships where player_id='$OTHER'")" "t"
has "anonymous caller cannot assign" "$(asanon "select public.assign_my_league_division();")" "permission denied"
has "anonymous caller cannot read profiles" "$(asanon "select * from public.profiles;")" "permission denied"
has "anonymous caller cannot read memberships" "$(asanon "select * from public.league_memberships;")" "permission denied"
echo "  -- tour registration season cannot be forged"
RID=$(mkrider "$SP")
has "registration for a FUTURE season is rejected by RLS" "$(as "$SP" "insert into public.tour_registrations (rider_id, tour_id, season_id) values ('$RID','danube-tour','season-99');")" "row-level security"
has "registration for a PAST season is rejected by RLS" "$(as "$SP" "insert into public.tour_registrations (rider_id, tour_id, season_id) values ('$RID','danube-tour','season-1');")" "row-level security"
has "registration without season gets the current season" "$(as "$SP" "insert into public.tour_registrations (rider_id, tour_id) values ('$RID','danube-tour') returning season_id = public.current_season_id();")" "t"
has "same Tour twice in one season is rejected" "$(as "$SP" "insert into public.tour_registrations (rider_id, tour_id) values ('$RID','danube-tour');")" "duplicate key"

echo "-- 6. members view: only own sub-league, public fields only"
M1U=$(newuser); M2U=$(newuser); assign "$M1U" >/dev/null; assign "$M2U" >/dev/null
for u in "$M1U" "$M2U"; do mkrider "$u" >/dev/null; done
SAME=$(q "select count(*) from public.league_memberships where division_id=(select division_id from public.league_memberships where player_id='$M1U')")
eq "view lists exactly the caller's sub-league riders" "$(as "$M1U" "select count(*) from public.division_members where division_id=(select division_id from public.league_memberships where player_id='$M1U');")" "$(q "select count(*) from public.league_memberships m join public.riders r on r.player_id=m.player_id where m.division_id=(select division_id from public.league_memberships where player_id='$M1U')")"
eq "view hides every other sub-league" "$(as "$M1U" "select count(*) from public.division_members where division_id <> (select division_id from public.league_memberships where player_id='$M1U');")" "0"
eq "view exposes no hidden columns" "$(q "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name='division_members'")" "division_id,league,number,rider_id,first_name,surname,country_name,country_iso2,age,joined_at"

echo; echo "  $pass passed, $fail failed"; [ "$fail" = 0 ]
