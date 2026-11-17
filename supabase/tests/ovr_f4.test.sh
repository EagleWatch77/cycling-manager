#!/usr/bin/env bash
# rider_overall_rating() (migration 20261117_02) == TypeScript overallRating() on 3000 riders. REAL local Postgres, never a real database.
#   REF=/path/ovr_ref.json bash supabase/tests/ovr_f4.test.sh   (run as non-root, e.g. postgres; REF from apps/web/src/lib/rider/ovrRef.cli.ts)
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; DIR=${PGTEST_DIR:-$(mktemp -d)}; PORT=${PGTEST_PORT:-5497}
pass=0; fail=0
ok() { pass=$((pass+1)); echo "  PASS  $1"; }; bad() { fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
psqlc() { psql -h "$DIR" -p $PORT -U postgres -d "$1" -qtA -v ON_ERROR_STOP=1 "${@:2}" 2>&1; }
trap '"$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1' EXIT
"$PGBIN/initdb" -D "$DIR/data" -A trust >/dev/null; "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
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
psqlc postgres -c "create database t" >/dev/null; psqlc t -f "$DIR/stub.sql" >/dev/null; psqlc t -f "$ROOT/schema.sql" >/dev/null 2>&1 || { echo "schema.sql failed"; exit 1; }
OLD=$(psqlc t -c "select public.rider_overall_rating('$(python3 -c "import json;print(json.dumps({k:100 for k in 'climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding wetHandling roughSurface experience'.split()}))")'::jsonb)")
psqlc t -f "$ROOT/migrations/20261117_02_ovr_f4.sql" >/dev/null && ok "migration applies" || bad "migration applies" ""
psqlc t -f "$ROOT/migrations/20261117_02_ovr_f4.sql" >/dev/null && ok "migration is idempotent" || bad "idempotent" ""
psqlc t -c "create table ref (a jsonb, ovr int)" >/dev/null
python3 - "$REF" "$DIR/ref.csv" <<'PY'
import json,sys,csv
d=json.load(open(sys.argv[1])); w=csv.writer(open(sys.argv[2],'w'))
for a,o in d: w.writerow([json.dumps(a),o])
PY
psqlc t -c "\copy ref from '$DIR/ref.csv' csv" >/dev/null
N=$(psqlc t -c "select count(*) from ref"); BAD=$(psqlc t -c "select count(*) from ref where public.rider_overall_rating(a) <> ovr")
[ "$N" -ge 3000 ] && [ "$BAD" = "0" ] && ok "SQL == TypeScript on $N riders (0 differences)" || bad "SQL == TypeScript" "N=$N differences=$BAD"
[ "$(psqlc t -c "select public.rider_overall_rating(a) from ref limit 1" | wc -l)" = "1" ] && ok "function returns one int per rider" || bad "shape" ""
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
