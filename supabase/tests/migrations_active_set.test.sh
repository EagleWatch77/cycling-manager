#!/usr/bin/env bash
# The ACTIVE migration set (everything in supabase/migrations/, applied in plain file-name order exactly like an automatic runner would) must be safe:
# the superseded league-divisions draft (assign_my_league_division(text) with a client-supplied season) can never come back. REAL local Postgres.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; REPO="$(cd "$ROOT/.." && pwd)"; DIR=$(mktemp -d); PORT=${PGTEST_PORT:-5552}
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
grant usage on schema auth to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
SQL
P -qf "$DIR/stub.sql" >/dev/null
sed '/^-- >>>>>>>> /,$d' "$ROOT/schema.sql" > "$DIR/base.sql"; P -qf "$DIR/base.sql" >/dev/null 2>&1

echo "== the active migration folder"
eq "no file in migrations/ is a second copy of a numbered migration (name without a step number: <date>_<name>.sql whose twin <date>_NN_<name>.sql exists)" "$(cd "$ROOT/migrations" && for f in 2026*_*.sql; do b=$(echo "$f" | sed -E 's/^([0-9]{8})_(.*)$/\1 \2/'); d=${b% *}; n=${b#* }; ls ${d}_[0-9][0-9]_${n} 2>/dev/null; done | wc -l)" "0"
eq "the superseded draft is not in migrations/" "$(ls "$ROOT/migrations" | grep -c '^20261114_league_divisions\.sql$')" "0"
eq "no active migration (re)creates assign_my_league_division(text)" "$(grep -l 'function public.assign_my_league_division(p_season_id' "$ROOT"/migrations/*.sql 2>/dev/null | wc -l)" "0"
eq "the archived copy exists outside migrations/ and is marked SUPERSEDED" "$(head -3 "$ROOT/diagnostics/superseded_migrations/20261114_league_divisions_SUPERSEDED.sql" | grep -c 'SUPERSEDED')" "1"
eq "the application calls the function WITHOUT a season argument" "$(grep -c "rpc('assign_my_league_division')" "$REPO/apps/web/src/lib/league/repository.ts")" "1"

echo "== apply EVERYTHING in migrations/ in file-name order (what an automatic runner does)"
for m in $(ls "$ROOT"/migrations/2026*_*.sql | sort); do P -qf "$m" >"$DIR/m.out" 2>&1 || echo "  (migration returned an error: $(basename "$m"): $(tail -1 "$DIR/m.out" | cut -c1-120))"; done
eq "the old function assign_my_league_division(text) does NOT exist" "$(P -qAt -c "select coalesce(to_regprocedure('public.assign_my_league_division(text)')::text, 'none')")" "none"
eq "exactly one assign_my_league_division exists and it has no parameters" "$(P -qAt -c "select count(*)||':'||coalesce(min(pronargs),-1) from pg_proc where proname='assign_my_league_division' and pronamespace='public'::regnamespace")" "1:0"
eq "players can execute the parameterless one" "$(P -qAt -c "select has_function_privilege('authenticated','public.assign_my_league_division()','execute')::text")" "true"
eq "a client cannot choose the season: calling it with a season argument fails" "$(printf "set role authenticated;\nselect set_config('request.jwt.claim.sub', gen_random_uuid()::text, false);\nselect public.assign_my_league_division('season-9');\n" | P -qA 2>&1 | grep -c 'does not exist')" "1"
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
