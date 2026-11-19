#!/usr/bin/env bash
# market_rider_estimates() (migration 20261119_06) on a REAL local Postgres 16 (never a real database). Minimal stand-in schema (roles, auth.uid, market_riders with
# the migration-B column grant, the select policy, premium_entitlements, potential_to_stars from migration A), then the migration file itself.
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/market_rider_estimates.test.sh   (run as a non-root user, e.g. postgres)
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}; PORT=${PGTEST_PORT:-5497}
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS  $1"; }
bad() { fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
has() { echo "$2" | grep -qi -- "$3" && ok "$1" || bad "$1" "$(echo "$2" | tr '\n' ' ' | cut -c1-200)"; }
psqlc() { psql -h "$DIR" -p $PORT -U postgres -d "$1" -qtA "${@:2}" 2>&1; }
q()  { psqlc t -v ON_ERROR_STOP=1 -c "$1"; }
as() { printf "set role authenticated;\nselect set_config('request.jwt.claim.sub','%s',false);\n%s\n" "$1" "$2" | psqlc t | tail -n +2; }
asanon() { printf "set role anon;\n%s\n" "$1" | psqlc t; }
cleanup() { "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$DIR/data" -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
psqlc postgres -c "create database t" >/dev/null
cat > "$DIR/setup.sql" <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated; grant usage on schema public to anon, authenticated;
create table public.premium_entitlements (user_id uuid primary key);
create table public.market_riders (
  id uuid primary key, tier text not null, status text not null, first_name text, surname text, attributes jsonb,
  potential int, trainability int, professionalism int, recovery int, vitality int, acquired_by_player_id uuid);
create function public.potential_to_stars(p int) returns smallint language sql immutable as $$
  select (case when p >= 88 then 5 when p >= 75 then 4 when p >= 60 then 3 when p >= 40 then 2 else 1 end)::smallint $$;
alter table public.market_riders enable row level security;
create policy sel on public.market_riders for select using (
  acquired_by_player_id = auth.uid() or (status = 'available' and (tier = 'free' or exists (select 1 from public.premium_entitlements pe where pe.user_id = auth.uid()))));
revoke select on public.market_riders from public, anon, authenticated;
grant select (id, tier, status, first_name, surname, attributes) on public.market_riders to authenticated;  -- the migration-B shape: hidden columns closed
grant select on public.premium_entitlements to authenticated;
insert into public.market_riders values
 ('00000000-0000-0000-0000-0000000000a1','free','available','Free','Rider','{}', 88, 1, 20, 21, 100, null),
 ('00000000-0000-0000-0000-0000000000a2','free','available','Mid','Rider','{}', 39, 41, 60, 61, 80, null),
 ('00000000-0000-0000-0000-0000000000b1','premium','available','Prem','Rider','{}', 75, 50, 50, 50, 50, null),
 ('00000000-0000-0000-0000-0000000000c1','free','reserved','Gone','Rider','{}', 60, 50, 50, 50, 50, null),
 ('00000000-0000-0000-0000-0000000000d1','premium','reserved','Mine','Rider','{}', 60, 81, 81, 81, 81, '00000000-0000-0000-0000-00000000aaaa');
insert into public.premium_entitlements values ('00000000-0000-0000-0000-00000000bbbb');
SQL
psqlc t -v ON_ERROR_STOP=1 -f "$DIR/setup.sql" >/dev/null || { echo "setup failed"; exit 1; }
out=$(psqlc t -v ON_ERROR_STOP=1 -f "$ROOT/migrations/20261119_06_market_rider_estimates.sql"); has "migration applies" "$(echo "$out; echo done")" "done"
out=$(psqlc t -v ON_ERROR_STOP=1 -f "$ROOT/migrations/20261119_06_market_rider_estimates.sql" >/dev/null && echo again-ok); eq "migration is idempotent" "$out" "again-ok"

A=00000000-0000-0000-0000-00000000aaaa; B=00000000-0000-0000-0000-00000000bbbb; C=00000000-0000-0000-0000-00000000cccc
f1=00000000-0000-0000-0000-0000000000a1; f2=00000000-0000-0000-0000-0000000000a2; p1=00000000-0000-0000-0000-0000000000b1
g1=00000000-0000-0000-0000-0000000000c1; m1=00000000-0000-0000-0000-0000000000d1
est() { as "$1" "select potential_stars||','||trainability_level||','||professionalism_level||','||recovery_level||','||vitality_level from public.market_rider_estimates('$2');"; }

# Potential = approved bands, NO noise (88->5, 39->1); the other four carry a stable +-10 noise: compare with the true value's band, allowing +-10 points
eq "free rider: potential stars exact (88 -> 5)" "$(est $C $f1 | cut -d, -f1)" "5"
eq "free rider: potential stars exact (39 -> 1)" "$(est $C $f2 | cut -d, -f1)" "1"
eq "free player gets NO row for a premium rider" "$(est $C $p1)" ""
eq "premium player gets the premium rider (potential 75 -> 4 stars)" "$(est $B $p1 | cut -d, -f1)" "4"
eq "a reserved (not available) rider of someone else: no row" "$(est $C $g1)" ""
eq "the acquiring player still sees his own rider (premium tier, reserved)" "$(est $A $m1 | cut -d, -f1)" "3"
eq "another player cannot see that rider" "$(est $C $m1)" ""
eq "unknown id: no row, no error" "$(est $C 00000000-0000-0000-0000-0000000000ff)" ""
eq "anonymous cannot execute it" "$(asanon "select count(*) from public.market_rider_estimates('$f1');" | grep -ci 'permission denied')" "1"
eq "no login (auth.uid() null) returns nothing" "$(printf "set role authenticated;\nselect count(*) from public.market_rider_estimates('$f1');\n" | psqlc t)" "0"

# --- noise: stable, bounded, not zero, salt secret ---
r1=$(est $C $f2); r2=$(est $C $f2); r3=$(est $C $f2)
eq "the same rider gives the same answer on every call (stable, not random per request)" "$r1/$r2" "$r1/$r3"
q "insert into public.market_riders select gen_random_uuid(), 'free','available','N','N','{}', 50, v, v, v, v, null from generate_series(1,100) v, generate_series(1,20) k;" >/dev/null
printf "select set_config('request.jwt.claim.sub','$C',false);\\ncreate table public._chk as select m.id, m.trainability tv, e.trainability_level tl, e.professionalism_level pl, e.recovery_level rl, e.vitality_level vl from public.market_riders m, lateral public.market_rider_estimates(m.id) e where m.first_name='N';\\n" | psqlc t >/dev/null
eq "2000 test riders measured" "$(q "select count(*) from public._chk")" "2000"
eq "every shown level is within +-10 points of the true value (level of v-10 <= shown <= level of v+10), all four values" \
   "$(q "select count(*) from public._chk where tl < public.market_score_to_level(greatest(1,tv-10)) or tl > public.market_score_to_level(least(100,tv+10)) or pl < public.market_score_to_level(greatest(1,tv-10)) or pl > public.market_score_to_level(least(100,tv+10)) or rl < public.market_score_to_level(greatest(1,tv-10)) or rl > public.market_score_to_level(least(100,tv+10)) or vl < public.market_score_to_level(greatest(1,tv-10)) or vl > public.market_score_to_level(least(100,tv+10))")" "0"
shifted=$(q "select count(*) from public._chk where tl <> public.market_score_to_level(tv)")
[ "$shifted" -gt 100 ] && ok "the noise really moves levels near the band edges ($shifted of 2000 shifted)" || bad "noise has no effect" "$shifted"
eq "values 10 and 100 (whole noise window inside one band after clamping) never change level" "$(q "select count(*) from public._chk where tv in (10,100) and tl <> public.market_score_to_level(tv)")" "0"
eq "the four attributes do not all get the same noise (independent per attribute)" "$(q "select (count(*) > 100)::int from public._chk where tl <> vl or tl <> rl or tl <> pl")" "1"
eq "extremes stay inside 1..5" "$(q "select count(*) from public._chk where least(tl,pl,rl,vl) < 1 or greatest(tl,pl,rl,vl) > 5")" "0"
q "drop table public._chk" >/dev/null

# --- the salt ---
eq "salt exists, generated in the database (>= 64 hex chars)" "$(q "select (length(salt) >= 64)::int from private.market_estimate_secret")" "1"
salt=$(q "select salt from private.market_estimate_secret")
eq "the salt appears nowhere in the migration file" "$(grep -c "$salt" "$ROOT/migrations/20261119_06_market_rider_estimates.sql")" "0"
eq "the salt appears nowhere in the repository sources" "$(grep -rl "$salt" "$ROOT/.." --include=*.sql --include=*.ts --include=*.tsx --include=*.md --include=*.sh 2>/dev/null | grep -v node_modules | wc -l)" "0"
psqlc t -v ON_ERROR_STOP=1 -f "$ROOT/migrations/20261119_06_market_rider_estimates.sql" >/dev/null
eq "re-running the migration does NOT replace the salt (estimates stay stable)" "$(q "select salt from private.market_estimate_secret")" "$salt"
eq "players cannot read the salt table" "$(as $C "select salt from private.market_estimate_secret;" | grep -ci 'permission denied')" "1"
eq "players cannot even use the private schema" "$(as $C "select 1 from private.market_estimate_secret;" | grep -ci 'permission denied')" "1"
eq "anonymous cannot read the salt table" "$(asanon "select salt from private.market_estimate_secret;" | grep -ci 'permission denied')" "1"
eq "players cannot call the noise helper directly" "$(as $C "select public.market_noisy_level(50, '$f1', 'vitality');" | grep -ci 'permission denied')" "1"
eq "salt table has exactly one row" "$(q "select count(*) from private.market_estimate_secret")" "1"

# the function returns only 5 small integers 1..5 - no hidden raw value anywhere in its result
cols=$(psqlc t -c "select pg_get_function_result('public.market_rider_estimates(uuid)'::regprocedure)")
has "result columns are only the five level fields" "$cols" "potential_stars integer, trainability_level integer, professionalism_level integer, recovery_level integer, vitality_level integer"
eq "all levels are 1..5 for every rider (superuser run, premium visible)" "$(psqlc t -c "select count(*) from generate_series(1,100) v where public.market_score_to_level(v) not between 1 and 5")" "0"
eq "market_score_to_level: 1,20 ->1; 21,40 ->2; 41,60 ->3; 61,80 ->4; 81,100 ->5" "$(psqlc t -c "select string_agg(public.market_score_to_level(v)::text, '' order by v) from unnest(array[1,20,21,40,41,60,61,80,81,100]) v")" "1122334455"

# hidden columns stay closed for players (migration B is untouched by this file)
for col in potential trainability professionalism recovery vitality; do
  r=$(as $C "select $col from public.market_riders limit 1;"); has "player still cannot SELECT hidden column $col" "$r" "permission denied"
done
eq "helper market_score_to_level is not callable by players" "$(as $C "select public.market_score_to_level(50);" | grep -ci 'permission denied')" "1"
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
