#!/usr/bin/env bash
# Rider development tracking (migration 20261115_03) against a REAL local Postgres 16.
#   PGBIN=/usr/lib/postgresql/16/bin bash supabase/tests/rider_development.test.sh   (run as a non-root user, e.g. postgres)
# Scenario A: existing production DB (legacy riders + training) -> migrations 01-05 -> 06. Scenario B: fresh schema.sql == A.
# Supabase auth schema/roles are stubbed. Never touches a real database.
set -u
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
DIR=${PGTEST_DIR:-$(mktemp -d)}
PORT=${PGTEST_PORT:-5498}
SCHEMA="$ROOT/schema.sql"
BASE="$DIR/base_schema.sql"; sed '/^-- >>>>>>>> /,$d' "$SCHEMA" > "$BASE"
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS  $1"; }
bad() { fail=$((fail+1)); echo "  FAIL  $1  ($2)"; }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }
has() { echo "$2" | grep -qi -- "$3" && ok "$1" || bad "$1" "$(echo "$2" | tr '\n' ' ' | cut -c1-200)"; }
psqlc() { psql -h "$DIR" -p $PORT -U postgres -d "$1" -qtA -v ON_ERROR_STOP=1 "${@:2}" 2>&1; }
q()  { psqlc t -c "$1"; }                       # superuser (the migration owner)
as() { printf "set role authenticated;\nselect set_config('request.jwt.claim.sub','%s',false);\n%s\n" "$1" "$2" | psqlc t | tail -n +2; }
asanon() { printf "set role anon;\n%s\n" "$1" | psqlc t; }

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
-- Supabase gives every new table/function to anon + authenticated by default; reproduce that so the test proves the REVOKEs.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
SQL
for db in t fresh; do psqlc postgres -c "create database $db" >/dev/null; psqlc $db -f "$DIR/stub.sql" >/dev/null || { echo "stub failed"; exit 1; }; done

psqlc postgres -c "select 1" >/dev/null
echo "== Scenario A: existing production database with legacy riders"
psqlc t -f "$BASE" >/dev/null 2>&1 || { echo "base schema failed"; exit 1; }
for m in 20261114_01_tour_season_registrations 20261114_02_league_divisions 20261114_03_profiles_lockdown; do
  psqlc t -f "$ROOT/migrations/$m.sql" >/dev/null 2>&1 || { echo "migration $m failed"; exit 1; }
done
mkplayer() { q "insert into auth.users default values returning id" | head -1; }
P1=$(mkplayer); P2=$(mkplayer); P3=$(mkplayer); P4=$(mkplayer); P5=$(mkplayer); PREM=$(mkplayer); PREM2=$(mkplayer)
ATTRS=$(python3 -c "
import json
keys='climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding roughSurface wetHandling experience'.split()
print(json.dumps({k:130 for k in keys}))")
COND='{"energy":70,"fatigue":30,"form":50,"fitness":60,"morale":70}'
mkrider() { q "insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values ('$1','Test','$2','Slovakia','SK',20,'$ATTRS','$COND','$COND','allrounder',80,80,70,70) returning id" | head -1; }
R1=$(mkrider "$P1" One); R2=$(mkrider "$P2" Two); RP=$(mkrider "$PREM" Prem); RP2=$(mkrider "$PREM2" Prem2)
AI=$(q "insert into public.riders (player_id, is_ai, first_name, surname, country_name, country_iso2, age, attributes, condition, condition_previous, inferred_archetype, potential, trainability, professionalism, recovery) values (null,true,'Ai','Filler','Slovakia','SK',21,'$ATTRS','$COND','$COND','climber',90,90,90,90) returning id" | head -1)
for m in 20261115_01_training_security 20261115_02_training_calendar_rules; do
  psqlc t -f "$ROOT/migrations/$m.sql" >/dev/null 2>&1 || { echo "migration $m failed"; exit 1; }
done
q "insert into public.premium_entitlements (user_id) values ('$PREM'), ('$PREM2')" >/dev/null
BEFORE_RIDERS=$(q "select count(*) from public.riders"); BEFORE_ATTR=$(q "select attributes::text from public.riders where id='$R1'")
psqlc t -f "$ROOT/migrations/20261115_03_rider_development_tracking.sql" >/dev/null 2>&1 && ok "migration applies on top of legacy data" || { bad "migration applies" "$(psqlc t -f "$ROOT/migrations/20261115_03_rider_development_tracking.sql" | tail -3)"; exit 1; }
psqlc t -f "$ROOT/migrations/20261115_03_rider_development_tracking.sql" >/dev/null 2>&1 && ok "migration is idempotent (second run)" || bad "second run" "failed"

echo "== 1. existing riders: START OF TRACKING, nothing invented"
eq "one tracking_start per existing human rider (4), none for the AI filler" "$(q "select count(*) from public.rider_acquisitions where kind='tracking_start'")" "4"
eq "no 'acquired' row is invented for legacy riders" "$(q "select count(*) from public.rider_acquisitions where kind='acquired'")" "0"
eq "AI filler has no snapshot" "$(q "select count(*) from public.rider_acquisitions where rider_id='$AI'")" "0"
eq "the baseline equals the CURRENT attributes" "$(q "select (a.attributes = r.attributes)::text from public.rider_acquisitions a join public.riders r on r.id=a.rider_id where r.id='$R1'")" "true"
eq "exactly one baseline history row per rider after two runs" "$(q "select count(*) from public.rider_attribute_history where rider_id='$R1'")" "1"
eq "migration changed no rider attributes" "$(q "select attributes::text from public.riders where id='$R1'")" "$BEFORE_ATTR"
eq "no rider deleted" "$(q "select count(*) from public.riders")" "$BEFORE_RIDERS"
eq "snapshots hold only the 19 public attributes (no hidden values)" "$(q "select count(*) from public.rider_acquisitions a, jsonb_object_keys(a.attributes) k where k in ('potential','trainability','professionalism','recovery')")" "0"
eq "snapshot has 19 keys" "$(q "select (select count(*) from jsonb_object_keys(attributes)) from public.rider_acquisitions where rider_id='$R1'")" "19"

echo "== 2. clients cannot write or rewrite"
for tbl in rider_acquisitions rider_attribute_history; do
  has "insert into $tbl denied" "$(as $P1 "insert into public.$tbl (rider_id, manager_id, attributes, season_id, season_week) values ('$R1','$P1','{}','season-1',1);")" "permission denied"
  has "update $tbl denied" "$(as $P1 "update public.$tbl set attributes='{}' where rider_id='$R1';")" "permission denied"
  has "delete from $tbl denied" "$(as $P1 "delete from public.$tbl where rider_id='$R1';")" "permission denied"
  has "anon cannot read $tbl" "$(asanon "select * from public.$tbl;")" "permission denied"
done
has "even the table owner cannot UPDATE a snapshot (immutable trigger)" "$(q "update public.rider_acquisitions set attributes='{}' where rider_id='$R1'")" "immutable"
has "even the table owner cannot UPDATE a history row" "$(q "update public.rider_attribute_history set season_week=9 where rider_id='$R1'")" "immutable"
has "trigger function is not callable by clients" "$(as $P1 "select public.rider_track_development();")" "permission denied"

echo "== 3. reads"
eq "player sees only own snapshot" "$(as $P1 "select count(*) from public.rider_acquisitions;")" "1"
eq "player does not see another manager's snapshot" "$(as $P1 "select count(*) from public.rider_acquisitions where rider_id='$R2';")" "0"
eq "FREE player cannot read history (Premium, enforced by RLS)" "$(as $P1 "select count(*) from public.rider_attribute_history;")" "0"
eq "Premium player reads own history" "$(as $PREM "select count(*) from public.rider_attribute_history;")" "1"
eq "Premium manager A reads ONLY his own rider's history (one row)" "$(as $PREM "select string_agg(rider_id::text, ',') from public.rider_attribute_history;")" "$RP"
eq "Premium manager B reads ONLY his own rider's history" "$(as $PREM2 "select string_agg(rider_id::text, ',') from public.rider_attribute_history;")" "$RP2"
eq "Premium manager A cannot read Premium manager B's rider by id" "$(as $PREM "select count(*) from public.rider_attribute_history where rider_id='$RP2';")" "0"
eq "Premium manager A cannot read B's snapshot either" "$(as $PREM "select count(*) from public.rider_acquisitions where rider_id='$RP2';")" "0"
eq "Premium manager A cannot read a FREE manager's history" "$(as $PREM "select count(*) from public.rider_attribute_history where manager_id='$P1';")" "0"
eq "Premium player does not read others' history" "$(as $PREM "select count(*) from public.rider_attribute_history where rider_id='$R1';")" "0"

echo "== 4. real changes are recorded; no-ops are not"
q "update public.riders set age = 21 where id='$R1'" >/dev/null
q "update public.riders set attributes = attributes where id='$R1'" >/dev/null
q "update public.riders set player_id = '$P1' where id='$R1'" >/dev/null
eq "age change / identical attributes / same manager: no new history, no new snapshot" "$(q "select (select count(*) from public.rider_attribute_history where rider_id='$R1')||':'||(select count(*) from public.rider_acquisitions where rider_id='$R1')")" "1:1"
q "update public.riders set attributes = attributes || '{\"sprint\":133}' where id='$R1'" >/dev/null
eq "a direct (non-training) change is recorded as 'other' with season + week + time" "$(q "select source||':'||(season_id ~ '^season-[0-9]+$')||':'||(season_week between 1 and 10)||':'||(recorded_at is not null)||':'||(attributes->>'sprint') from public.rider_attribute_history where rider_id='$R1' order by recorded_at desc, id limit 1")" "other:true:true:true:133"
eq "the baseline did not move" "$(q "select (attributes->>'sprint') from public.rider_acquisitions where rider_id='$R1'")" "130"
eq "season-1 style id and week come from the SQL calendar" "$(q "select (season_id = public.season_id_at(now()))::text from public.rider_attribute_history where rider_id='$R1' order by recorded_at desc, id limit 1")" "true"

echo "== 5. training: real source 'training', baseline untouched"
CUR=$(q "select public.current_season_id()"); W=$(q "select public.season_week_at(now())")
# a single session may not cross the progress threshold, so queue 13 past weeks (season-1 w1-10, current season w1-3)
q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) select '$R2', 'season-1', w, 'performance', 'sprint', 'hard' from generate_series(1,10) w" >/dev/null
q "insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity) select '$R2', '$CUR', w, 'performance', 'sprint', 'hard' from generate_series(1,least(3,$W-1)) w where '$CUR' <> 'season-1'" >/dev/null
B2=$(q "select attributes::text from public.riders where id='$R2'")
NPLANS=$(q "select count(*) from public.training_plans where rider_id='$R2'")
as $P2 "select public.process_my_due_training();" >/dev/null
A2=$(q "select attributes::text from public.riders where id='$R2'")
if [ "$A2" != "$B2" ]; then
  ok "training changed the rider's attributes"
  eq "history has >=1 'training' rows, each a REAL change (no duplicate of the previous state)" "$(q "select (count(*) >= 1)::text from public.rider_attribute_history where rider_id='$R2' and source='training'")" "true"
  eq "no two consecutive history rows are identical (only real changes are stored)" "$(q "select count(*) from (select attributes, lag(attributes) over (order by recorded_at, id) p from public.rider_attribute_history where rider_id='$R2') x where attributes = p")" "0"
  eq "the latest history row equals the rider's current attributes" "$(q "select (h.attributes = r.attributes)::text from public.rider_attribute_history h join public.riders r on r.id=h.rider_id where h.rider_id='$R2' order by h.recorded_at desc, h.id limit 1")" "true"
else
  bad "training changed attributes" "no change; cannot test"
fi
eq "baseline snapshot of R2 is still the original attributes" "$(q "select (attributes::text = '$B2')::text from public.rider_acquisitions where rider_id='$R2'")" "true"
eq "no training plan was deleted by processing" "$(q "select count(*) from public.training_plans where rider_id='$R2'")" "$NPLANS"

echo "== 6. new manager = new snapshot; old one kept"
q "update public.riders set player_id='$P5', is_ai=false where id='$AI'" >/dev/null 2>&1
q "update public.riders set player_id = null where id='$R2'" >/dev/null 2>&1
q "update public.riders set player_id = '$P4' where id='$R2'" >/dev/null
eq "R2 now has 2 snapshots: P2's (kept) and the NEW 'acquired' one for P4" "$(q "select string_agg(manager_id::text||':'||kind, ',' order by acquired_at, id) from public.rider_acquisitions where rider_id='$R2'")" "$P2:tracking_start,$P4:acquired"
eq "new baseline = attributes at the moment of acquisition (after training)" "$(q "select (a.attributes = r.attributes)::text from public.rider_acquisitions a join public.riders r on r.id=a.rider_id where a.rider_id='$R2' and a.kind='acquired'")" "true"
eq "an AI filler taken over by a manager gets an 'acquired' baseline" "$(q "select count(*) from public.rider_acquisitions where rider_id='$AI' and manager_id='$P5' and kind='acquired'")" "1"
GE2=$(q "select count(*) >= 2 from public.rider_attribute_history where rider_id='$R2' and manager_id='$P2'"); eq "old manager's history (baseline + training) is intact" "$GE2" "t"

echo "== 7. starter rider via the real function"
STARTER=$(python3 -c "
import json
keys='climbing hills flat sprint timeTrial endurance acceleration positioning attackTiming reaction energyManagement breakawaySkill descending bikeHandling cornering packRiding roughSurface wetHandling experience'.split()
print(json.dumps({'first_name':'Star','surname':'Ter','country_name':'Slovakia','country_iso2':'SK','age':19,'attributes':{k:120+i for i,k in enumerate(keys)},'condition':{'energy':100,'fatigue':0,'form':50,'fitness':60,'morale':70},'potential':70,'trainability':70,'professionalism':70,'recovery':70,'generator_version':'starter-v1','inferred_archetype':'allrounder'}))")
SID=$(as $P3 "select public.create_my_starter_rider('$STARTER'::jsonb);")
eq "starter creation writes an 'acquired' snapshot (not tracking_start)" "$(q "select kind from public.rider_acquisitions where rider_id='$SID' and manager_id='$P3'")" "acquired"
eq "starter snapshot equals the generated attributes" "$(q "select (a.attributes = (select attributes from public.riders where id='$SID'))::text from public.rider_acquisitions a where a.rider_id='$SID'")" "true"
eq "starter has exactly one baseline history row" "$(q "select count(*) from public.rider_attribute_history where rider_id='$SID' and source='baseline'")" "1"
as $P3 "select public.create_my_starter_rider('$STARTER'::jsonb);" >/dev/null
eq "calling create_my_starter_rider again creates no second snapshot" "$(q "select count(*) from public.rider_acquisitions where rider_id='$SID'")" "1"

# schema.sql also contains the later migration 07 (contracts); apply it to A so both sides compare like with like.
psqlc t -f "$ROOT/migrations/20261116_01_rider_contracts.sql" >/dev/null 2>&1 || { echo "migration 07 failed"; exit 1; }
echo "== Scenario B: fresh database from supabase/schema.sql == scenario A"
psqlc fresh -f "$SCHEMA" >/dev/null 2>&1 && ok "full schema.sql applies on a fresh database" || bad "full schema.sql applies" "$(psqlc fresh -f "$SCHEMA" | tail -3)"
cat_of() { psqlc "$1" -c "select string_agg(p.oid::regprocedure::text||':'||p.prosecdef::text||':'||coalesce(p.proacl::text,''), E'\n' order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | md5sum; }
eq "function catalog identical" "$(cat_of t)" "$(cat_of fresh)"
tg() { psqlc "$1" -c "select string_agg(table_name||':'||grantee||':'||privilege_type, ',' order by table_name, grantee, privilege_type) from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated')" | md5sum; }
eq "table grants identical" "$(tg t)" "$(tg fresh)"
pol() { psqlc "$1" -c "select string_agg(tablename||':'||policyname||':'||cmd, ',' order by tablename, policyname) from pg_policies where schemaname='public'" | md5sum; }
eq "RLS policies identical" "$(pol t)" "$(pol fresh)"
trg() { psqlc "$1" -c "select string_agg(tgname, ',' order by tgname) from pg_trigger where not tgisinternal" | md5sum; }
eq "triggers identical" "$(trg t)" "$(trg fresh)"

echo
echo "  $pass passed, $fail failed"
[ "$fail" = 0 ]
