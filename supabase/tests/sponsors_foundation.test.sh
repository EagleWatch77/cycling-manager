#!/usr/bin/env bash
# Sponzori foundation (migration 20261122_01) against a REAL local Postgres 16.
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/sponsors_foundation.test.sh   (run as a non-root user, e.g. postgres)
# Proves: limits per league, contract durations, offer validity/market caps, player separation (RLS), no client writes, no contract without money,
# no double payout, the weekly key, severance example, and that nothing existing is touched. Supabase auth schema/roles are stubbed.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}
PORT=${PGTEST_PORT:-5561}
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
psqlc postgres -c "create database t" >/dev/null
psqlc t -f "$DIR/stub.sql" >/dev/null || { echo "stub failed"; exit 1; }
psqlc t -f "$BASE" >/dev/null 2>&1 || { echo "base schema failed"; exit 1; }
# players with profiles (profiles are created by a trigger in production; here we insert directly)
mk() { local id; id=$(q "insert into auth.users default values returning id" | head -1); q "insert into public.profiles (id, league) values ('$id', '$1') on conflict (id) do update set league='$1'" >/dev/null; echo "$id"; }
BEFORE_PROFILES=$(q "select count(*) from public.profiles")
M="$ROOT/migrations/20261122_01_sponsors_foundation.sql"
psqlc t -f "$M" >/dev/null 2>&1 && ok "migration applies" || { bad "migration applies" "$(psqlc t -f "$M" | tail -3)"; exit 1; }
psqlc t -f "$M" >/dev/null 2>&1 && ok "migration is idempotent (second run)" || bad "second run" "$(psqlc t -f "$M" | tail -3)"

echo "== 1. nothing invented, switch off"
eq "economy switch is OFF" "$(q "select economy_enabled from public.sponsor_settings")" "f"
eq "no sponsor company, offer, contract or payout exists" "$(q "select (select count(*) from public.sponsor_companies)+(select count(*) from public.sponsor_offers)+(select count(*) from public.sponsor_contracts)+(select count(*) from public.sponsor_payouts)")" "0"
eq "existing profiles untouched" "$(q "select count(*) from public.profiles")" "$BEFORE_PROFILES"

echo "== 2. limits per league (owner table)"
eq "limits main" "$(q "select string_agg(public.sponsor_limit(l,'main')::text, ',' order by o) from unnest(array['rookie','amateur','continental','pro','elite']) with ordinality u(l,o)")" "1,1,1,1,2"
eq "limits secondary" "$(q "select string_agg(public.sponsor_limit(l,'secondary')::text, ',' order by o) from unnest(array['rookie','amateur','continental','pro','elite']) with ordinality u(l,o)")" "1,2,2,3,2"

echo "== 3. contract durations"
eq "main rookie..pro = 10 only" "$(q "select string_agg(public.sponsor_duration_allowed(l,'main',10)::text||public.sponsor_duration_allowed(l,'main',20)::text||public.sponsor_duration_allowed(l,'main',5)::text, ',') from unnest(array['rookie','amateur','continental','pro']) l")" "truefalsefalse,truefalsefalse,truefalsefalse,truefalsefalse"
eq "main elite = 10 or 20" "$(q "select public.sponsor_duration_allowed('elite','main',10)::text||public.sponsor_duration_allowed('elite','main',20)::text||public.sponsor_duration_allowed('elite','main',5)::text")" "truetruefalse"
eq "secondary = 5 in every league" "$(q "select string_agg(public.sponsor_duration_allowed(l,'secondary',5)::text||public.sponsor_duration_allowed(l,'secondary',10)::text, ',') from unnest(array['rookie','amateur','continental','pro','elite']) l")" "truefalse,truefalse,truefalse,truefalse,truefalse"

echo "== 4. goals reachable in the league"
eq "elite: no promotion" "$(q "select public.sponsor_goal_allowed('promotion','elite')")" "f"
eq "rookie: promotion yes, Worlds no" "$(q "select public.sponsor_goal_allowed('promotion','rookie')::text||public.sponsor_goal_allowed('participateWorlds','rookie')::text||public.sponsor_goal_allowed('winWorlds','pro')::text")" "truefalsefalse"
eq "pro: top3 Worlds yes; elite: win Worlds yes; unknown goal no" "$(q "select public.sponsor_goal_allowed('top3Worlds','pro')::text||public.sponsor_goal_allowed('winWorlds','elite')::text||public.sponsor_goal_allowed('xyz','elite')::text")" "truetruefalse"

echo "== 5. offers: validity, market caps, money stays undetermined"
P1=$(mk rookie); P2=$(mk rookie)
q "insert into public.sponsor_companies (name) select 'Fiktivna firma '||g from generate_series(1,8) g" >/dev/null
C=($(q "select id from public.sponsor_companies order by name"))
offer() { # player kind weeks idx [g1 g2]
  q "insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, expires_at) values ('$1','${C[$4]}','$2',$3,'${5:-finishTour}','${6:-winStage}', now() + interval '21 days') returning id"; }
O1=$(offer "$P1" main 10 0); has "offer without any money can exist (Zatiaľ neurčené)" "$O1" "^[0-9a-f-]\{36\}"
eq "its money columns are NULL" "$(q "select weekly_income_cents is null and goal1_bonus_cents is null and goal2_bonus_cents is null from public.sponsor_offers where id='$O1'")" "t"
has "zero income refused" "$(q "insert into public.sponsor_offers (player_id,company_id,kind,duration_weeks,weekly_income_cents,goal1_type,goal2_type,expires_at) values ('$P1','${C[1]}','main',10,0,'finishTour','winStage',now()+interval '1 day')")" "violates check"
has "zero bonus refused" "$(q "insert into public.sponsor_offers (player_id,company_id,kind,duration_weeks,goal1_type,goal1_bonus_cents,goal2_type,expires_at) values ('$P1','${C[1]}','main',10,'finishTour',0,'winStage',now()+interval '1 day')")" "violates check"
has "wrong duration (main rookie 20) refused" "$(offer "$P1" main 20 1)" "duration_not_allowed"
has "wrong duration (secondary 10) refused" "$(offer "$P1" secondary 10 1)" "duration_not_allowed"
has "same two goals refused" "$(offer "$P1" main 10 1 finishTour finishTour)" "violates check"
has "Worlds goal refused in rookie" "$(offer "$P1" main 10 1 finishTour winWorlds)" "goal_not_available_in_league"
has "one open offer per company per player" "$(offer "$P1" main 10 0)" "duplicate key"
offer "$P1" main 10 1 >/dev/null; offer "$P1" main 10 2 >/dev/null
has "4th open MAIN offer refused (cap 3)" "$(offer "$P1" main 10 3)" "market_full_for_kind"
for i in 3 4 5; do offer "$P1" secondary 5 $i >/dev/null; done
has "4th open SECONDARY offer refused (cap 3)" "$(offer "$P1" secondary 5 6)" "market_full_for_kind"
eq "6 open offers at most (3+3)" "$(q "select count(*) from public.sponsor_offers where player_id='$P1' and status='open'")" "6"
eq "the same company may sponsor ANOTHER player (no global exclusivity)" "$(offer "$P2" main 10 0 | grep -c '^[0-9a-f-]\{36\}$')" "1"

echo "== 6. rejecting and expiry"
eq "player rejects own open offer" "$(as "$P1" "select public.reject_my_sponsor_offer('$O1')")" "t"
eq "the rejected offer is no longer open" "$(q "select status||':'||(resolved_at is not null) from public.sponsor_offers where id='$O1'")" "rejected:true"
eq "rejecting again does nothing" "$(as "$P1" "select public.reject_my_sponsor_offer('$O1')")" "f"
O2=$(q "select id from public.sponsor_offers where player_id='$P2' limit 1")
eq "a player cannot reject ANOTHER player's offer" "$(as "$P1" "select public.reject_my_sponsor_offer('$O2')")" "f"
eq "that offer is still open" "$(q "select status from public.sponsor_offers where id='$O2'")" "open"
eq "a freed place can be refilled at the next update (open main back to 2 -> 3rd allowed)" "$(offer "$P1" main 10 7 | grep -c '^[0-9a-f-]\{36\}$')" "1"
q "update public.sponsor_offers set expires_at = now() - interval '1 hour', created_at = now() - interval '22 days' where id in (select id from public.sponsor_offers where player_id='$P1' and kind='secondary' and status='open' limit 2)" >/dev/null
eq "expiry job expires exactly the overdue offers" "$(q "select public.expire_sponsor_offers()")" "2"
eq "expiry job is idempotent" "$(q "select public.expire_sponsor_offers()")" "0"
has "players cannot run the expiry job" "$(as "$P1" "select public.expire_sponsor_offers()")" "permission denied"

echo "== 7. contracts: no contract without money; limits; durations; same sponsor"
P3=$(mk rookie)
O3=$(offer "$P3" main 10 0); O4=$(offer "$P3" secondary 5 1); O5=$(offer "$P3" secondary 5 2)
ctr() { # player offer company kind weeks [income]
  q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, weekly_income_cents, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) values ('$1','$2','$3','$4',$5,${6:-1000},'finishTour',100,'winStage',200, now() + interval '$5 weeks') returning id"; }
has "contract without a positive income refused" "$(ctr "$P3" "$O3" "${C[0]}" main 10 0)" "violates check"
has "contract without income (NULL) refused" "$(q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) values ('$P3','$O3','${C[0]}','main',10,'finishTour',1,'winStage',1, now()+interval '10 weeks')")" "null value"
has "contract without bonuses refused" "$(q "insert into public.sponsor_contracts (player_id, offer_id, company_id, kind, duration_weeks, weekly_income_cents, goal1_type, goal1_bonus_cents, goal2_type, goal2_bonus_cents, ends_at) values ('$P3','$O3','${C[0]}','main',10,5,'finishTour',0,'winStage',1, now()+interval '10 weeks')")" "violates check"
has "wrong contract length refused (main 20 in rookie)" "$(ctr "$P3" "$O3" "${C[0]}" main 20)" "duration_not_allowed"
has "contract on another player's offer refused" "$(ctr "$P3" "$O2" "${C[0]}" main 10)" "offer_mismatch"
K1=$(ctr "$P3" "$O3" "${C[0]}" main 10); has "valid main contract (test data only)" "$K1" "^[0-9a-f-]\{36\}"
has "rookie: 2nd main contract refused (limit 1)" "$(ctr "$P3" "$(offer "$P3" main 10 3)" "${C[3]}" main 10)" "sponsor_slots_full"
K2=$(ctr "$P3" "$O4" "${C[1]}" secondary 5); has "rookie: 1st secondary ok" "$K2" "^[0-9a-f-]\{36\}"
has "rookie: 2nd secondary refused (limit 1)" "$(ctr "$P3" "$O5" "${C[2]}" secondary 5)" "sponsor_slots_full"
q "update public.sponsor_contracts set status='ended', ended_at=now() where id='$K2'; update public.sponsor_offers set status='accepted' where id in ('$O3','$O4')" >/dev/null
O6=$(offer "$P3" secondary 5 1)
has "same sponsor twice in a row refused (latest signed = company 1)" "$(ctr "$P3" "$O6" "${C[1]}" secondary 5)" "same_sponsor_twice_in_a_row"
q "update public.sponsor_contracts set signed_at = now() - interval '1 day' where id='$K1'" >/dev/null
K3=$(ctr "$P3" "$O5" "${C[2]}" secondary 5); has "a different sponsor in between -> allowed; the slot of the ended contract is free" "$K3" "^[0-9a-f-]\{36\}"
q "update public.sponsor_contracts set status='ended', ended_at=now() where id='$K3'" >/dev/null
K4=$(ctr "$P3" "$O6" "${C[1]}" secondary 5); has "the original sponsor may return after another one" "$K4" "^[0-9a-f-]\{36\}"
has "contract terms are immutable" "$(q "update public.sponsor_contracts set weekly_income_cents = 999999 where id='$K1'")" "contract_terms_are_immutable"
eq "status may change (ended)" "$(q "update public.sponsor_contracts set status='ended', ended_at=now() where id='$K4' returning status")" "ended"
echo "-- elite limits and durations"
PE=$(mk elite); eo() { offer "$PE" "$@"; }
E1=$(eo main 20 0); E2=$(eo main 10 1); E3=$(eo main 10 2)
KE1=$(ctr "$PE" "$E1" "${C[0]}" main 20); has "elite main 20 weeks ok" "$KE1" "^[0-9a-f-]\{36\}"
KE2=$(ctr "$PE" "$E2" "${C[1]}" main 10); has "elite 2nd main ok (limit 2)" "$KE2" "^[0-9a-f-]\{36\}"
has "elite 3rd main refused" "$(ctr "$PE" "$E3" "${C[2]}" main 10)" "sponsor_slots_full"
has "elite: promotion goal refused in an offer" "$(eo secondary 5 3 finishTour promotion)" "goal_not_available_in_league"
echo "-- promotion never touches a contract"
q "update public.profiles set league='amateur' where id='$P3'" >/dev/null
eq "contract still active after the league changed" "$(q "select status from public.sponsor_contracts where id='$K1'")" "active"
eq "an old offer can still be rejected after promotion" "$(q "update public.profiles set league='elite' where id='$P1'" >/dev/null; as "$P1" "select public.reject_my_sponsor_offer('$(q "select id from public.sponsor_offers where player_id='$P1' and status='open' limit 1")')")" "t"

echo "== 8. payouts cannot be paid twice"
q "insert into public.sponsor_payouts (contract_id, week_key, kind, amount_cents) values ('$K1', '2026-11-22', 'guaranteed', 1000)" >/dev/null
has "same week + contract + kind refused" "$(q "insert into public.sponsor_payouts (contract_id, week_key, kind, amount_cents) values ('$K1', '2026-11-22', 'guaranteed', 1000)")" "duplicate key"
eq "another week is fine" "$(q "insert into public.sponsor_payouts (contract_id, week_key, kind, amount_cents) values ('$K1', '2026-11-29', 'guaranteed', 1000) returning 1")" "1"
eq "repeatable goal: occurrence 0,1,2 paid separately" "$(q "insert into public.sponsor_payouts (contract_id, week_key, kind, goal_slot, occurrence, amount_cents) values ('$K1','2026-11-29','bonus',2,0,5),('$K1','2026-11-29','bonus',2,1,5),('$K1','2026-11-29','bonus',2,2,5) returning 1" | wc -l)" "3"
has "bonus with slot 0 refused" "$(q "insert into public.sponsor_payouts (contract_id, week_key, kind, goal_slot, amount_cents) values ('$K1','2026-12-06','bonus',0,5)")" "violates check"
has "zero payout refused" "$(q "insert into public.sponsor_payouts (contract_id, week_key, kind, amount_cents) values ('$K1','2026-12-06','guaranteed',0)")" "violates check"

echo "== 9. players are separated; nobody writes from the browser"
eq "P1 sees only own offers" "$(as "$P1" "select count(*) from public.sponsor_offers where player_id <> '$P1'")" "0"
eq "P2 sees exactly its own offers" "$(as "$P2" "select count(*) from public.sponsor_offers")" "$(q "select count(*) from public.sponsor_offers where player_id='$P2'")"
eq "P2 sees none of P3's contracts" "$(as "$P2" "select count(*) from public.sponsor_contracts")" "0"
eq "P3 sees its contracts" "$(as "$P3" "select count(*) from public.sponsor_contracts")" "4"
eq "P2 sees none of P3's payouts" "$(as "$P2" "select count(*) from public.sponsor_payouts")" "0"
eq "P3 sees its payouts" "$(as "$P3" "select count(*) from public.sponsor_payouts")" "5"
has "player cannot insert an offer" "$(as "$P2" "insert into public.sponsor_offers (player_id,company_id,kind,duration_weeks,goal1_type,goal2_type,expires_at) values ('$P2','${C[5]}','main',10,'finishTour','winStage',now()+interval '1 day')")" "permission denied"
has "player cannot insert a contract" "$(as "$P2" "insert into public.sponsor_contracts (player_id,offer_id,company_id,kind,duration_weeks,weekly_income_cents,goal1_type,goal1_bonus_cents,goal2_type,goal2_bonus_cents,ends_at) values ('$P2','$O2','${C[0]}','main',10,1,'finishTour',1,'winStage',1,now()+interval '1 day')")" "permission denied"
has "player cannot change an offer" "$(as "$P2" "update public.sponsor_offers set weekly_income_cents=999 where player_id='$P2'")" "permission denied"
has "player cannot delete an offer" "$(as "$P2" "delete from public.sponsor_offers")" "permission denied"
has "player cannot flip the economy switch" "$(as "$P2" "update public.sponsor_settings set economy_enabled=true")" "permission denied"
has "player cannot add a company" "$(as "$P2" "insert into public.sponsor_companies (name) values ('Hack')")" "permission denied"
eq "player can read the companies" "$(as "$P2" "select count(*) from public.sponsor_companies")" "8"
eq "anon sees nothing" "$(printf "set role anon;\nselect count(*) from public.sponsor_offers;\n" | psqlc t 2>&1 | grep -c 'permission denied')" "1"
eq "no function lets a player sign, terminate or generate" "$(q "select count(*) from pg_proc p where pronamespace='public'::regnamespace and (proname like '%sign%sponsor%' or proname like '%sponsor%sign%' or proname like '%terminate%sponsor%' or proname like '%sponsor%terminate%' or proname like '%accept%sponsor%' or proname like '%generate%sponsor%')")" "0"

echo "== 10. weekly key (Sunday 00:00 Europe/Bratislava) and severance"
eq "Sat 23:59 local = previous Sunday" "$(q "select public.sponsor_week_key('2026-11-21 22:59:00+00')")" "2026-11-15"
eq "Sun 00:00 local starts the new period" "$(q "select public.sponsor_week_key('2026-11-21 23:00:00+00')")" "2026-11-22"
eq "summer: Sun 00:00 local = Sat 22:00Z" "$(q "select public.sponsor_week_key('2026-07-04 22:00:00+00')")" "2026-07-05"
eq "summer: Sat 23:59 local" "$(q "select public.sponsor_week_key('2026-07-04 21:59:00+00')")" "2026-06-28"
eq "severance example: 1000/week, 4 weeks left -> 1200 (in cents)" "$(q "select public.sponsor_severance_cents(100000, 4)")" "120000"
eq "severance with nothing left" "$(q "select public.sponsor_severance_cents(100000, 0)")" "0"

echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
