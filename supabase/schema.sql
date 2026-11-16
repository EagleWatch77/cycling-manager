-- Cycling Manager — profile table and auth trigger.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: every statement is guarded.

-- 1. Profile row per authenticated user. Supabase already stores the login
--    (email, password) in auth.users; this holds the game-facing fields.
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text,
  preferred_language text not null default 'sk',
  league             text not null default 'rookie',
  created_at         timestamptz not null default now()
);

-- 2. Row-level security: every player sees and edits only their own row.
--    This is what makes the public anon key safe to ship in the browser.
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- 3. Seed a profile automatically whenever a new user signs up, copying the
--    display name and language passed in options.data at sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, preferred_language)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'sk')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Starter Rider Generator V1 — one rider per player.
-- Re-runnable: guarded like the rest of this file.
-- ============================================================================

create table if not exists public.riders (
  id                 uuid primary key default gen_random_uuid(),
  player_id          uuid not null unique references auth.users (id) on delete cascade,
  first_name         text not null,
  surname            text not null,
  country_name       text not null,
  country_iso2       text not null,
  age                int  not null,
  -- The 15 engine skill attributes and the condition block, stored as JSON so
  -- the shape can evolve without a migration.
  attributes         jsonb not null,
  condition          jsonb not null,
  inferred_archetype text not null,
  -- Hidden, persisted, no race effect yet (starter-v1).
  potential          int  not null,
  trainability       int  not null,
  generator_version  text not null default 'starter-v1',
  created_at         timestamptz not null default now()
);

-- The UNIQUE on player_id is what enforces "one rider per player": a second
-- insert for the same player fails, and the app falls back to reading the
-- existing row, so generation is idempotent.

alter table public.riders enable row level security;

drop policy if exists "riders_select_own" on public.riders;
create policy "riders_select_own"
  on public.riders for select
  using (auth.uid() = player_id);

drop policy if exists "riders_insert_own" on public.riders;
create policy "riders_insert_own"
  on public.riders for insert
  with check (auth.uid() = player_id);

drop policy if exists "riders_update_own" on public.riders;
create policy "riders_update_own"
  on public.riders for update
  using (auth.uid() = player_id);


-- ============================================================================
-- Table-level grants.
--
-- RLS decides WHICH rows a role may touch, but a role must first be granted
-- access to the table at all. Without these, API inserts/selects fail with
-- "permission denied for table" (SQLSTATE 42501) before RLS is even evaluated.
-- Trigger-created rows (profiles) do not need this because the trigger runs as
-- the table owner; app-created rows (riders) do.
-- ============================================================================

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.riders to authenticated;

-- ============================================================================
-- AI / Test Rider Generator V1 — non-human riders for filling test pelotons.
--
-- AI riders are ordinary rows in public.riders (same shape, same 15
-- attributes) with is_ai = true and no player_id. They are never a fake
-- Supabase auth user. Re-runnable: guarded like the rest of this file.
-- ============================================================================

alter table public.riders alter column player_id drop not null;
alter table public.riders add column if not exists is_ai boolean not null default false;

-- Every row is either a real player's rider or an unowned AI filler, never both.
alter table public.riders drop constraint if exists riders_ai_or_player_check;
alter table public.riders add constraint riders_ai_or_player_check
  check ((is_ai and player_id is null) or (not is_ai and player_id is not null));

-- Any authenticated player can see AI riders (they are shared test/race
-- fillers, not private data) in addition to their own rider.
drop policy if exists "riders_select_own" on public.riders;
create policy "riders_select_own"
  on public.riders for select
  using (auth.uid() = player_id or is_ai);

-- Widened only to allow the admin/test "Generate Test Peloton" action to
-- insert unowned AI rows; a real rider row still requires player_id = auth.uid().
drop policy if exists "riders_insert_own" on public.riders;
create policy "riders_insert_own"
  on public.riders for insert
  with check (auth.uid() = player_id or (is_ai and player_id is null));

-- ============================================================================
-- Tour Registration V1 — a Rider (not the player account) enters a
-- scheduled Tour. Tours themselves are static app content (data/tours.ts,
-- data/tourSchedule.ts), not a DB table, so tour_id is a plain text id with
-- no foreign key — validated against that catalogue at the application layer.
-- ============================================================================

create table if not exists public.tour_registrations (
  id             uuid primary key default gen_random_uuid(),
  rider_id       uuid not null references public.riders (id) on delete cascade,
  tour_id        text not null,
  registered_at  timestamptz not null default now(),
  unique (rider_id, tour_id)
);

-- The UNIQUE above is what blocks a Rider from registering twice for the same
-- Tour; a second insert simply fails.

alter table public.tour_registrations enable row level security;

-- A start list is public race information (who has entered), so any
-- authenticated player may read every registration, not just their own.
drop policy if exists "tour_registrations_select_all" on public.tour_registrations;
create policy "tour_registrations_select_all"
  on public.tour_registrations for select
  using (true);

-- A player may only register a Rider they own; AI riders are never entered here.
drop policy if exists "tour_registrations_insert_own_rider" on public.tour_registrations;
create policy "tour_registrations_insert_own_rider"
  on public.tour_registrations for insert
  with check (
    exists (
      select 1 from public.riders r
      where r.id = rider_id and r.player_id = auth.uid()
    )
  );

-- A player may cancel their own Rider's selection (Tour selection is
-- reversible — clicking a selected Tour again unselects it).
drop policy if exists "tour_registrations_delete_own_rider" on public.tour_registrations;
create policy "tour_registrations_delete_own_rider"
  on public.tour_registrations for delete
  using (
    exists (
      select 1 from public.riders r
      where r.id = rider_id and r.player_id = auth.uid()
    )
  );

grant select, insert, delete on public.tour_registrations to authenticated;

-- ============================================================================
-- Rider Development V1 — professionalism & recovery.
--
-- These did not exist on the rider model before Training V1. Same convention
-- as potential/trainability: hidden dev-facing ratings, no direct race
-- effect, generated once with the rider. Backfilled for any rider created
-- before this column existed so the NOT NULL below never fails.
-- ============================================================================

alter table public.riders add column if not exists professionalism int;
alter table public.riders add column if not exists recovery int;
update public.riders set professionalism = 70 where professionalism is null;
update public.riders set recovery = 70 where recovery is null;
alter table public.riders alter column professionalism set not null;
alter table public.riders alter column recovery set not null;

-- ============================================================================
-- Training V1 — one training block per Rider per season week.
--
-- A row with applied_at IS NULL is still just "scheduled": the Rider has
-- chosen a focus/intensity for that week but nothing has been processed yet.
-- No season/week-rollover job exists yet to fill in primary/secondary gain
-- and applied_at — that is a future piece (analogous to race simulation) and
-- is out of scope here. UNIQUE(rider_id, season_id, week_number) is what
-- prevents a second training block for a week that already has one.
-- ============================================================================

create table if not exists public.training_plans (
  id              uuid primary key default gen_random_uuid(),
  rider_id        uuid not null references public.riders (id) on delete cascade,
  season_id       text not null,
  week_number     int not null,
  week_type       text not null check (week_type in ('performance', 'technical')),
  focus           text not null,
  intensity       text not null check (intensity in ('light', 'normal', 'hard')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Filled in once a future training-processing step runs; null until then.
  primary_attr    text,
  primary_gain    int,
  secondary_attr  text,
  secondary_gain  int,
  applied_at      timestamptz,
  unique (rider_id, season_id, week_number)
);

alter table public.training_plans enable row level security;

drop policy if exists "training_plans_select_own" on public.training_plans;
create policy "training_plans_select_own"
  on public.training_plans for select
  using (
    exists (select 1 from public.riders r where r.id = rider_id and r.player_id = auth.uid())
  );

drop policy if exists "training_plans_insert_own" on public.training_plans;
create policy "training_plans_insert_own"
  on public.training_plans for insert
  with check (
    exists (select 1 from public.riders r where r.id = rider_id and r.player_id = auth.uid())
  );

drop policy if exists "training_plans_update_own" on public.training_plans;
create policy "training_plans_update_own"
  on public.training_plans for update
  using (
    exists (select 1 from public.riders r where r.id = rider_id and r.player_id = auth.uid())
  );

grant select, insert, update on public.training_plans to authenticated;

-- A player may cancel their own Rider's still-scheduled plan (Training V1 —
-- "Zrušiť plán"). Restricted to applied_at IS NULL at the policy level too:
-- a processed plan is history and can never be deleted through the app.
drop policy if exists "training_plans_delete_own" on public.training_plans;
create policy "training_plans_delete_own"
  on public.training_plans for delete
  using (
    applied_at is null
    and exists (select 1 from public.riders r where r.id = rider_id and r.player_id = auth.uid())
  );

grant delete on public.training_plans to authenticated;

-- ============================================================================
-- Canonical attribute set migration — adds timeTrial, reaction,
-- breakawaySkill, wetHandling to the rider skill model (Performance 6->7,
-- Tactics 3->5, Technique 5->6; see apps/web/src/lib/rider/config.ts).
--
-- riders.attributes is jsonb with no fixed shape (see its own comment
-- above), so no ALTER TABLE is needed to store these — only a one-time
-- backfill for riders generated before this migration, so old rows don't
-- come back with the new keys silently missing. Idempotent: each UPDATE
-- only touches rows that don't already have that key, and never rewrites an
-- existing key's value. 130 is the generator's neutral base value
-- (ROOKIE_BASE, before any shape bonus/penalty) — there is no bonus/penalty
-- to replay after the fact for a rider whose shape was picked before these
-- attributes existed, so every backfilled rider gets the plain base number.
-- ============================================================================

update public.riders set attributes = attributes || jsonb_build_object('timeTrial', 130)
  where not (attributes ? 'timeTrial');
update public.riders set attributes = attributes || jsonb_build_object('reaction', 130)
  where not (attributes ? 'reaction');
update public.riders set attributes = attributes || jsonb_build_object('breakawaySkill', 130)
  where not (attributes ? 'breakawaySkill');
update public.riders set attributes = attributes || jsonb_build_object('wetHandling', 130)
  where not (attributes ? 'wetHandling');

-- ============================================================================
-- Condition trend tracking — Stav jazdca UI must show a real up/down/flat
-- arrow, never a guess. That requires knowing the condition *before* the
-- most recent change, which nothing persisted until now (riders.condition
-- was overwritten in place with no history). condition_previous is a
-- snapshot of `condition` as it was immediately before the last write;
-- lib/training/engine.ts now sets it alongside `condition` every time it
-- applies a processed training. Backfilled to each rider's own current
-- condition so a rider with no processed training yet reads as a flat trend
-- ("—" everywhere) rather than null/undefined.
-- ============================================================================

alter table public.riders add column if not exists condition_previous jsonb;
update public.riders set condition_previous = condition where condition_previous is null;
alter table public.riders alter column condition_previous set not null;

-- ============================================================================
-- Admin Rider Inspector V1 — internal/developer-only raw rider access.
--
-- admin_users is the ONLY source of admin identity in this app. Membership
-- is a DB fact, not a frontend check: nothing about "is this user an admin"
-- is ever decided by an email string compared in React or in a server
-- action — every admin page/query re-derives it from this table via
-- lib/admin/auth.ts, and the riders_select_admin policy below enforces the
-- same rule independently at the database level, so even a bug in the app's
-- own admin check could not leak another player's raw rider row.
--
-- Deliberately NOT auto-seeded with any email: this file has no way to know
-- your Supabase auth user id, and hardcoding an address here would either be
-- wrong for your project or (worse) silently grant admin to whoever signs up
-- with that address later. Add yourself once, by hand, after creating your
-- account:
--
--   insert into public.admin_users (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict (user_id) do nothing;
--
-- ============================================================================

create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- A user may only ever see their OWN membership row (enough for the
-- riders_select_admin policy's subquery below to work — it checks the
-- current user's own row — without exposing the admin list to anyone else).
drop policy if exists "admin_users_select_own" on public.admin_users;
create policy "admin_users_select_own"
  on public.admin_users for select
  using (user_id = auth.uid());

grant select on public.admin_users to authenticated;

-- Admin-only full read access to riders — additive, not a replacement: this
-- is a second permissive SELECT policy alongside the existing
-- "riders_select_own" (own rider + AI fillers). Postgres OR's permissive
-- policies together, so this can only ever WIDEN access for rows where the
-- current user is in admin_users; it can never narrow what a normal player
-- already sees, and a non-admin's EXISTS subquery here always evaluates to
-- false (they still fall back to riders_select_own).
drop policy if exists "riders_select_admin" on public.riders;
create policy "riders_select_admin"
  on public.riders for select
  using (
    exists (select 1 from public.admin_users a where a.user_id = auth.uid())
  );

-- ============================================================================
-- Transfer Market V1 — a persistent pool of unowned, transferable riders,
-- separate from public.riders on purpose: a market rider is not a player's
-- rider and not an AI race filler, and folding it into `riders` would mean
-- widening `riders_ai_or_player_check` (is_ai xor player_id) to a third
-- state everywhere that constraint is relied on. Acquiring one (future work,
-- not built by this migration) is expected to *copy* it into a real
-- `riders` row and mark this row acquired — never to just flip player_id
-- here — so this table can also keep permanent history of every rider a
-- player has ever signed from the market, which `riders` alone cannot.
--
-- `status` is the idempotency/reset boundary: 'available' rows are the
-- current, still-unsigned pool (safe to bulk-delete for a test reset);
-- 'acquired' rows are permanent history (never deleted by the reset action —
-- see lib/market/*). Generation is driven by lib/market/generateMarketPool.ts,
-- called today only from an admin action; `source` records which trigger
-- created a given batch ('admin' now, 'week6' once that season-tick job
-- exists — see that file's own doc comment).
-- ============================================================================

create table if not exists public.market_riders (
  id                 uuid primary key default gen_random_uuid(),
  season_id          text not null,
  tier               text not null check (tier in ('free', 'premium')),
  status             text not null default 'available' check (status in ('available', 'acquired')),
  first_name         text not null,
  surname            text not null,
  country_name       text not null,
  country_iso2       text not null,
  age                int  not null,
  attributes         jsonb not null,
  condition          jsonb not null,
  inferred_archetype text not null,
  potential          int  not null,
  trainability       int  not null,
  professionalism    int  not null,
  recovery           int  not null,
  generator_version  text not null default 'starter-v1',
  source             text not null check (source in ('admin', 'week6')),
  generated_at       timestamptz not null default now(),
  -- Populated only once a future "acquire" action exists. Never written by
  -- generation or by the reset action.
  acquired_by_player_id uuid references auth.users (id),
  acquired_at            timestamptz,
  acquired_rider_id       uuid references public.riders (id)
);

alter table public.market_riders enable row level security;

-- Any authenticated player may browse the currently-available pool (that's
-- the point of a market) plus whatever they personally acquired; nothing
-- else about another player's acquisition is exposed by this policy alone.
drop policy if exists "market_riders_select_available" on public.market_riders;
create policy "market_riders_select_available"
  on public.market_riders for select
  using (status = 'available' or acquired_by_player_id = auth.uid());

-- Generation and the test-reset are admin-only for now — there is no
-- player-facing "acquire" action yet, so no policy grants a normal player
-- any write access to this table at all.
drop policy if exists "market_riders_admin_all" on public.market_riders;
create policy "market_riders_admin_all"
  on public.market_riders for all
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

grant select, insert, update, delete on public.market_riders to authenticated;

-- ============================================================================
-- Trh jazdcov (player Transfer Market) V1 — read-only browsing.
--
-- Premium account entitlement: a SEPARATE table, deliberately not a boolean
-- column on public.profiles. profiles already has a broad "update own row"
-- policy for the player's own display settings — if is_premium lived there,
-- that same policy would let a player grant themselves Premium with a plain
-- authenticated Supabase client call. Mirrors the public.admin_users
-- pattern exactly: presence of a row = entitlement, and there is NO
-- insert/update/delete policy for `authenticated` at all, so a player's own
-- client can never write to this table under any circumstances — only a
-- manual admin SQL statement (see the template below, same shape as the
-- admin_users one) or, later, a real purchase-flow server action using the
-- same authenticated+RLS pattern can grant it.
--
--   insert into public.premium_entitlements (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict (user_id) do nothing;
--
-- ============================================================================

create table if not exists public.premium_entitlements (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table public.premium_entitlements enable row level security;

drop policy if exists "premium_entitlements_select_own" on public.premium_entitlements;
create policy "premium_entitlements_select_own"
  on public.premium_entitlements for select
  using (user_id = auth.uid());

grant select on public.premium_entitlements to authenticated;

-- Replaces the earlier player-facing market_riders policy: a normal player
-- may read an 'available' FREE rider, or a PREMIUM rider only while they
-- hold a premium_entitlements row, or a rider they personally acquired
-- (any tier, any status — their own acquisition history). A free player's
-- Supabase client asking directly for tier='premium' rows gets zero back
-- from this policy, regardless of what the app layer does — the DB is the
-- authoritative gate, not just the /transfers tab UI.
drop policy if exists "market_riders_select_available" on public.market_riders;
create policy "market_riders_select_available"
  on public.market_riders for select
  using (
    acquired_by_player_id = auth.uid()
    or (
      status = 'available'
      and (
        tier = 'free'
        or exists (select 1 from public.premium_entitlements pe where pe.user_id = auth.uid())
      )
    )
  );

-- Every player market query filters by (season_id, tier, status) first —
-- this composite index covers that exactly. Additional single-column
-- indexes back the Premium advanced filters (country/archetype/age/
-- potential) and sorting.
create index if not exists market_riders_season_tier_status_idx
  on public.market_riders (season_id, tier, status);
create index if not exists market_riders_country_idx on public.market_riders (country_name);
create index if not exists market_riders_archetype_idx on public.market_riders (inferred_archetype);
create index if not exists market_riders_age_idx on public.market_riders (age);
create index if not exists market_riders_potential_idx on public.market_riders (potential);

-- Name search (Premium "Hľadať jazdca...") uses ILIKE '%text%', which a
-- plain B-tree index cannot accelerate — trigram indexes are what make that
-- fast at thousands of rows. pg_trgm ships with Supabase/Postgres, just not
-- enabled by default.
create extension if not exists pg_trgm;
create index if not exists market_riders_first_name_trgm_idx
  on public.market_riders using gin (first_name gin_trgm_ops);
create index if not exists market_riders_surname_trgm_idx
  on public.market_riders using gin (surname gin_trgm_ops);

-- ============================================================================
-- Race Results / Rankings V1.
--
-- No race ever simulates and writes a result yet — packages/race-engine
-- exists and can simulate a stage, but nothing in this app currently calls
-- it or persists its output. This table is the landing spot for whenever
-- that pipeline is built (a race-processing job/action would insert one row
-- per rider per finished tour); until then it stays empty and the Rebríčky
-- (Rankings) page correctly shows its "not available yet" empty state,
-- rather than any invented number. `points` is computed application-side
-- from `position` via lib/ranking/scoring.ts (pointsForPosition) at the
-- moment a result is recorded — never derived again at read time, so the
-- scoring formula can change later without rewriting history.
--
-- tour_id is a plain text id with no foreign key, same rationale as
-- tour_registrations.tour_id above (tours are static app content, not a
-- DB table).
-- ============================================================================

create table if not exists public.race_results (
  id           uuid primary key default gen_random_uuid(),
  season_id    text not null,
  tour_id      text not null,
  rider_id     uuid not null references public.riders (id) on delete cascade,
  position     int  not null check (position > 0),
  points       int  not null check (points >= 0),
  recorded_at  timestamptz not null default now(),
  unique (season_id, tour_id, rider_id)
);

alter table public.race_results enable row level security;

-- Results are public race information (like a start list), so any
-- authenticated player may read every result, not just their own rider's.
drop policy if exists "race_results_select_all" on public.race_results;
create policy "race_results_select_all"
  on public.race_results for select
  using (true);

-- No player-facing write path exists (nothing simulates a race yet) — only
-- an admin can insert/update/delete, same defense-in-depth pattern as
-- market_riders_admin_all, ready for whatever future job records results.
drop policy if exists "race_results_admin_all" on public.race_results;
create policy "race_results_admin_all"
  on public.race_results for all
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

grant select, insert, update, delete on public.race_results to authenticated;

create index if not exists race_results_season_rider_idx
  on public.race_results (season_id, rider_id);
create index if not exists race_results_season_position_idx
  on public.race_results (season_id, position);

create index if not exists riders_first_name_trgm_idx
  on public.riders using gin (first_name gin_trgm_ops);
create index if not exists riders_surname_trgm_idx
  on public.riders using gin (surname gin_trgm_ops);

-- Per-season aggregation the Rankings ("Jazdci") page reads directly —
-- SUM(points)/wins/podiums per rider, computed fresh from race_results on
-- every query, never a second persisted "current points" number that could
-- drift out of sync with the underlying results.
--
-- Deliberately WITHOUT security_invoker: public.riders' own RLS
-- (riders_select_own) only lets a player see their own rider plus AI
-- fillers — an invoker-rights view would silently show an incomplete,
-- wrong leaderboard (everyone else's real riders missing) instead of a
-- real one. Running with the view owner's rights bypasses that row-level
-- restriction for this query only, which is safe here specifically
-- because the view's column list is fixed and never includes anything
-- beyond public identity + aggregated results — no attributes, potential,
-- trainability, condition, or any other hidden field is selectable through
-- it no matter who queries it. This is the same "leak-proof window"
-- pattern as a public leaderboard in any RLS-based app: row-level security
-- stays strict on the base table; the view is the one deliberate, narrow
-- exception, scoped by its column list rather than by row visibility.
create or replace view public.rider_rankings as
select
  rr.season_id,
  rr.rider_id,
  r.first_name,
  r.surname,
  r.country_name,
  r.country_iso2,
  r.age,
  sum(rr.points)::int as points,
  count(*) filter (where rr.position = 1)::int as wins,
  count(*) filter (where rr.position <= 3)::int as podiums,
  count(*)::int as races,
  min(rr.position)::int as best_position
from public.race_results rr
join public.riders r on r.id = rr.rider_id
group by rr.season_id, rr.rider_id, r.first_name, r.surname, r.country_name, r.country_iso2, r.age;

grant select on public.rider_rankings to authenticated;

-- ============================================================================
-- Zázemie (Team Facilities) V1.
--
-- One row per player, one level column per building — a normal player has
-- exactly one rider today (see riders.player_id UNIQUE), so "team" facilities
-- are keyed by player_id directly rather than a fictitious team_id; nothing
-- in this project has a teams table to reference (see the chat report).
--
-- Levels are NOT client-writable through ordinary RLS. League caps and the
-- admin/dev bypass must never be client-trusted (explicit requirement), and
-- this project never uses a service-role key, so the only trustworthy place
-- to enforce "at most +1, never above the computed cap" is a Postgres
-- function that runs with elevated rights while still checking auth.uid()
-- itself — the same `security definer` pattern already used by
-- handle_new_user() above, just the second use of it in this file. A normal
-- authenticated player has NO direct INSERT/UPDATE grant on this table at
-- all; every upgrade goes through public.upgrade_facility() below.
-- ============================================================================

create table if not exists public.player_facilities (
  player_id          uuid primary key references auth.users (id) on delete cascade,
  training_level     int not null default 1 check (training_level between 1 and 5),
  recovery_level     int not null default 1 check (recovery_level between 1 and 5),
  scouting_level     int not null default 1 check (scouting_level between 1 and 5),
  technical_level    int not null default 1 check (technical_level between 1 and 5),
  team_center_level  int not null default 1 check (team_center_level between 1 and 5),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.player_facilities enable row level security;

drop policy if exists "player_facilities_select_own" on public.player_facilities;
create policy "player_facilities_select_own"
  on public.player_facilities for select
  using (player_id = auth.uid());

-- Existing players (rows already in profiles/riders before this migration
-- ran) get an explicit L1-everywhere row here, so getMyFacilities() never
-- has to guess a default for someone who signed up before Zázemie existed.
-- New players get their row lazily, the same on-conflict-do-nothing way,
-- the first time upgrade_facility() runs for them — see below.
insert into public.player_facilities (player_id)
select id from public.profiles
on conflict (player_id) do nothing;

-- League caps mirror lib/leagues.ts maxFacilityLevel() exactly — keep the
-- two in sync by hand; this is intentionally simple SQL, not a foreign
-- table, to match this project's existing all-inline-SQL style.
create or replace function public.upgrade_facility(p_facility text)
returns public.player_facilities
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id  uuid := auth.uid();
  v_is_admin   boolean;
  v_league     text;
  v_league_cap int;
  v_row        public.player_facilities;
  v_current    int;
  v_cap        int;
  v_new_row    public.player_facilities;
begin
  if v_player_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_facility not in ('training', 'recovery', 'scouting', 'technical', 'team_center') then
    raise exception 'invalid_facility';
  end if;

  select exists(select 1 from public.admin_users a where a.user_id = v_player_id) into v_is_admin;

  select league into v_league from public.profiles where id = v_player_id;
  v_league := coalesce(v_league, 'rookie');

  -- Rookie = 1 (upgrade disabled entirely — a stored level can never reach
  -- 2 while in Rookie, so an upgrade attempt always finds current >= cap and
  -- rejects). Mirrors lib/leagues.ts maxFacilityLevel() exactly — keep the
  -- two in sync by hand, same as before.
  v_league_cap := case v_league
    when 'rookie' then 1
    when 'amateur' then 2
    when 'continental' then 3
    when 'pro' then 4
    when 'elite' then 5
    else 1
  end;
  -- Dev/admin server-side override (item 2/18): only admin_users rows grant
  -- this, checked here inside the function — never passed in by the caller.
  if v_is_admin then
    v_league_cap := 5;
  end if;

  insert into public.player_facilities (player_id)
  values (v_player_id)
  on conflict (player_id) do nothing;

  -- Row lock: a second concurrent call for the same player (double-click)
  -- blocks here until the first call's UPDATE commits, then re-reads the
  -- already-incremented row and correctly re-evaluates the cap — never two
  -- +1s landing on a stale read.
  select * into v_row from public.player_facilities where player_id = v_player_id for update;

  if p_facility = 'team_center' then
    v_current := v_row.team_center_level;
    v_cap := v_league_cap;
  else
    -- Other facilities may be at most one level above Team Center, and
    -- never above the league cap either — always the lower of the two.
    v_cap := least(v_league_cap, v_row.team_center_level + 1);
    v_current := case p_facility
      when 'training' then v_row.training_level
      when 'recovery' then v_row.recovery_level
      when 'scouting' then v_row.scouting_level
      when 'technical' then v_row.technical_level
    end;
  end if;

  if v_current >= 5 then
    raise exception 'facility_max_level';
  end if;
  if v_current >= v_cap then
    raise exception 'facility_cap_reached';
  end if;

  update public.player_facilities set
    training_level    = case when p_facility = 'training'    then v_current + 1 else training_level end,
    recovery_level    = case when p_facility = 'recovery'    then v_current + 1 else recovery_level end,
    scouting_level    = case when p_facility = 'scouting'    then v_current + 1 else scouting_level end,
    technical_level   = case when p_facility = 'technical'   then v_current + 1 else technical_level end,
    team_center_level = case when p_facility = 'team_center' then v_current + 1 else team_center_level end,
    updated_at = now()
  where player_id = v_player_id
  returning * into v_new_row;

  return v_new_row;
end;
$$;

grant execute on function public.upgrade_facility(text) to authenticated;

-- ============================================================================
-- Bike Condition V1 — tires/brakes/drivetrain per rider, 0-100. Overall
-- condition is a derived/display value (min of the three), never its own
-- persisted column, so it can't drift out of sync with the parts it
-- summarizes (see lib/facilities/bike.ts).
--
-- Read/write follow riders_select_own's own ownership rule (own rider or
-- AI filler) rather than duplicating a player_id column here — a rider's
-- bike belongs to whoever owns that rider. Writable by the owning player
-- directly (both wear-processing and service/repair currently run in the
-- player's own session, same as training's condition updates already do
-- on `riders` itself) — see the chat report for the one known gap this
-- leaves until Finance exists: a player could set their own bike back to
-- 100 without an enforced payment, since there is no ledger yet to debit.
-- ============================================================================

create table if not exists public.bike_condition (
  rider_id    uuid primary key references public.riders (id) on delete cascade,
  tires       int not null default 100 check (tires between 0 and 100),
  brakes      int not null default 100 check (brakes between 0 and 100),
  drivetrain  int not null default 100 check (drivetrain between 0 and 100),
  frame       int not null default 100 check (frame between 0 and 100),   -- added by 20261116_03
  wheels      int not null default 100 check (wheels between 0 and 100),  -- added by 20261116_03
  updated_at  timestamptz not null default now()
);

alter table public.bike_condition enable row level security;

drop policy if exists "bike_condition_select_own" on public.bike_condition;
create policy "bike_condition_select_own"
  on public.bike_condition for select
  using (exists (select 1 from public.riders r where r.id = bike_condition.rider_id and (r.player_id = auth.uid() or r.is_ai)));

drop policy if exists "bike_condition_upsert_own" on public.bike_condition;
create policy "bike_condition_upsert_own"
  on public.bike_condition for insert
  with check (exists (select 1 from public.riders r where r.id = bike_condition.rider_id and r.player_id = auth.uid()));

drop policy if exists "bike_condition_update_own" on public.bike_condition;
create policy "bike_condition_update_own"
  on public.bike_condition for update
  using (exists (select 1 from public.riders r where r.id = bike_condition.rider_id and r.player_id = auth.uid()));

-- The AI test peloton (generateTestPeloton(), admin-gated) inserts riders
-- with player_id null — the "own" insert policy above can never match
-- those rows, so it needs its own admin-only path, same pattern as every
-- other admin-bulk-insert in this file.
drop policy if exists "bike_condition_admin_all" on public.bike_condition;
create policy "bike_condition_admin_all"
  on public.bike_condition for all
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

grant select, insert, update on public.bike_condition to authenticated;

-- Backfill: every rider that exists before this migration ran starts at a
-- full 100/100/100 bike, same as a freshly generated one would.
insert into public.bike_condition (rider_id)
select id from public.riders
on conflict (rider_id) do nothing;

-- Tour wear processing (lib/facilities/bike.ts) needs to know which
-- registrations it has already applied wear for, the same
-- applied_at-guards-idempotency idea training_plans already uses.
alter table public.tour_registrations add column if not exists wear_processed_at timestamptz;

-- ============================================================================
-- Season Aging V1.
--
-- Global, idempotent "a season has fully ended" marker. `season_number` is a
-- separate int column (not just parsed from season_id) so the caller can
-- efficiently ask "what's the highest season already processed?" with a
-- correct numeric MAX(), not a lexicographic string comparison ("season-10"
-- would otherwise sort before "season-9").
--
-- Nothing about *which* season is "next" lives in this table or in SQL —
-- lib/calendar/season.ts (pure, time-based) remains the single source of
-- truth for season/week arithmetic; this table only remembers which season
-- numbers have already had their end-of-season aging applied, so the same
-- transition can never run twice no matter how many concurrent requests,
-- tabs, or retries trigger it.
-- ============================================================================

create table if not exists public.season_transition_processing (
  season_id          text primary key,
  season_number      int not null,
  aging_processed_at timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index if not exists season_transition_processing_number_idx
  on public.season_transition_processing (season_number);

alter table public.season_transition_processing enable row level security;

-- Read-only, global state — any authenticated player may see which seasons
-- have been processed (useful for debugging, not sensitive). No player
-- (and no bare "authenticated" grant) can insert/update directly; the only
-- write path is process_season_aging() below.
drop policy if exists "season_transition_processing_select_all" on public.season_transition_processing;
create policy "season_transition_processing_select_all"
  on public.season_transition_processing for select
  using (true);

grant select on public.season_transition_processing to authenticated;

/**
 * Ages EVERY persistent rider that existed by the end of each fully-elapsed
 * season (real riders, AI fillers, and still-unsigned/available market
 * riders alike — 'acquired' market_riders rows are deliberately left
 * untouched: permanent historical snapshots of "age at time of signing",
 * not a live rider record), by exactly +1 per season, but only the FIRST
 * time each season number is ever claimed.
 *
 * SECURITY (see the chat report's audit — this function used to accept
 * p_season_id/p_season_number/p_cutoff as caller-supplied parameters,
 * which was a real vulnerability: any authenticated client could call this
 * RPC directly with a fabricated season_id and a far-future cutoff and age
 * the entire peloton repeatedly, once per fake season_id). It now takes
 * ZERO parameters and trusts NOTHING from the caller: "what season number
 * are we really in" and "when did each past season really end" are both
 * computed here, from now() and a hardcoded anchor/length (kept in sync by
 * hand with SEASON_ONE_START/SEASON_LENGTH_DAYS in
 * lib/calendar/season.ts — the same accepted duplication convention used
 * elsewhere in this file). A caller can trigger this function running at
 * all, but can never influence WHICH season it processes or WHAT cutoff it
 * uses — there is nothing left to pass in.
 *
 * `insert ... on conflict (season_id) do nothing returning` is the atomic
 * race-safe claim per season: if two requests race for the same season,
 * only one gets a row back from RETURNING and performs the UPDATEs.
 * Repeated/concurrent calls are cheap no-ops once caught up — no
 * additional rate-limiting is needed given full idempotency.
 *
 * This is the second security-definer function in this file (after
 * handle_new_user()) — needed because this project never uses a
 * service-role key, so a DB function is the only way to perform a
 * cross-player bulk update that no single player's own RLS would permit.
 */
create or replace function public.process_season_aging()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  -- Kept in sync by hand with lib/calendar/season.ts.
  v_anchor            date := date '2026-08-17'; -- SEASON_ONE_START
  v_season_length_days int  := 70;                -- SEASON_LENGTH_DAYS (TOTAL_WEEKS=10 * WEEK_LENGTH_DAYS=7)
  v_days_since_start  int;
  v_current_season    int;
  v_last_processed    int;
  v_season_number     int;
  v_season_id         text;
  v_season_start      date;
  v_next_season_start date;
  v_claimed_id        text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_days_since_start := greatest(0, current_date - v_anchor);
  v_current_season := floor(v_days_since_start::numeric / v_season_length_days) + 1;

  select coalesce(max(season_number), 0) into v_last_processed from public.season_transition_processing;

  for v_season_number in (v_last_processed + 1)..(v_current_season - 1) loop
    v_season_id := 'season-' || v_season_number;
    v_season_start := v_anchor + (v_season_number - 1) * v_season_length_days;
    -- "Existed by the end of this season" = created before the NEXT
    -- season's start — avoids any ambiguity about time-of-day on the
    -- season's literal last calendar day.
    v_next_season_start := v_season_start + v_season_length_days;

    insert into public.season_transition_processing (season_id, season_number)
    values (v_season_id, v_season_number)
    on conflict (season_id) do nothing
    returning season_id into v_claimed_id;

    if v_claimed_id is not null then
      -- Real player riders and AI fillers alike (no is_ai filter).
      update public.riders set age = age + 1 where created_at < v_next_season_start;

      -- Still-unsold market riders age too — only 'available' ones (see
      -- this function's own doc comment for why 'acquired' rows don't).
      update public.market_riders set age = age + 1
      where generated_at < v_next_season_start and status = 'available';
    end if;
  end loop;
end;
$$;

revoke all on function public.process_season_aging() from public;
grant execute on function public.process_season_aging() to authenticated;

-- ============================================================================
-- Training Progress Accumulator V1.
--
-- Replaces "round the raw weekly progress and throw the remainder away"
-- with a real per-rider-per-attribute running total, so a facility bonus's
-- fractional effect (e.g. raw 1.52 vs 1.60) is never silently lost — it
-- carries into the next training instead. No row needs to exist ahead of
-- time for every attribute: process_training_plan() below inserts one
-- on-demand (progress 0) the first time that rider/attribute pair is
-- trained, per the request's own "0 progress can be implicit" allowance.
-- ============================================================================

create table if not exists public.rider_training_progress (
  rider_id    uuid not null references public.riders (id) on delete cascade,
  attribute   text not null,
  progress    numeric not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (rider_id, attribute)
);

alter table public.rider_training_progress enable row level security;

drop policy if exists "rider_training_progress_select_own" on public.rider_training_progress;
create policy "rider_training_progress_select_own"
  on public.rider_training_progress for select
  using (exists (select 1 from public.riders r where r.id = rider_training_progress.rider_id and (r.player_id = auth.uid() or r.is_ai)));

-- No direct INSERT/UPDATE grant for `authenticated` at all — every write
-- goes through process_training_plan() below, same "security-definer is
-- the only write path" pattern as player_facilities/upgrade_facility().
grant select on public.rider_training_progress to authenticated;

-- ============================================================================
-- Development Model V2 — canonical SQL helpers (see the chat report).
--
-- REPLACES the old potentialCeiling()/potentialRoomFactor() model: Potential
-- (55-95) is no longer converted into an implied per-attribute ceiling.
-- These pure functions are the authoritative implementation
-- process_training_plan() calls; lib/rider/score.ts is the unit-tested TS
-- MIRROR, kept in sync by hand — see score.test.ts's canary tests. If you
-- change any anchor point here, update lib/rider/score.ts's matching
-- anchors too (and vice versa).
--
-- No security-definer needed — pure math, no table access, no privileged
-- data, safe for any authenticated caller to invoke directly.
-- ============================================================================

/** The 7 canonical Performance attributes — kept in sync by hand with lib/training/config.ts's PERFORMANCE_FOCUS. */
create or replace function public.is_performance_attribute(p_attr text)
returns boolean
language sql
immutable
as $$
  select p_attr = any(array['climbing','hills','flat','sprint','timeTrial','endurance','acceleration']);
$$;

/** 200 for the 7 Performance attributes (career ceiling), 160 for everything else (Tactics/Technique/experience — unchanged canonical scale). */
create or replace function public.attribute_clamp_max(p_attr text)
returns int
language sql
immutable
as $$
  select case when public.is_performance_attribute(p_attr) then 200 else 160 end;
$$;

/** Local attribute difficulty — depends ONLY on the attribute's own current value, never on Potential. Mirrors lib/rider/score.ts's localAttributeFactor(). */
create or replace function public.local_attribute_factor(p_current_value numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_current_value >= 200 then 0
    when p_current_value <= 140 then 1.00
    when p_current_value <= 150 then 1.00 + (p_current_value - 140) / 10 * (0.90 - 1.00)
    when p_current_value <= 160 then 0.90 + (p_current_value - 150) / 10 * (0.80 - 0.90)
    when p_current_value <= 170 then 0.80 + (p_current_value - 160) / 10 * (0.65 - 0.80)
    when p_current_value <= 180 then 0.65 + (p_current_value - 170) / 10 * (0.45 - 0.65)
    when p_current_value <= 190 then 0.45 + (p_current_value - 180) / 10 * (0.25 - 0.45)
    else 0.25 + (p_current_value - 190) / 10 * (0.00 - 0.25)
  end;
$$;

/** Mean of exactly the 7 canonical Performance attributes. Never includes Potential/Tactics/Technique/experience/condition. Mirrors lib/rider/score.ts's overallPerformance(). */
create or replace function public.overall_performance(p_attrs jsonb)
returns numeric
language sql
immutable
as $$
  select (
    (p_attrs ->> 'climbing')::numeric + (p_attrs ->> 'hills')::numeric + (p_attrs ->> 'flat')::numeric
    + (p_attrs ->> 'sprint')::numeric + (p_attrs ->> 'timeTrial')::numeric + (p_attrs ->> 'endurance')::numeric
    + (p_attrs ->> 'acceleration')::numeric
  ) / 7;
$$;

/** Overall Potential factor — depends on overallPerformance + Potential, never a single attribute in isolation. Mirrors lib/rider/score.ts's overallPotentialFactor() exactly (same anchors, same 0.85 swing, same POTENTIAL_MIN/MAX=55/95). */
create or replace function public.overall_potential_factor(p_overall numeric, p_potential numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  v_base numeric;
  v_weight numeric;
  v_ease numeric;
  v_delta numeric;
begin
  if p_overall <= 140 then
    v_base := 1.00; v_weight := 0.00;
  elsif p_overall <= 150 then
    v_base := 1.00 + (p_overall - 140) / 10 * (0.85 - 1.00); v_weight := 0.00 + (p_overall - 140) / 10 * (0.30 - 0.00);
  elsif p_overall <= 160 then
    v_base := 0.85 + (p_overall - 150) / 10 * (0.75 - 0.85); v_weight := 0.30 + (p_overall - 150) / 10 * (0.45 - 0.30);
  elsif p_overall <= 170 then
    v_base := 0.75 + (p_overall - 160) / 10 * (0.60 - 0.75); v_weight := 0.45 + (p_overall - 160) / 10 * (0.65 - 0.45);
  elsif p_overall <= 180 then
    v_base := 0.60 + (p_overall - 170) / 10 * (0.45 - 0.60); v_weight := 0.65 + (p_overall - 170) / 10 * (0.80 - 0.65);
  elsif p_overall <= 190 then
    v_base := 0.45 + (p_overall - 180) / 10 * (0.32 - 0.45); v_weight := 0.80 + (p_overall - 180) / 10 * (0.90 - 0.80);
  else
    v_base := 0.32 + (least(p_overall, 200) - 190) / 10 * (0.22 - 0.32); v_weight := 0.90 + (least(p_overall, 200) - 190) / 10 * (1.00 - 0.90);
  end if;

  v_ease := greatest(0, least(1, (p_potential - 55) / 40)); -- POTENTIAL_MIN=55, POTENTIAL_MAX=95
  v_delta := (v_ease - 0.5) * 2 * v_weight * v_base * 0.85;
  return greatest(0.08, least(1, v_base + v_delta));
end;
$$;

/** developmentRoomFactor — replaces the old potentialRoomFactor() slot in the training formula. Hard 0 at/above 200 (never a further accumulator gain); floor 0.05 below that. Mirrors lib/rider/score.ts's developmentRoomFactor(). */
create or replace function public.development_room_factor(p_current_value numeric, p_overall numeric, p_potential numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_current_value >= 200 then 0
    else greatest(0.05, public.local_attribute_factor(p_current_value) * public.overall_potential_factor(p_overall, p_potential))
  end;
$$;

grant execute on function public.is_performance_attribute(text) to authenticated;
grant execute on function public.attribute_clamp_max(text) to authenticated;
grant execute on function public.local_attribute_factor(numeric) to authenticated;
grant execute on function public.overall_performance(jsonb) to authenticated;
grant execute on function public.overall_potential_factor(numeric, numeric) to authenticated;
grant execute on function public.development_room_factor(numeric, numeric, numeric) to authenticated;

-- ============================================================================
-- Unified Weekly Training V1 — canonical SQL helpers (see the chat report,
-- "UNIFIED WEEKLY TRAINING V1"). Mirror lib/training/config.ts's
-- TECHNICAL_FOCUS and lib/training/readiness.ts exactly — kept in sync by
-- hand, see the TS side's own canary tests.
-- ============================================================================

/** The 6 canonical Technique attributes selectable as a Technical training focus — kept in sync by hand with lib/training/config.ts's TECHNICAL_FOCUS. */
create or replace function public.is_technical_attribute(p_attr text)
returns boolean
language sql
immutable
as $$
  select p_attr = any(array['descending','bikeHandling','cornering','packRiding','wetHandling','roughSurface']);
$$;

/** Readiness V1 — mirrors lib/training/readiness.ts's readinessScore(). */
create or replace function public.readiness_score(p_energy numeric, p_fatigue numeric)
returns numeric
language sql
immutable
as $$
  select (p_energy + (100 - p_fatigue)) / 2;
$$;

/** Hidden training-effectiveness multiplier — never shown to the player directly. Mirrors lib/training/readiness.ts's readinessEffectiveness(). */
create or replace function public.readiness_effectiveness(p_score numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_score >= 80 then 1.00
    when p_score >= 60 then 0.95
    when p_score >= 40 then 0.85
    when p_score >= 20 then 0.70
    else 0.50
  end;
$$;

grant execute on function public.is_technical_attribute(text) to authenticated;
grant execute on function public.readiness_score(numeric, numeric) to authenticated;
grant execute on function public.readiness_effectiveness(numeric) to authenticated;

/**
 * Processes ONE training plan atomically: computes the AUTHORITATIVE raw
 * training growth entirely from trusted, persisted server-side data,
 * accumulates it for the primary attribute (and its fixed secondary, if
 * any — Performance only) via existingProgress + rawGrowth ->
 * floor(total/threshold), applies the resulting whole-number gain(s) to
 * riders.attributes, computes and applies this week's Energy/Fatigue
 * change (training cost + passive recovery, Recovery-Center-boosted), and
 * stamps training_plans.applied_at — all inside one function invocation,
 * so a crash or a concurrent duplicate call can never leave
 * attribute/condition/progress/applied_at out of sync with each other.
 *
 * UNIFIED WEEKLY TRAINING V1 (see the chat report): a plan is exactly one
 * of two types, read from training_plans.week_type — never a parameter:
 *   - 'performance': focus is one of the 7 Performance attributes;
 *     intensity (light/normal/hard) selects a SESSION COUNT (1/2/3 — see
 *     v_session_count below), which REPLACES the old flat
 *     v_intensity_multiplier (1.0/1.5/2.0): stacking both would have been a
 *     6x Light-to-Hard spread instead of the intended 3x. Uses the full
 *     Development Model V2 formula (developmentRoomFactor, facility bonus,
 *     Performance-only secondary gain).
 *   - 'technical': focus is one of the 6 Technique attributes (see
 *     public.is_technical_attribute() above); intensity is NOT
 *     player-facing (always exactly 1 session — v_session_count is not
 *     even used) and the row's `intensity` column value is ignored
 *     entirely (it holds a neutral placeholder — see
 *     lib/training/repository.ts's TECHNICAL_INTENSITY_PLACEHOLDER). No
 *     facility bonus, no Development Model V2 (Technique stays on the
 *     canonical 100-160 scale — Potential does not govern it), no
 *     secondary gain at all. HARD-CAPPED at +1 integer point per processed
 *     plan (v_max_primary_gain) regardless of how much accumulator
 *     progress is available — any progress beyond that stays banked in
 *     rider_training_progress for a future week, never lost, never
 *     applied as +2/+3 in one week.
 *
 * READINESS (item 17): before this week's OWN training cost/recovery are
 * applied, readiness is computed from the rider's CURRENT (pre-processing)
 * Energy/Fatigue and used as a multiplier on raw growth for BOTH training
 * types — poor condition can only slow training down, never speed it past
 * the Technical weekly cap (item 18) or bypass Development Model V2. Never
 * player-facing as a number — see public.readiness_score()/
 * readiness_effectiveness() above.
 *
 * CONDITION (item 25: SQL now owns condition, not the TS app — see
 * lib/training/engine.ts's own doc comment for the security rationale this
 * closes): training cost (ENERGY_COST/FATIGUE_GAIN, Performance; a fixed
 * smaller cost, Technical) is applied ONCE per plan, never once per
 * session (item 13). Passive weekly recovery (item 15) — one baseline
 * amount per non-training day of the week, boosted by the Recovery
 * Center's RECOVERY_MULTIPLIER (item 16, applied ONLY to recovery, never to
 * the training cost itself or to raw growth) — is added in the same pass.
 * Hard is never blocked by low readiness (item 19) — it just costs more and
 * trains less effectively.
 *
 * SECURITY (see the chat report's audit — THREE rounds of fixes across two
 * chat sessions):
 *   Round 1 closed: no ownership check; primary_attr trusted as a
 *   parameter; secondary_attr unrestricted.
 *   Round 2 closed: raw growth itself (p_primary_raw/p_secondary_raw) used
 *   to be caller-supplied and merely clamped to a ceiling — clamping does
 *   NOT stop an authenticated player from calling this RPC directly
 *   (bypassing the Next.js app entirely — this project has no
 *   service-role key, so the app's own server code has NO more trust than
 *   any other authenticated caller hitting the same RPC via PostgREST).
 *   Fixed by taking ONLY p_plan_id — every input the growth formula needs
 *   is read here from persisted rows the caller cannot influence.
 *   Round 3 (this version, Unified Weekly Training V1) closes a gap this
 *   very refactor could otherwise have reintroduced: condition
 *   (Energy/Fatigue) used to be computed in TS (lib/training/engine.ts)
 *   and written via a plain, non-security-definer `update` on
 *   riders.condition — reachable by any authenticated client with an
 *   ARBITRARY condition value (RLS only checks row ownership, not column
 *   values). Rather than extend that same pattern with new
 *   readiness/recovery logic, condition is now computed and written HERE,
 *   inside this security-definer function, alongside attributes — the
 *   same trusted-only write path, closing the gap instead of growing it.
 *   lib/rider/repository.ts's old applyConditionResult() has been removed.
 *
 *   This duplicates lib/training/growth.ts + condition.ts + readiness.ts's
 *   formulas into SQL — a real, accepted tradeoff, not an oversight:
 *   keeping the two in sync by hand is the SAME convention already used
 *   throughout this file for ATTR_MIN/MAX, league caps, and the
 *   training-bonus percentages. If you change BASE_TRAINING/
 *   TECHNICAL_BASE, SESSION_COUNT, trainabilityFactor/
 *   professionalismFactor/ageFactor, trainingCenterMultiplier()/recoveryCenterMultiplier() (Training Center V1 FINAL age-banded model — see the chat report "TRAINING CENTER CLOSE-OUT"),
 *   SECONDARY_ATTRIBUTE, ENERGY_COST/FATIGUE_GAIN/TECHNICAL_ENERGY_COST/
 *   TECHNICAL_FATIGUE_GAIN, PERFORMANCE_RECOVERY_DAYS/
 *   TECHNICAL_RECOVERY_DAYS/RECOVERY_DAY_ENERGY/RECOVERY_DAY_FATIGUE, the
 *   readiness bands, or anything in lib/rider/score.ts (Development Model
 *   V2) in the TS layer, you MUST update the matching SQL here too — see
 *   growth.test.ts's, score.test.ts's, and secondaryMapping.test.ts's
 *   canary tests.
 *
 * Idempotency: the plan row is locked (`for update`) and its applied_at
 * checked FIRST; if already applied, this returns immediately with
 * already_processed = true and mutates nothing — a second concurrent call
 * (two tabs, a retry) can never double-consume progress, double-apply a
 * gain, or double-apply a condition change.
 */
-- CRITICAL: `create or replace function` does NOT replace a function with
-- a DIFFERENT parameter signature — Postgres overloads by signature, so
-- without this explicit DROP, the OLD 5-parameter version (which trusted
-- caller-supplied raw growth values — see this function's own doc comment
-- for why that was a real vulnerability) would remain callable via RPC
-- side-by-side with the new, hardened 1-parameter version forever.
drop function if exists public.process_training_plan(uuid, numeric, text, numeric, numeric);

create or replace function public.process_training_plan(p_plan_id uuid)
returns table(primary_gain int, secondary_gain int, already_processed boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  -- ---- Kept in sync by hand with lib/training/config.ts ----
  v_base_training constant numeric := 3;
  v_technical_base constant numeric := 2.0;
  v_secondary_gain_share constant numeric := 0.35;
  v_threshold constant numeric := 12; -- TRAINING_GAIN_THRESHOLD
  v_technical_weekly_gain_cap constant int := 1; -- TECHNICAL_WEEKLY_GAIN_CAP
  v_recovery_day_energy constant numeric := 5; -- RECOVERY_DAY_ENERGY
  v_recovery_day_fatigue constant numeric := 4; -- RECOVERY_DAY_FATIGUE
  v_technical_energy_cost constant numeric := 5; -- TECHNICAL_ENERGY_COST
  v_technical_fatigue_gain constant numeric := 5; -- TECHNICAL_FATIGUE_GAIN
  v_technical_recovery_days constant numeric := 6; -- TECHNICAL_RECOVERY_DAYS
  -- ---- Kept in sync by hand with lib/facilities/config.ts (trainingCenterMultiplier()/recoveryCenterMultiplier()) ----
  -- ---- Kept in sync by hand with lib/leagues.ts (maxFacilityLevel) ----

  v_plan_applied_at timestamptz;
  v_rider_id uuid;
  v_week_type text;
  v_focus text;
  v_intensity text;
  v_primary_attr text;
  v_secondary_attr text;

  v_owner_id uuid;
  v_age int;
  v_trainability numeric;
  v_professionalism numeric;
  v_potential numeric;
  v_attrs jsonb;
  v_condition jsonb;
  v_condition_previous jsonb;
  v_current_value numeric;

  v_league text;
  v_is_admin boolean;
  v_league_cap int;
  v_team_center_level int;
  v_team_center_cap int;
  v_training_cap int;
  v_training_level int;
  v_recovery_level int;
  v_effective_training_level int;
  v_effective_recovery_level int;
  v_training_bonus numeric;
  v_recovery_multiplier numeric;

  v_session_count numeric;
  v_trainability_factor numeric;
  v_professionalism_factor numeric;
  v_age_factor numeric;
  v_facility_multiplier numeric;
  v_base numeric;

  v_energy numeric;
  v_fatigue numeric;
  v_readiness_score numeric;
  v_readiness_factor numeric;
  v_training_energy_cost numeric;
  v_training_fatigue_gain numeric;
  v_recovery_days numeric;
  v_energy_delta numeric;
  v_fatigue_delta numeric;
  v_new_energy numeric;
  v_new_fatigue numeric;

  v_overall_performance numeric;
  v_secondary_current_value numeric;
  v_primary_dev_factor numeric;
  v_secondary_dev_factor numeric;
  v_primary_at_cap boolean;
  v_max_primary_gain int;

  v_primary_raw numeric;
  v_secondary_raw numeric;
  v_progress numeric;
  v_total numeric;
  v_uncapped_gain int;
  v_primary_gain int := 0;
  v_secondary_gain int := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select applied_at, rider_id, week_type, focus, intensity
  into v_plan_applied_at, v_rider_id, v_week_type, v_focus, v_intensity
  from public.training_plans
  where id = p_plan_id
  for update;

  if v_rider_id is null then
    raise exception 'plan_not_found';
  end if;

  select player_id, age, attributes, condition, trainability, professionalism, potential
  into v_owner_id, v_age, v_attrs, v_condition, v_trainability, v_professionalism, v_potential
  from public.riders
  where id = v_rider_id
  for update;

  if v_owner_id is null or v_owner_id <> auth.uid() then
    raise exception 'not_owner';
  end if;

  if v_plan_applied_at is not null then
    return query select 0, 0, true;
    return;
  end if;

  -- Primary attribute comes ONLY from the plan's own persisted focus —
  -- never a parameter. week_type decides which focus family is valid; a
  -- plan can never mix technical+climbing or performance+descending
  -- (item 24) because saveTrainingPlan() already validates this pairing at
  -- save time — this is defense-in-depth, not the only guard.
  v_primary_attr := v_focus;

  if v_week_type = 'performance' then
    if not public.is_performance_attribute(v_primary_attr) then
      raise exception 'invalid_focus';
    end if;

    -- Fixed SECONDARY_ATTRIBUTE mapping — kept in sync by hand with
    -- lib/training/config.ts. Never accepted as a parameter. Performance
    -- training must never be a backdoor way to raise Tactics/Technique —
    -- every one of these 7 active pairs is Performance-only (see
    -- lib/training/secondaryMapping.test.ts).
    v_secondary_attr := case v_primary_attr
      when 'climbing' then 'endurance'
      when 'hills' then 'acceleration'
      when 'flat' then 'timeTrial'
      when 'sprint' then 'acceleration'
      when 'timeTrial' then 'endurance'
      when 'endurance' then 'timeTrial'
      when 'acceleration' then 'sprint'
      else null
    end;

    v_session_count := case v_intensity
      when 'light' then 1
      when 'normal' then 2
      when 'hard' then 3
      else 1
    end;
    v_training_energy_cost := case v_intensity when 'light' then 5 when 'normal' then 10 when 'hard' then 15 else 5 end;
    v_training_fatigue_gain := case v_intensity when 'light' then 5 when 'normal' then 10 when 'hard' then 18 else 5 end;
    v_recovery_days := case v_intensity when 'light' then 6 when 'normal' then 5 when 'hard' then 4 else 6 end;
    v_max_primary_gain := 2147483647; -- effectively unlimited — Performance has no weekly cap
  elsif v_week_type = 'technical' then
    if not public.is_technical_attribute(v_primary_attr) then
      raise exception 'invalid_focus';
    end if;

    -- Technical training has no secondary gain at all (item 10) — trains
    -- ONLY the chosen focus.
    v_secondary_attr := null;

    v_session_count := 1; -- always exactly 1 technical session/week — no player-facing intensity
    v_training_energy_cost := v_technical_energy_cost;
    v_training_fatigue_gain := v_technical_fatigue_gain;
    v_recovery_days := v_technical_recovery_days;
    v_max_primary_gain := v_technical_weekly_gain_cap; -- item 9: hard cap, +1/week, never more
  else
    raise exception 'invalid_week_type';
  end if;

  -- ---- Effective Training Center / Recovery Center level (mirrors lib/facilities/capMath.ts — both share the same "otherCap" formula) ----
  select coalesce(training_level, 1), coalesce(recovery_level, 1), coalesce(team_center_level, 1)
  into v_training_level, v_recovery_level, v_team_center_level
  from public.player_facilities
  where player_id = auth.uid();
  v_training_level := coalesce(v_training_level, 1);
  v_recovery_level := coalesce(v_recovery_level, 1);
  v_team_center_level := coalesce(v_team_center_level, 1);

  select exists(select 1 from public.admin_users a where a.user_id = auth.uid()) into v_is_admin;

  select league into v_league from public.profiles where id = auth.uid();
  v_league := coalesce(v_league, 'rookie');

  v_league_cap := case v_league
    when 'rookie' then 1
    when 'amateur' then 2
    when 'continental' then 3
    when 'pro' then 4
    when 'elite' then 5
    else 1
  end;
  if v_is_admin then
    v_league_cap := 5;
  end if;

  v_team_center_cap := least(5, v_team_center_level + 1);
  v_training_cap := least(v_league_cap, v_team_center_cap); -- shared "otherCap" — training/recovery/scouting/technical all use this same cap
  v_effective_training_level := least(v_training_level, v_training_cap);
  v_effective_recovery_level := least(v_recovery_level, v_training_cap);

  -- Training Center V1 FINAL model (see the chat report, "TRAINING CENTER
  -- CLOSE-OUT"): age-banded, non-additive. Each level unlocks ONE more age
  -- band's bonus but a rider only ever gets the single multiplier for
  -- their OWN age band — bands never stack/sum even at L5, where the
  -- facility has "unlocked" all four. Mirrors
  -- lib/facilities/config.ts's trainingCenterMultiplier() exactly (own age
  -- bands: 17-23/24-27/28-31/32+ — deliberately DIFFERENT boundaries from
  -- v_age_factor's biological-age bands above; this is a separate
  -- multiplicative layer, never merged with it — item 3 of the request).
  v_training_bonus := case
    when v_age <= 23 then case when v_effective_training_level >= 2 then 0.15 else 0 end
    when v_age <= 27 then case when v_effective_training_level >= 3 then 0.10 else 0 end
    when v_age <= 31 then case when v_effective_training_level >= 4 then 0.05 else 0 end
    else case when v_effective_training_level >= 5 then 0.03 else 0 end
  end;
  -- Technical training deliberately has NO facility multiplier at all
  -- (item 5/11 — Training Center only ever affects Performance training;
  -- Technical Center, a completely different facility, is the one that
  -- handles bike technical risk/service — never confuse the two).
  v_facility_multiplier := case when v_week_type = 'performance' then 1 + v_training_bonus else 1 end;

  v_recovery_multiplier := case v_effective_recovery_level
    when 1 then 1.00
    when 2 then 1.05
    when 3 then 1.10
    when 4 then 1.15
    when 5 then 1.20
    else 1.00
  end;

  -- ---- Readiness (item 17) — computed from CURRENT (pre-this-week) condition, never from a client-supplied value ----
  v_energy := (v_condition ->> 'energy')::numeric;
  v_fatigue := (v_condition ->> 'fatigue')::numeric;
  v_readiness_score := public.readiness_score(v_energy, v_fatigue);
  v_readiness_factor := public.readiness_effectiveness(v_readiness_score);

  v_trainability_factor := 0.5 + v_trainability / 200;
  v_professionalism_factor := 0.8 + v_professionalism / 500;
  v_age_factor := case
    when v_age <= 19 then 1.30
    when v_age <= 22 then 1.20
    when v_age <= 25 then 1.10
    when v_age <= 28 then 1.00
    when v_age <= 31 then 0.80
    when v_age <= 34 then 0.55
    else 0.30
  end;

  v_current_value := (v_attrs ->> v_primary_attr)::numeric;

  if v_week_type = 'performance' then
    -- ---- Development Model V2 (see the chat report) ----
    -- Replaces potentialCeiling()/potentialRoomFactor(): Potential no
    -- longer implies a per-attribute ceiling. developmentRoomFactor is
    -- keyed to overallPerformance (all 7 Performance attributes together)
    -- and the attribute's own value — see
    -- public.development_room_factor() above. NOT used for Technical
    -- training at all (item 11) — Technique has no Performance ceiling.
    v_overall_performance := public.overall_performance(v_attrs);
    v_primary_at_cap := v_current_value >= 200;

    -- base = everything EXCEPT the development-room factor — shared
    -- between primary and secondary, exactly mirroring
    -- lib/training/growth.ts's calculatePerformanceRawGrowth() `base`.
    -- v_session_count REPLACES the old flat intensity multiplier.
    v_base := v_base_training * v_session_count * v_trainability_factor
      * v_professionalism_factor * v_age_factor * v_facility_multiplier * v_readiness_factor;

    if v_primary_at_cap then
      -- At/above the Performance ceiling (200), no further accumulator
      -- progress at all for this attribute — not just raw=0.
      v_primary_dev_factor := 0;
      v_primary_raw := 0;
    else
      v_primary_dev_factor := public.development_room_factor(v_current_value, v_overall_performance, v_potential);
      v_primary_raw := greatest(0, v_base * v_primary_dev_factor);
    end if;

    -- Secondary attribute: developmentRoomFactor only applies when it is
    -- ALSO one of the 7 Performance attributes — which, since Weekly
    -- Training V1 is Performance-only, is always true for every reachable
    -- focus today (see growth.ts's own doc comment on why the
    -- non-Performance branch is kept as a safety net, not removed).
    if v_secondary_attr is not null then
      v_secondary_current_value := (v_attrs ->> v_secondary_attr)::numeric;
      if public.is_performance_attribute(v_secondary_attr) then
        if v_secondary_current_value >= 200 then
          v_secondary_dev_factor := 0;
        else
          v_secondary_dev_factor := public.development_room_factor(v_secondary_current_value, v_overall_performance, v_potential);
        end if;
      else
        v_secondary_dev_factor := 1;
      end if;
      v_secondary_raw := greatest(0, v_base * v_secondary_dev_factor * v_secondary_gain_share);
    end if;
  else
    -- ---- Technical training (item 11): no facility bonus, no
    -- Development Model V2 — Technique stays on the canonical 100-160
    -- scale, Potential does not govern it. No secondary gain at all
    -- (v_secondary_attr is null, so the secondary block below no-ops).
    v_primary_at_cap := false;
    v_base := v_technical_base * v_trainability_factor * v_professionalism_factor * v_age_factor * v_readiness_factor;
    v_primary_raw := greatest(0, v_base);
  end if;

  -- Primary attribute — v_primary_attr came from training_plans.focus
  -- itself, never from a caller-supplied parameter. At the Performance
  -- ceiling, skip progress accumulation entirely (not merely add a raw=0
  -- no-op) — there is nothing left to accumulate. v_max_primary_gain caps
  -- Technical training at +1/week (item 9) — any progress beyond that
  -- stays banked in rider_training_progress for a future week, never lost.
  if not v_primary_at_cap then
    insert into public.rider_training_progress (rider_id, attribute, progress)
    values (v_rider_id, v_primary_attr, 0)
    on conflict (rider_id, attribute) do nothing;

    select progress into v_progress
    from public.rider_training_progress
    where rider_id = v_rider_id and attribute = v_primary_attr
    for update;

    -- 0.000000001 epsilon before floor(): mirrors accumulateProgress()'s own
    -- (see lib/training/accumulator.ts) — guards the same threshold-crossing
    -- edge as there, kept in sync by hand.
    v_total := v_progress + v_primary_raw;
    v_uncapped_gain := floor((v_total + 0.000000001) / v_threshold)::int;
    v_primary_gain := least(v_uncapped_gain, v_max_primary_gain);

    update public.rider_training_progress
    set progress = greatest(0, v_total - v_primary_gain * v_threshold), updated_at = now()
    where rider_id = v_rider_id and attribute = v_primary_attr;

    if v_primary_gain > 0 then
      v_attrs := jsonb_set(v_attrs, array[v_primary_attr],
        to_jsonb(least(public.attribute_clamp_max(v_primary_attr), greatest(100, (v_attrs ->> v_primary_attr)::int + v_primary_gain))));
    end if;
  end if;

  -- Secondary attribute (optional, Performance only) — its own, separate
  -- progress row: never a shared pool with the primary attribute. Same
  -- ceiling-skip rule applies if the secondary itself is a Performance
  -- attribute already at 200. Never capped (Technical training never
  -- reaches here — v_secondary_attr is always null for it).
  if v_secondary_attr is not null and v_secondary_dev_factor is distinct from 0 then
    insert into public.rider_training_progress (rider_id, attribute, progress)
    values (v_rider_id, v_secondary_attr, 0)
    on conflict (rider_id, attribute) do nothing;

    select progress into v_progress
    from public.rider_training_progress
    where rider_id = v_rider_id and attribute = v_secondary_attr
    for update;

    v_total := v_progress + v_secondary_raw;
    v_secondary_gain := floor((v_total + 0.000000001) / v_threshold)::int;

    update public.rider_training_progress
    set progress = greatest(0, v_total - v_secondary_gain * v_threshold), updated_at = now()
    where rider_id = v_rider_id and attribute = v_secondary_attr;

    if v_secondary_gain > 0 then
      v_attrs := jsonb_set(v_attrs, array[v_secondary_attr],
        to_jsonb(least(public.attribute_clamp_max(v_secondary_attr), greatest(100, (v_attrs ->> v_secondary_attr)::int + v_secondary_gain))));
    end if;
  end if;

  -- ---- Condition (item 25: SQL owns this now, not the TS app) ----
  -- Training cost applied ONCE per plan (item 13/14); passive weekly
  -- recovery (item 15) boosted by the Recovery Center multiplier (item 16,
  -- applied only here, never to raw growth or to the training cost).
  v_energy_delta := -v_training_energy_cost + v_recovery_days * v_recovery_day_energy * v_recovery_multiplier;
  v_fatigue_delta := v_training_fatigue_gain - v_recovery_days * v_recovery_day_fatigue * v_recovery_multiplier;
  -- Rounding audit (see the chat report, "REGENERAČNÉ CENTRUM CLOSE-OUT",
  -- item 12): the Recovery Center multiplier (1.05-1.20) makes this
  -- genuinely fractional (e.g. 5 * 5 * 1.15 = 28.75) — round the new total
  -- to the nearest whole number FIRST, THEN clamp, exactly mirroring
  -- lib/training/condition.ts's applyConditionDelta() (Math.round then
  -- clamp100) so the two can never diverge — see recoveryCenterSql.test.ts.
  v_new_energy := least(100, greatest(0, round(v_energy + v_energy_delta)));
  v_new_fatigue := least(100, greatest(0, round(v_fatigue + v_fatigue_delta)));

  v_condition_previous := v_condition;
  v_condition := jsonb_set(jsonb_set(v_condition, '{energy}', to_jsonb(v_new_energy)), '{fatigue}', to_jsonb(v_new_fatigue));

  update public.riders set attributes = v_attrs, condition = v_condition, condition_previous = v_condition_previous where id = v_rider_id;

  update public.training_plans set
    applied_at = now(),
    primary_attr = v_primary_attr,
    primary_gain = v_primary_gain,
    secondary_attr = v_secondary_attr,
    secondary_gain = case when v_secondary_attr is not null then v_secondary_gain else null end
  where id = p_plan_id;

  return query select v_primary_gain, v_secondary_gain, false;
end;
$$;

revoke all on function public.process_training_plan(uuid) from public;
grant execute on function public.process_training_plan(uuid) to authenticated;


-- >>>>>>>> 20261114_01_tour_season_registrations.sql (same text as supabase/migrations/20261114_01_tour_season_registrations.sql) >>>>>>>>
-- ============================================================================
-- Migration 01 — game season in SQL + per-season Tour registrations (2026-11-14).
--
-- (a) public.season_id_at() / current_season_id(): the game season computed
--     from SERVER time inside the database, so a client can never name its own
--     season. Kept in sync by hand with lib/calendar/season.ts (anchor and
--     season length below); a unit test (lib/calendar/seasonSql.test.ts)
--     compares them so they cannot drift silently.
--
-- (b) data/tourSchedule.ts is now a weekly template repeated every season, so
--     a registration must say WHICH season it belongs to; otherwise last
--     season's pick would show as selected in every later season. Every row
--     that exists today was made in season 1 (no Tours were scheduled for any
--     later season) — hence the one-time 'season-1' backfill. Afterwards the
--     column defaults to the CURRENT season and the INSERT policy only accepts
--     the current season, so it cannot be forged either.
--
-- Idempotent: safe to run again. Run BEFORE migrations 02 and 03.
-- ============================================================================

-- Season 1 began on this UTC Monday; every season is 10 weeks = 70 days.
create or replace function public.season_id_at(p_at timestamptz)
returns text
language sql
immutable
as $$
  select 'season-' || (greatest(0, floor(((p_at at time zone 'utc')::date - date '2026-08-17')::numeric / 70)) + 1)::int;
$$;

create or replace function public.current_season_id()
returns text
language sql
stable
as $$
  select public.season_id_at(now());
$$;

grant execute on function public.season_id_at(timestamptz) to authenticated;
grant execute on function public.current_season_id() to authenticated;

alter table public.tour_registrations add column if not exists season_id text not null default 'season-1';
alter table public.tour_registrations alter column season_id set default public.current_season_id();

alter table public.tour_registrations drop constraint if exists tour_registrations_rider_id_tour_id_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tour_registrations'::regclass
      and conname = 'tour_registrations_rider_season_tour_key'
  ) then
    alter table public.tour_registrations
      add constraint tour_registrations_rider_season_tour_key unique (rider_id, season_id, tour_id);
  end if;
end $$;

-- A player may only register their OWN rider, and only for the current season.
drop policy if exists "tour_registrations_insert_own_rider" on public.tour_registrations;
create policy "tour_registrations_insert_own_rider"
  on public.tour_registrations for insert
  with check (
    season_id = public.current_season_id()
    and exists (
      select 1 from public.riders r
      where r.id = rider_id and r.player_id = auth.uid()
    )
  );


-- >>>>>>>> 20261114_02_league_divisions.sql (same text as supabase/migrations/20261114_02_league_divisions.sql) >>>>>>>>
-- ============================================================================
-- Leagues & sub-leagues V1 (2026-11-14).
--
-- Five leagues (rookie, amateur, continental, pro, elite). A league is split
-- into sub-leagues of at most 50 players, labelled "<League> 1.<number>"
-- (Rookie 1.1, Rookie 1.2, ...). Sub-leagues of one league are equal; the
-- number carries no strength. Elite has at most one sub-league (Elite 1.1).
-- Sub-leagues are created on demand, never in advance.
--
-- A player is a member of exactly ONE sub-league (league_memberships.player_id
-- is the primary key). A later promotion/relegation is a plain UPDATE of
-- division_id/league (the triggers below keep the counters and
-- profiles.league in step) — no such rule exists yet.
--
-- Capacity is protected twice: (1) allocate_league_division() serialises per
-- league with an advisory lock, (2) league_divisions.member_count is bounded
-- by a CHECK, so even a direct INSERT can never exceed capacity.
--
-- profiles.league stays (existing readers: facilities, caps). It is now kept
-- in sync from the membership by a trigger.
--
-- The season a player joins is NEVER taken from the client: it is the current
-- game season computed in the database (public.current_season_id(), migration
-- 01). Run AFTER migration 01 and BEFORE migration 03. Idempotent.
-- NOT run automatically on any database.
-- ============================================================================

create table if not exists public.league_divisions (
  id           uuid primary key default gen_random_uuid(),
  league       text not null check (league in ('rookie', 'amateur', 'continental', 'pro', 'elite')),
  -- Sub-league number: the "n" in "<League> 1.<n>".
  number       int  not null check (number >= 1),
  capacity     int  not null default 50 check (capacity >= 1),
  -- Maintained by league_membership_count_trg(); bounded by the CHECK below.
  member_count int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (league, number),
  -- Target of the composite FK from league_memberships (league <-> division).
  unique (id, league),
  constraint league_divisions_member_count_range check (member_count >= 0 and member_count <= capacity),
  constraint league_divisions_elite_single check (league <> 'elite' or number = 1)
);

create table if not exists public.league_memberships (
  player_id        uuid primary key references auth.users (id) on delete cascade,
  division_id      uuid not null,
  league           text not null,
  -- The GLOBAL season the player joined in (lib/calendar/season.ts), not a
  -- personal "season 1".
  joined_season_id text not null check (joined_season_id ~ '^season-[0-9]+$'),
  joined_at        timestamptz not null default now(),
  -- Ties the stored league to the sub-league's league: cannot disagree.
  foreign key (division_id, league) references public.league_divisions (id, league)
);

create index if not exists league_memberships_division_idx on public.league_memberships (division_id);

-- ---- Row-level security: reads only; every write goes through the functions below.
alter table public.league_divisions enable row level security;
alter table public.league_memberships enable row level security;

drop policy if exists "league_divisions_select_all" on public.league_divisions;
create policy "league_divisions_select_all"
  on public.league_divisions for select
  to authenticated
  using (true);

drop policy if exists "league_memberships_select_own" on public.league_memberships;
create policy "league_memberships_select_own"
  on public.league_memberships for select
  to authenticated
  using (auth.uid() = player_id);

revoke all on public.league_divisions from anon, authenticated;
revoke all on public.league_memberships from anon, authenticated;
grant select on public.league_divisions to authenticated;
grant select on public.league_memberships to authenticated;

-- ---- Counter + profile sync triggers.
create or replace function public.league_membership_count_trg()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.league_divisions set member_count = member_count - 1 where id = old.division_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    -- Violates league_divisions_member_count_range (23514) when the sub-league is full.
    update public.league_divisions set member_count = member_count + 1 where id = new.division_id;
  end if;
  return null;
end;
$$;

drop trigger if exists league_membership_count on public.league_memberships;
create trigger league_membership_count
  after insert or delete or update of division_id on public.league_memberships
  for each row execute function public.league_membership_count_trg();

create or replace function public.league_membership_sync_profile_trg()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set league = new.league where id = new.player_id and league is distinct from new.league;
  return null;
end;
$$;

drop trigger if exists league_membership_sync_profile on public.league_memberships;
create trigger league_membership_sync_profile
  after insert or update of league on public.league_memberships
  for each row execute function public.league_membership_sync_profile_trg();

-- ---- Allocation (internal; not granted to any client role).
-- Returns a sub-league of p_league with a free spot: the lowest-numbered one,
-- else a newly created one. Must run inside the transaction that then inserts
-- the membership: the advisory lock lives until that transaction ends, so two
-- concurrent allocations for one league are strictly serial.
create or replace function public.allocate_league_division(p_league text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id   uuid;
  v_next int;
begin
  if p_league is null or p_league not in ('rookie', 'amateur', 'continental', 'pro', 'elite') then
    raise exception 'invalid_league' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('league_division_alloc:' || p_league));

  select id into v_id
  from public.league_divisions
  where league = p_league and member_count < capacity
  order by number
  limit 1
  for update;
  if v_id is not null then
    return v_id;
  end if;

  -- Elite never gets a second sub-league.
  if p_league = 'elite' and exists (select 1 from public.league_divisions where league = 'elite') then
    raise exception 'elite_full' using errcode = 'P0001';
  end if;

  select coalesce(max(number), 0) + 1 into v_next from public.league_divisions where league = p_league;
  insert into public.league_divisions (league, number) values (p_league, v_next) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.allocate_league_division(text) from public;

-- ---- A new (or not-yet-placed) player joins Rookie, always as THEMSELVES
-- (auth.uid()), always into Rookie, always in the current game season: the
-- function takes no parameters, so a client cannot forge league, sub-league,
-- player or season. Idempotent: an existing member just gets their current
-- sub-league back.
-- Earlier draft took the season from the client; that signature must not exist.
drop function if exists public.assign_my_league_division(text);

create or replace function public.assign_my_league_division()
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_player   uuid := auth.uid();
  v_existing uuid;
  v_div      uuid;
begin
  if v_player is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select division_id into v_existing from public.league_memberships where player_id = v_player;
  if v_existing is not null then
    return v_existing;
  end if;

  v_div := public.allocate_league_division('rookie');

  -- ON CONFLICT: two simultaneous calls for the same player cannot create two
  -- memberships (PK) and the loser does not touch the counter.
  insert into public.league_memberships (player_id, division_id, league, joined_season_id)
  values (v_player, v_div, 'rookie', public.current_season_id())
  on conflict (player_id) do nothing;

  return (select division_id from public.league_memberships where player_id = v_player);
end;
$$;

revoke all on function public.assign_my_league_division() from public;
grant execute on function public.assign_my_league_division() to authenticated;

-- ---- Members of the CALLER's own sub-league: public identity only, no
-- attributes or hidden fields. Same deliberate "no security_invoker" pattern
-- as rider_rankings (riders' own RLS would hide everyone else); the WHERE
-- clause scopes it to the caller's sub-league.
create or replace view public.division_members as
select
  m.division_id,
  d.league,
  d.number,
  r.id as rider_id,
  r.first_name,
  r.surname,
  r.country_name,
  r.country_iso2,
  r.age,
  m.joined_at
from public.league_memberships m
join public.league_divisions d on d.id = m.division_id
join public.riders r on r.player_id = m.player_id
where m.division_id = (select division_id from public.league_memberships where player_id = auth.uid());

grant select on public.division_members to authenticated;

-- ---- One-time placement of existing (test) accounts, oldest first. They keep
-- their stored league when valid, else Rookie. 'season-1' is a placeholder:
-- game progress is reset before the official launch.
do $$
declare
  r record;
  v_league text;
  v_div uuid;
begin
  for r in
    select p.id, p.league
    from public.profiles p
    where not exists (select 1 from public.league_memberships m where m.player_id = p.id)
    order by p.created_at, p.id
  loop
    v_league := case when r.league in ('rookie', 'amateur', 'continental', 'pro', 'elite') then r.league else 'rookie' end;
    v_div := public.allocate_league_division(v_league);
    insert into public.league_memberships (player_id, division_id, league, joined_season_id)
    values (r.id, v_div, v_league, 'season-1')
    on conflict (player_id) do nothing;
  end loop;
end $$;


-- >>>>>>>> 20261114_03_profiles_lockdown.sql (same text as supabase/migrations/20261114_03_profiles_lockdown.sql) >>>>>>>>
-- ============================================================================
-- Migration 03 — security fix O-007: a player must not edit their own league.
--
-- Before: `grant select, update on public.profiles to authenticated` plus an
-- UPDATE policy without WITH CHECK let any signed-in player run
-- `update profiles set league = 'elite'` from the browser (the anon key is
-- public). league_memberships (migration 02) is now the authoritative source
-- of a player's league and sub-league; profiles.league is a copy kept in sync
-- by the trusted trigger league_membership_sync_profile.
--
-- After:
--   * players may UPDATE only display_name and preferred_language (their own row);
--   * no INSERT/DELETE for players at all (rows come from the sign-up trigger);
--   * a guard trigger rejects any change of league made by a client role, so a
--     future careless GRANT cannot reopen the hole;
--   * the sync trigger (SECURITY DEFINER, runs as the table owner) still works.
--
-- Run AFTER migrations 01 and 02. Idempotent. The app never writes profiles
-- from the browser (sign-up passes metadata to the trigger), so nothing breaks.
-- ============================================================================

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, preferred_language) on public.profiles to authenticated;

create or replace function public.profiles_league_guard_trg()
returns trigger
language plpgsql
as $$
begin
  -- current_user is the CALLER's role for a plain UPDATE (a client) and the
  -- function owner inside the SECURITY DEFINER sync trigger.
  if new.league is distinct from old.league and current_user in ('anon', 'authenticated') then
    raise exception 'league_is_server_controlled' using errcode = '42501';
  end if;
  if new.id is distinct from old.id and current_user in ('anon', 'authenticated') then
    raise exception 'profile_id_is_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_league_guard on public.profiles;
create trigger profiles_league_guard
  before update on public.profiles
  for each row execute function public.profiles_league_guard_trg();

-- >>>>>>>> 20261115_01_training_security.sql (same text as supabase/migrations/20261115_01_training_security.sql) >>>>>>>>
-- ============================================================================
-- Migration 04 — Training V1, stage E1: security (audit O-008 + hidden values).
--
-- Closes the holes found in docs/TRAINING_AUDIT.md §4. Training mechanics,
-- growth formula and the accumulator threshold (12) are NOT changed: the body
-- of the old process_training_plan() is moved verbatim into an internal
-- function; only its identity source (the rider's owner instead of auth.uid())
-- and a "week really ended" guard differ.
--
--  1. training_plans: players can only READ. All writes go through
--     save_my_training_plan() (identity from auth.uid(), season + plannable week
--     from the SQL calendar, focus/type/intensity validated). A plan that is
--     already processed can never be changed; an unprocessed one may be
--     overwritten exactly as before (decision D11 still open).
--  2. Processing: apply_training_plan_internal() is not callable by any client
--     role. process_my_due_training() (owner only) applies only plans whose
--     week has ended according to the SQL calendar, oldest first, atomically
--     (one transaction, plan + rider rows locked) and idempotently.
--     The old public.process_training_plan(uuid) is dropped.
--  3. riders: no client INSERT/UPDATE/DELETE. Starter rider is created by
--     create_my_starter_rider() (range-validated), AI fillers by the
--     admin-only admin_generate_ai_riders(). Client SELECT is limited to the
--     public columns — potential, trainability, professionalism and recovery
--     are no longer readable through the API; the player gets only the 1-5
--     estimates via my_rider_estimates(). Admins read raw rows through
--     admin_list_riders().
--  4. rider_training_progress: no client access at all (the app never reads it;
--     it would let a player infer hidden values).
--
-- Run AFTER migrations 01-03. Idempotent. Deploy SQL FIRST, then the new code
-- (the old code cannot write riders/training_plans any more).
-- ============================================================================

-- ---- SQL calendar (mirrors lib/calendar/season.ts; anchor 2026-08-17, 10 weeks = 70 days) ----
create or replace function public.season_id_at(p_at timestamptz)
returns text
language sql
immutable
as $$
  select 'season-' || (greatest(0, floor(((p_at at time zone 'utc')::date - date '2026-08-17')::numeric / 70)) + 1)::int;
$$;

create or replace function public.current_season_id()
returns text
language sql
stable
as $$
  select public.season_id_at(now());
$$;

-- 1-based season number of "season-N" (null for anything else).
create or replace function public.season_number_of(p_season_id text)
returns int
language sql
immutable
as $$
  select case when p_season_id ~ '^season-[0-9]{1,6}$' then substring(p_season_id from 8)::int end;
$$;

-- Week 1..10 of the season that contains p_at (before the anchor: week 1).
create or replace function public.season_week_at(p_at timestamptz)
returns int
language sql
immutable
as $$
  select (mod(greatest(0, (p_at at time zone 'utc')::date - date '2026-08-17'), 70) / 7) + 1;
$$;

-- True only when the plan's week has fully ended: an earlier season, or an earlier week of the current one.
create or replace function public.training_plan_is_due(p_season_id text, p_week int, p_at timestamptz)
returns boolean
language sql
immutable
as $$
  select coalesce(public.season_number_of(p_season_id), 0) >= 1
     and p_week between 1 and 10
     and (
       public.season_number_of(p_season_id) < public.season_number_of(public.season_id_at(p_at))
       or (public.season_number_of(p_season_id) = public.season_number_of(public.season_id_at(p_at))
           and p_week < public.season_week_at(p_at))
     );
$$;

grant execute on function public.season_id_at(timestamptz) to authenticated;
grant execute on function public.current_season_id() to authenticated;
grant execute on function public.season_number_of(text) to authenticated;
grant execute on function public.season_week_at(timestamptz) to authenticated;
grant execute on function public.training_plan_is_due(text, int, timestamptz) to authenticated;

-- ---- 1. Plans: read-only for clients, one trusted write path ----
drop policy if exists "training_plans_insert_own" on public.training_plans;
drop policy if exists "training_plans_update_own" on public.training_plans;
drop policy if exists "training_plans_delete_own" on public.training_plans;
revoke all on public.training_plans from anon, authenticated;
grant select on public.training_plans to authenticated;

create or replace function public.save_my_training_plan(p_week_type text, p_focus text, p_intensity text)
returns public.training_plans
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rider uuid;
  v_intensity text;
  v_season text;
  v_week int;
  v_row public.training_plans;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_rider from public.riders where player_id = v_uid;
  if v_rider is null then
    raise exception 'no_rider';
  end if;

  -- Type / focus / intensity pairing — mirrors lib/training/repository.ts (kept in sync by hand).
  if p_week_type = 'performance' then
    if p_intensity is null or p_intensity not in ('light', 'normal', 'hard')
       or p_focus is null or not public.is_performance_attribute(p_focus) then
      raise exception 'invalid_focus';
    end if;
    v_intensity := p_intensity;
  elsif p_week_type = 'technical' then
    if p_focus is null or not public.is_technical_attribute(p_focus) then
      raise exception 'invalid_focus';
    end if;
    v_intensity := 'light'; -- TECHNICAL_INTENSITY_PLACEHOLDER, no player-facing meaning
  else
    raise exception 'invalid_focus';
  end if;

  -- The ONE plannable week: current week + 1, capped at the season's last week (never client-supplied).
  v_season := public.current_season_id();
  v_week := least(public.season_week_at(now()) + 1, 10);

  -- A processed plan is history. The WHERE keeps that true even if processing
  -- commits between statements (the row lock makes this re-check the latest row).
  insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity)
  values (v_rider, v_season, v_week, p_week_type, p_focus, v_intensity)
  on conflict (rider_id, season_id, week_number) do update
    set week_type = excluded.week_type,
        focus = excluded.focus,
        intensity = excluded.intensity,
        updated_at = now()
    where public.training_plans.applied_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'already_processed';
  end if;
  return v_row;
end;
$$;

revoke all on function public.save_my_training_plan(text, text, text) from public, anon, authenticated;
grant execute on function public.save_my_training_plan(text, text, text) to authenticated;

-- ---- 2. Processing ----
drop function if exists public.process_training_plan(uuid);

create or replace function public.apply_training_plan_internal(p_plan_id uuid)
returns table(primary_gain int, secondary_gain int, already_processed boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  -- ---- Kept in sync by hand with lib/training/config.ts ----
  v_base_training constant numeric := 3;
  v_technical_base constant numeric := 2.0;
  v_secondary_gain_share constant numeric := 0.35;
  v_threshold constant numeric := 12; -- TRAINING_GAIN_THRESHOLD
  v_technical_weekly_gain_cap constant int := 1; -- TECHNICAL_WEEKLY_GAIN_CAP
  v_recovery_day_energy constant numeric := 5; -- RECOVERY_DAY_ENERGY
  v_recovery_day_fatigue constant numeric := 4; -- RECOVERY_DAY_FATIGUE
  v_technical_energy_cost constant numeric := 5; -- TECHNICAL_ENERGY_COST
  v_technical_fatigue_gain constant numeric := 5; -- TECHNICAL_FATIGUE_GAIN
  v_technical_recovery_days constant numeric := 6; -- TECHNICAL_RECOVERY_DAYS
  -- ---- Kept in sync by hand with lib/facilities/config.ts (trainingCenterMultiplier()/recoveryCenterMultiplier()) ----
  -- ---- Kept in sync by hand with lib/leagues.ts (maxFacilityLevel) ----

  v_plan_applied_at timestamptz;
  v_plan_season text;
  v_plan_week int;
  v_rider_id uuid;
  v_week_type text;
  v_focus text;
  v_intensity text;
  v_primary_attr text;
  v_secondary_attr text;

  v_owner_id uuid;
  v_age int;
  v_trainability numeric;
  v_professionalism numeric;
  v_potential numeric;
  v_attrs jsonb;
  v_condition jsonb;
  v_condition_previous jsonb;
  v_current_value numeric;

  v_league text;
  v_is_admin boolean;
  v_league_cap int;
  v_team_center_level int;
  v_team_center_cap int;
  v_training_cap int;
  v_training_level int;
  v_recovery_level int;
  v_effective_training_level int;
  v_effective_recovery_level int;
  v_training_bonus numeric;
  v_recovery_multiplier numeric;

  v_session_count numeric;
  v_trainability_factor numeric;
  v_professionalism_factor numeric;
  v_age_factor numeric;
  v_facility_multiplier numeric;
  v_base numeric;

  v_energy numeric;
  v_fatigue numeric;
  v_readiness_score numeric;
  v_readiness_factor numeric;
  v_training_energy_cost numeric;
  v_training_fatigue_gain numeric;
  v_recovery_days numeric;
  v_energy_delta numeric;
  v_fatigue_delta numeric;
  v_new_energy numeric;
  v_new_fatigue numeric;

  v_overall_performance numeric;
  v_secondary_current_value numeric;
  v_primary_dev_factor numeric;
  v_secondary_dev_factor numeric;
  v_primary_at_cap boolean;
  v_max_primary_gain int;

  v_primary_raw numeric;
  v_secondary_raw numeric;
  v_progress numeric;
  v_total numeric;
  v_uncapped_gain int;
  v_primary_gain int := 0;
  v_secondary_gain int := 0;
begin
  select applied_at, rider_id, week_type, focus, intensity, season_id, week_number
  into v_plan_applied_at, v_rider_id, v_week_type, v_focus, v_intensity, v_plan_season, v_plan_week
  from public.training_plans
  where id = p_plan_id
  for update;

  if v_rider_id is null then
    raise exception 'plan_not_found';
  end if;

  select player_id, age, attributes, condition, trainability, professionalism, potential
  into v_owner_id, v_age, v_attrs, v_condition, v_trainability, v_professionalism, v_potential
  from public.riders
  where id = v_rider_id
  for update;

  -- AI fillers (no owner) never train; everything below keys off the rider's
  -- OWNER, never off the caller (this function has no caller identity).
  if v_owner_id is null then
    raise exception 'no_owner';
  end if;

  -- Idempotency: already processed => no-op (the plan row is locked above, so
  -- a concurrent run waits here and then sees applied_at set).
  if v_plan_applied_at is not null then
    return query select 0, 0, true;
    return;
  end if;

  -- Only a plan whose week has really ended (per the SQL calendar) may be applied.
  if not public.training_plan_is_due(v_plan_season, v_plan_week, now()) then
    raise exception 'not_due';
  end if;

  -- Primary attribute comes ONLY from the plan's own persisted focus —
  -- never a parameter. week_type decides which focus family is valid; a
  -- plan can never mix technical+climbing or performance+descending
  -- (item 24) because saveTrainingPlan() already validates this pairing at
  -- save time — this is defense-in-depth, not the only guard.
  v_primary_attr := v_focus;

  if v_week_type = 'performance' then
    if not public.is_performance_attribute(v_primary_attr) then
      raise exception 'invalid_focus';
    end if;

    -- Fixed SECONDARY_ATTRIBUTE mapping — kept in sync by hand with
    -- lib/training/config.ts. Never accepted as a parameter. Performance
    -- training must never be a backdoor way to raise Tactics/Technique —
    -- every one of these 7 active pairs is Performance-only (see
    -- lib/training/secondaryMapping.test.ts).
    v_secondary_attr := case v_primary_attr
      when 'climbing' then 'endurance'
      when 'hills' then 'acceleration'
      when 'flat' then 'timeTrial'
      when 'sprint' then 'acceleration'
      when 'timeTrial' then 'endurance'
      when 'endurance' then 'timeTrial'
      when 'acceleration' then 'sprint'
      else null
    end;

    v_session_count := case v_intensity
      when 'light' then 1
      when 'normal' then 2
      when 'hard' then 3
      else 1
    end;
    v_training_energy_cost := case v_intensity when 'light' then 5 when 'normal' then 10 when 'hard' then 15 else 5 end;
    v_training_fatigue_gain := case v_intensity when 'light' then 5 when 'normal' then 10 when 'hard' then 18 else 5 end;
    v_recovery_days := case v_intensity when 'light' then 6 when 'normal' then 5 when 'hard' then 4 else 6 end;
    v_max_primary_gain := 2147483647; -- effectively unlimited — Performance has no weekly cap
  elsif v_week_type = 'technical' then
    if not public.is_technical_attribute(v_primary_attr) then
      raise exception 'invalid_focus';
    end if;

    -- Technical training has no secondary gain at all (item 10) — trains
    -- ONLY the chosen focus.
    v_secondary_attr := null;

    v_session_count := 1; -- always exactly 1 technical session/week — no player-facing intensity
    v_training_energy_cost := v_technical_energy_cost;
    v_training_fatigue_gain := v_technical_fatigue_gain;
    v_recovery_days := v_technical_recovery_days;
    v_max_primary_gain := v_technical_weekly_gain_cap; -- item 9: hard cap, +1/week, never more
  else
    raise exception 'invalid_week_type';
  end if;

  -- ---- Effective Training Center / Recovery Center level (mirrors lib/facilities/capMath.ts — both share the same "otherCap" formula) ----
  select coalesce(training_level, 1), coalesce(recovery_level, 1), coalesce(team_center_level, 1)
  into v_training_level, v_recovery_level, v_team_center_level
  from public.player_facilities
  where player_id = v_owner_id;
  v_training_level := coalesce(v_training_level, 1);
  v_recovery_level := coalesce(v_recovery_level, 1);
  v_team_center_level := coalesce(v_team_center_level, 1);

  select exists(select 1 from public.admin_users a where a.user_id = v_owner_id) into v_is_admin;

  select league into v_league from public.profiles where id = v_owner_id;
  v_league := coalesce(v_league, 'rookie');

  v_league_cap := case v_league
    when 'rookie' then 1
    when 'amateur' then 2
    when 'continental' then 3
    when 'pro' then 4
    when 'elite' then 5
    else 1
  end;
  if v_is_admin then
    v_league_cap := 5;
  end if;

  v_team_center_cap := least(5, v_team_center_level + 1);
  v_training_cap := least(v_league_cap, v_team_center_cap); -- shared "otherCap" — training/recovery/scouting/technical all use this same cap
  v_effective_training_level := least(v_training_level, v_training_cap);
  v_effective_recovery_level := least(v_recovery_level, v_training_cap);

  -- Training Center V1 FINAL model (see the chat report, "TRAINING CENTER
  -- CLOSE-OUT"): age-banded, non-additive. Each level unlocks ONE more age
  -- band's bonus but a rider only ever gets the single multiplier for
  -- their OWN age band — bands never stack/sum even at L5, where the
  -- facility has "unlocked" all four. Mirrors
  -- lib/facilities/config.ts's trainingCenterMultiplier() exactly (own age
  -- bands: 17-23/24-27/28-31/32+ — deliberately DIFFERENT boundaries from
  -- v_age_factor's biological-age bands above; this is a separate
  -- multiplicative layer, never merged with it — item 3 of the request).
  v_training_bonus := case
    when v_age <= 23 then case when v_effective_training_level >= 2 then 0.15 else 0 end
    when v_age <= 27 then case when v_effective_training_level >= 3 then 0.10 else 0 end
    when v_age <= 31 then case when v_effective_training_level >= 4 then 0.05 else 0 end
    else case when v_effective_training_level >= 5 then 0.03 else 0 end
  end;
  -- Technical training deliberately has NO facility multiplier at all
  -- (item 5/11 — Training Center only ever affects Performance training;
  -- Technical Center, a completely different facility, is the one that
  -- handles bike technical risk/service — never confuse the two).
  v_facility_multiplier := case when v_week_type = 'performance' then 1 + v_training_bonus else 1 end;

  v_recovery_multiplier := case v_effective_recovery_level
    when 1 then 1.00
    when 2 then 1.05
    when 3 then 1.10
    when 4 then 1.15
    when 5 then 1.20
    else 1.00
  end;

  -- ---- Readiness (item 17) — computed from CURRENT (pre-this-week) condition, never from a client-supplied value ----
  v_energy := (v_condition ->> 'energy')::numeric;
  v_fatigue := (v_condition ->> 'fatigue')::numeric;
  v_readiness_score := public.readiness_score(v_energy, v_fatigue);
  v_readiness_factor := public.readiness_effectiveness(v_readiness_score);

  v_trainability_factor := 0.5 + v_trainability / 200;
  v_professionalism_factor := 0.8 + v_professionalism / 500;
  v_age_factor := case
    when v_age <= 19 then 1.30
    when v_age <= 22 then 1.20
    when v_age <= 25 then 1.10
    when v_age <= 28 then 1.00
    when v_age <= 31 then 0.80
    when v_age <= 34 then 0.55
    else 0.30
  end;

  v_current_value := (v_attrs ->> v_primary_attr)::numeric;

  if v_week_type = 'performance' then
    -- ---- Development Model V2 (see the chat report) ----
    -- Replaces potentialCeiling()/potentialRoomFactor(): Potential no
    -- longer implies a per-attribute ceiling. developmentRoomFactor is
    -- keyed to overallPerformance (all 7 Performance attributes together)
    -- and the attribute's own value — see
    -- public.development_room_factor() above. NOT used for Technical
    -- training at all (item 11) — Technique has no Performance ceiling.
    v_overall_performance := public.overall_performance(v_attrs);
    v_primary_at_cap := v_current_value >= 200;

    -- base = everything EXCEPT the development-room factor — shared
    -- between primary and secondary, exactly mirroring
    -- lib/training/growth.ts's calculatePerformanceRawGrowth() `base`.
    -- v_session_count REPLACES the old flat intensity multiplier.
    v_base := v_base_training * v_session_count * v_trainability_factor
      * v_professionalism_factor * v_age_factor * v_facility_multiplier * v_readiness_factor;

    if v_primary_at_cap then
      -- At/above the Performance ceiling (200), no further accumulator
      -- progress at all for this attribute — not just raw=0.
      v_primary_dev_factor := 0;
      v_primary_raw := 0;
    else
      v_primary_dev_factor := public.development_room_factor(v_current_value, v_overall_performance, v_potential);
      v_primary_raw := greatest(0, v_base * v_primary_dev_factor);
    end if;

    -- Secondary attribute: developmentRoomFactor only applies when it is
    -- ALSO one of the 7 Performance attributes — which, since Weekly
    -- Training V1 is Performance-only, is always true for every reachable
    -- focus today (see growth.ts's own doc comment on why the
    -- non-Performance branch is kept as a safety net, not removed).
    if v_secondary_attr is not null then
      v_secondary_current_value := (v_attrs ->> v_secondary_attr)::numeric;
      if public.is_performance_attribute(v_secondary_attr) then
        if v_secondary_current_value >= 200 then
          v_secondary_dev_factor := 0;
        else
          v_secondary_dev_factor := public.development_room_factor(v_secondary_current_value, v_overall_performance, v_potential);
        end if;
      else
        v_secondary_dev_factor := 1;
      end if;
      v_secondary_raw := greatest(0, v_base * v_secondary_dev_factor * v_secondary_gain_share);
    end if;
  else
    -- ---- Technical training (item 11): no facility bonus, no
    -- Development Model V2 — Technique stays on the canonical 100-160
    -- scale, Potential does not govern it. No secondary gain at all
    -- (v_secondary_attr is null, so the secondary block below no-ops).
    v_primary_at_cap := false;
    v_base := v_technical_base * v_trainability_factor * v_professionalism_factor * v_age_factor * v_readiness_factor;
    v_primary_raw := greatest(0, v_base);
  end if;

  -- Primary attribute — v_primary_attr came from training_plans.focus
  -- itself, never from a caller-supplied parameter. At the Performance
  -- ceiling, skip progress accumulation entirely (not merely add a raw=0
  -- no-op) — there is nothing left to accumulate. v_max_primary_gain caps
  -- Technical training at +1/week (item 9) — any progress beyond that
  -- stays banked in rider_training_progress for a future week, never lost.
  if not v_primary_at_cap then
    insert into public.rider_training_progress (rider_id, attribute, progress)
    values (v_rider_id, v_primary_attr, 0)
    on conflict (rider_id, attribute) do nothing;

    select progress into v_progress
    from public.rider_training_progress
    where rider_id = v_rider_id and attribute = v_primary_attr
    for update;

    -- 0.000000001 epsilon before floor(): mirrors accumulateProgress()'s own
    -- (see lib/training/accumulator.ts) — guards the same threshold-crossing
    -- edge as there, kept in sync by hand.
    v_total := v_progress + v_primary_raw;
    v_uncapped_gain := floor((v_total + 0.000000001) / v_threshold)::int;
    v_primary_gain := least(v_uncapped_gain, v_max_primary_gain);

    update public.rider_training_progress
    set progress = greatest(0, v_total - v_primary_gain * v_threshold), updated_at = now()
    where rider_id = v_rider_id and attribute = v_primary_attr;

    if v_primary_gain > 0 then
      v_attrs := jsonb_set(v_attrs, array[v_primary_attr],
        to_jsonb(least(public.attribute_clamp_max(v_primary_attr), greatest(100, (v_attrs ->> v_primary_attr)::int + v_primary_gain))));
    end if;
  end if;

  -- Secondary attribute (optional, Performance only) — its own, separate
  -- progress row: never a shared pool with the primary attribute. Same
  -- ceiling-skip rule applies if the secondary itself is a Performance
  -- attribute already at 200. Never capped (Technical training never
  -- reaches here — v_secondary_attr is always null for it).
  if v_secondary_attr is not null and v_secondary_dev_factor is distinct from 0 then
    insert into public.rider_training_progress (rider_id, attribute, progress)
    values (v_rider_id, v_secondary_attr, 0)
    on conflict (rider_id, attribute) do nothing;

    select progress into v_progress
    from public.rider_training_progress
    where rider_id = v_rider_id and attribute = v_secondary_attr
    for update;

    v_total := v_progress + v_secondary_raw;
    v_secondary_gain := floor((v_total + 0.000000001) / v_threshold)::int;

    update public.rider_training_progress
    set progress = greatest(0, v_total - v_secondary_gain * v_threshold), updated_at = now()
    where rider_id = v_rider_id and attribute = v_secondary_attr;

    if v_secondary_gain > 0 then
      v_attrs := jsonb_set(v_attrs, array[v_secondary_attr],
        to_jsonb(least(public.attribute_clamp_max(v_secondary_attr), greatest(100, (v_attrs ->> v_secondary_attr)::int + v_secondary_gain))));
    end if;
  end if;

  -- ---- Condition (item 25: SQL owns this now, not the TS app) ----
  -- Training cost applied ONCE per plan (item 13/14); passive weekly
  -- recovery (item 15) boosted by the Recovery Center multiplier (item 16,
  -- applied only here, never to raw growth or to the training cost).
  v_energy_delta := -v_training_energy_cost + v_recovery_days * v_recovery_day_energy * v_recovery_multiplier;
  v_fatigue_delta := v_training_fatigue_gain - v_recovery_days * v_recovery_day_fatigue * v_recovery_multiplier;
  -- Rounding audit (see the chat report, "REGENERAČNÉ CENTRUM CLOSE-OUT",
  -- item 12): the Recovery Center multiplier (1.05-1.20) makes this
  -- genuinely fractional (e.g. 5 * 5 * 1.15 = 28.75) — round the new total
  -- to the nearest whole number FIRST, THEN clamp, exactly mirroring
  -- lib/training/condition.ts's applyConditionDelta() (Math.round then
  -- clamp100) so the two can never diverge — see recoveryCenterSql.test.ts.
  v_new_energy := least(100, greatest(0, round(v_energy + v_energy_delta)));
  v_new_fatigue := least(100, greatest(0, round(v_fatigue + v_fatigue_delta)));

  v_condition_previous := v_condition;
  v_condition := jsonb_set(jsonb_set(v_condition, '{energy}', to_jsonb(v_new_energy)), '{fatigue}', to_jsonb(v_new_fatigue));

  update public.riders set attributes = v_attrs, condition = v_condition, condition_previous = v_condition_previous where id = v_rider_id;

  update public.training_plans set
    applied_at = now(),
    primary_attr = v_primary_attr,
    primary_gain = v_primary_gain,
    secondary_attr = v_secondary_attr,
    secondary_gain = case when v_secondary_attr is not null then v_secondary_gain else null end
  where id = p_plan_id;

  return query select v_primary_gain, v_secondary_gain, false;
end;
$$;

revoke all on function public.apply_training_plan_internal(uuid) from public, anon, authenticated;

-- Applies every due plan of the CALLER's own rider, oldest (season, week) first.
-- Takes no parameters: nothing here can be influenced by the client. Safe to
-- call repeatedly and concurrently — the plan row is locked and re-checked
-- inside apply_training_plan_internal().
create or replace function public.process_my_due_training()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_done int := 0;
  v_already boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  for v_id in
    select tp.id
    from public.training_plans tp
    join public.riders r on r.id = tp.rider_id
    where r.player_id = v_uid
      and tp.applied_at is null
      and public.training_plan_is_due(tp.season_id, tp.week_number, now())
    order by public.season_number_of(tp.season_id), tp.week_number
  loop
    select a.already_processed into v_already from public.apply_training_plan_internal(v_id) a;
    if not v_already then
      v_done := v_done + 1;
    end if;
  end loop;

  return v_done;
end;
$$;

revoke all on function public.process_my_due_training() from public, anon, authenticated;
grant execute on function public.process_my_due_training() to authenticated;

-- ---- 3. riders ----
drop policy if exists "riders_insert_own" on public.riders;
drop policy if exists "riders_update_own" on public.riders;
revoke all on public.riders from anon, authenticated;
-- Public columns ONLY (a column added later has no client access until granted).
-- Hidden: potential, trainability, professionalism, recovery.
grant select (id, player_id, first_name, surname, country_name, country_iso2, age,
              attributes, condition, condition_previous, inferred_archetype,
              generator_version, is_ai, created_at)
  on public.riders to authenticated;

-- The player's own estimates (1-5), never the raw values. Mirrors
-- lib/rider/development.ts scoreToLevel() (range 55-95 for all four fields).
create or replace function public.rider_score_to_level(p_value int)
returns int
language sql
immutable
as $$
  select greatest(1, least(5, ceil(((p_value - 55)::float8 / 40::float8) * 5::float8)))::int;
$$;

create or replace function public.my_rider_estimates()
returns table (potential_stars int, trainability_level int, professionalism_level int, recovery_level int)
language sql
stable
security definer set search_path = public
as $$
  select public.rider_score_to_level(r.potential), public.rider_score_to_level(r.trainability),
         public.rider_score_to_level(r.professionalism), public.rider_score_to_level(r.recovery)
  from public.riders r
  where r.player_id = auth.uid();
$$;

revoke all on function public.rider_score_to_level(int) from public, anon, authenticated;
revoke all on function public.my_rider_estimates() from public, anon, authenticated;
grant execute on function public.my_rider_estimates() to authenticated;

-- Starter rider: the app still generates it (lib/rider/generate.ts), the DB now
-- validates it against the same bounds and owns the insert. Idempotent: a player
-- who already has a rider gets that rider's id and nothing is written.
create or replace function public.create_my_starter_rider(p_rider jsonb)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_key text;
  v_val numeric;
  v_attrs jsonb := p_rider -> 'attributes';
  v_cond jsonb := p_rider -> 'condition';
  v_keys constant text[] := array[
    'climbing','hills','flat','sprint','timeTrial','endurance','acceleration',
    'positioning','attackTiming','reaction','energyManagement','breakawaySkill',
    'descending','bikeHandling','cornering','packRiding','roughSurface','wetHandling','experience'];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_id from public.riders where player_id = v_uid;
  if v_id is not null then
    return v_id;
  end if;

  -- Bounds mirror lib/rider/config.ts (ROOKIE_BASE 130 +/- 5, shape +/- 10, noise +/- 3 => 112..148; ages 18-22; hidden 55-95).
  if jsonb_typeof(v_attrs) <> 'object' or (select count(*) from jsonb_object_keys(v_attrs)) <> array_length(v_keys, 1) then
    raise exception 'invalid_rider';
  end if;
  foreach v_key in array v_keys loop
    if jsonb_typeof(v_attrs -> v_key) <> 'number' then raise exception 'invalid_rider'; end if;
    v_val := (v_attrs ->> v_key)::numeric;
    if v_val <> trunc(v_val) or v_val < 112 or v_val > 148 then raise exception 'invalid_rider'; end if;
  end loop;

  if v_cond is distinct from '{"energy":100,"fatigue":0,"form":50,"fitness":60,"morale":70}'::jsonb then
    raise exception 'invalid_rider';
  end if;
  if coalesce((p_rider ->> 'age')::int, 0) not between 18 and 22
     or coalesce((p_rider ->> 'potential')::int, 0) not between 55 and 95
     or coalesce((p_rider ->> 'trainability')::int, 0) not between 55 and 95
     or coalesce((p_rider ->> 'professionalism')::int, 0) not between 55 and 95
     or coalesce((p_rider ->> 'recovery')::int, 0) not between 55 and 95
     or coalesce(p_rider ->> 'generator_version', '') <> 'starter-v1'
     or coalesce(p_rider ->> 'inferred_archetype', '') not in ('allrounder','rouleur','climber','puncheur','sprinter','timeTrial','classics')
     or char_length(coalesce(p_rider ->> 'first_name', '')) not between 1 and 40
     or char_length(coalesce(p_rider ->> 'surname', '')) not between 1 and 40
     or char_length(coalesce(p_rider ->> 'country_name', '')) not between 1 and 60
     or char_length(coalesce(p_rider ->> 'country_iso2', '')) <> 2 then
    raise exception 'invalid_rider';
  end if;

  begin
    insert into public.riders (player_id, first_name, surname, country_name, country_iso2, age, attributes,
                               condition, condition_previous, inferred_archetype, potential, trainability,
                               professionalism, recovery, generator_version)
    values (v_uid, p_rider ->> 'first_name', p_rider ->> 'surname', p_rider ->> 'country_name',
            p_rider ->> 'country_iso2', (p_rider ->> 'age')::int, v_attrs, v_cond, v_cond,
            p_rider ->> 'inferred_archetype', (p_rider ->> 'potential')::int, (p_rider ->> 'trainability')::int,
            (p_rider ->> 'professionalism')::int, (p_rider ->> 'recovery')::int, 'starter-v1')
    returning id into v_id;
  exception when unique_violation then
    -- A concurrent request created it first.
    select id into v_id from public.riders where player_id = v_uid;
    return v_id;
  end;

  insert into public.bike_condition (rider_id) values (v_id) on conflict do nothing;
  return v_id;
end;
$$;

revoke all on function public.create_my_starter_rider(jsonb) from public, anon, authenticated;
grant execute on function public.create_my_starter_rider(jsonb) to authenticated;

-- Admin/test tooling only (admin_users). AI fillers and the raw read for the admin pages.
create or replace function public.admin_generate_ai_riders(p_rows jsonb)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_row jsonb;
  v_id uuid;
  v_n int := 0;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'not_admin';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_rows';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into public.riders (player_id, is_ai, first_name, surname, country_name, country_iso2, age, attributes,
                               condition, condition_previous, inferred_archetype, potential, trainability,
                               professionalism, recovery, generator_version)
    values (null, true, v_row ->> 'first_name', v_row ->> 'surname', v_row ->> 'country_name', v_row ->> 'country_iso2',
            (v_row ->> 'age')::int, v_row -> 'attributes', v_row -> 'condition', v_row -> 'condition_previous',
            v_row ->> 'inferred_archetype', (v_row ->> 'potential')::int, (v_row ->> 'trainability')::int,
            (v_row ->> 'professionalism')::int, (v_row ->> 'recovery')::int, v_row ->> 'generator_version')
    returning id into v_id;
    insert into public.bike_condition (rider_id) values (v_id) on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.admin_list_riders(p_id uuid default null)
returns setof public.riders
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'not_admin';
  end if;
  return query select * from public.riders r where p_id is null or r.id = p_id order by r.created_at desc;
end;
$$;

revoke all on function public.admin_generate_ai_riders(jsonb) from public, anon, authenticated;
revoke all on function public.admin_list_riders(uuid) from public, anon, authenticated;
grant execute on function public.admin_generate_ai_riders(jsonb) to authenticated;
grant execute on function public.admin_list_riders(uuid) to authenticated;

-- ---- 4. rider_training_progress: no client access ----
revoke all on public.rider_training_progress from anon, authenticated;

-- >>>>>>>> 20261115_02_training_calendar_rules.sql (same text as supabase/migrations/20261115_02_training_calendar_rules.sql) >>>>>>>>
-- ============================================================================
-- Migration 05 — Training V1: approved planning rules (owner, 2026-11-15).
--
-- Run AFTER migration 04 (20261115_01_training_security.sql); that file is NOT
-- edited, this one only replaces/adds objects, so it is safe whether or not 04
-- has already been applied. Idempotent. Nothing is deleted or re-processed:
-- historical plans stay exactly as they are; the training formula, the growth
-- accumulator and the threshold 12 are untouched (process functions unchanged).
--
-- Rules enforced here (server side, UTC calendar, never client time/season/week):
--   1. Training is planned for the NEXT game week (current week + 1).
--   2. The deadline is Sunday 24:00 UTC = Monday 00:00 UTC (the calendar week
--      boundary; the week is evaluated with clock_timestamp() at call time).
--   3. A confirmed plan can never be changed, overwritten or cancelled
--      (no UPDATE/DELETE path exists; a second save is rejected).
--   4. One plan per rider and week (UNIQUE key) — parallel saves cannot duplicate.
--   5. Week 1 of a season is preparatory: no plan can target it; planning FOR
--      week 2 is allowed during week 1.
--   6. In week 10 nothing is planned (there is no "week 1 of the next season").
--   7. A Tour week has no training — in both directions: a plan cannot be saved
--      for a week in which the rider is registered for a Tour, and a Tour
--      registration is rejected when a plan exists for that Tour's week.
--      (Both paths serialise per rider with an advisory lock, so a simultaneous
--      save + registration cannot both succeed.)
--   8. No plan => no training gains (nothing to process; natural regeneration is
--      a later block).
-- ============================================================================

-- ---- Tour weeks in the database (mirror of apps/web/src/data/tourSchedule.ts) ----
-- The Tour schedule only lived in app code, so the database could not check
-- "registered for a Tour in this week". Read-only for clients; kept in sync by
-- hand with TOUR_SCHEDULE (a drift test compares them).
create table if not exists public.tour_schedule (
  tour_id     text primary key,
  week_number int  not null check (week_number between 1 and 10)
);
alter table public.tour_schedule enable row level security;
drop policy if exists "tour_schedule_select_all" on public.tour_schedule;
create policy "tour_schedule_select_all" on public.tour_schedule for select to authenticated using (true);
revoke all on public.tour_schedule from anon, authenticated;
grant select on public.tour_schedule to authenticated;

insert into public.tour_schedule (tour_id, week_number) values
  ('highlands-tour', 2),
  ('danube-tour', 5),
  ('coastal-tour', 5),
  ('northern-crown-tour', 7),
  ('silver-horizon-tour', 9)
on conflict (tour_id) do update set week_number = excluded.week_number;

-- ---- Plannable week: current week + 1, none in the last week (10) ----
create or replace function public.training_plannable_week(p_at timestamptz)
returns int
language sql
immutable
as $$
  select case when public.season_week_at(p_at) >= 10 then null else public.season_week_at(p_at) + 1 end;
$$;
grant execute on function public.training_plannable_week(timestamptz) to authenticated;

-- ---- Saving a plan: immutable once confirmed, Tour-week aware ----
create or replace function public.save_my_training_plan(p_week_type text, p_focus text, p_intensity text)
returns public.training_plans
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rider uuid;
  v_intensity text;
  v_now timestamptz := clock_timestamp();
  v_season text;
  v_week int;
  v_row public.training_plans;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_rider from public.riders where player_id = v_uid;
  if v_rider is null then
    raise exception 'no_rider';
  end if;

  if p_week_type = 'performance' then
    if p_intensity is null or p_intensity not in ('light', 'normal', 'hard')
       or p_focus is null or not public.is_performance_attribute(p_focus) then
      raise exception 'invalid_focus';
    end if;
    v_intensity := p_intensity;
  elsif p_week_type = 'technical' then
    if p_focus is null or not public.is_technical_attribute(p_focus) then
      raise exception 'invalid_focus';
    end if;
    v_intensity := 'light'; -- placeholder, no player-facing intensity
  else
    raise exception 'invalid_focus';
  end if;

  -- Season and the ONE plannable week come from the UTC server calendar only.
  v_season := public.season_id_at(v_now);
  v_week := public.training_plannable_week(v_now);
  if v_week is null then
    raise exception 'no_plannable_week';
  end if;

  -- Serialise with Tour registration for this rider (see the trigger below).
  perform pg_advisory_xact_lock(hashtextextended('training-tour:' || v_rider::text, 0));

  if exists (
    select 1
    from public.tour_registrations r
    join public.tour_schedule s on s.tour_id = r.tour_id
    where r.rider_id = v_rider and r.season_id = v_season and s.week_number = v_week
  ) then
    raise exception 'tour_conflict';
  end if;

  -- First write wins; a confirmed plan is never touched again (no DO UPDATE).
  insert into public.training_plans (rider_id, season_id, week_number, week_type, focus, intensity)
  values (v_rider, v_season, v_week, p_week_type, p_focus, v_intensity)
  on conflict (rider_id, season_id, week_number) do nothing
  returning * into v_row;

  if v_row.id is null then
    raise exception 'already_planned';
  end if;
  return v_row;
end;
$$;

revoke all on function public.save_my_training_plan(text, text, text) from public, anon, authenticated;
grant execute on function public.save_my_training_plan(text, text, text) to authenticated;

-- ---- Tour registration is refused when training is confirmed for that Tour's week ----
create or replace function public.tour_registration_training_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_week int;
begin
  select s.week_number into v_week from public.tour_schedule s where s.tour_id = new.tour_id;
  if v_week is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('training-tour:' || new.rider_id::text, 0));

  if exists (
    select 1 from public.training_plans tp
    where tp.rider_id = new.rider_id and tp.season_id = new.season_id and tp.week_number = v_week
  ) then
    raise exception 'training_conflict';
  end if;
  return new;
end;
$$;

revoke all on function public.tour_registration_training_guard() from public, anon, authenticated;

drop trigger if exists tour_registrations_training_guard on public.tour_registrations;
create trigger tour_registrations_training_guard
  before insert on public.tour_registrations
  for each row execute function public.tour_registration_training_guard();
-- >>>>>>>> 20261115_03_rider_development_tracking.sql (same text as supabase/migrations/20261115_03_rider_development_tracking.sql) >>>>>>>>
-- ============================================================================
-- Rider development tracking (Jazdec -> Tréning -> "Vývoj jazdca").
--
-- Run AFTER 20261115_01 and 20261115_02. Whole file, idempotent, additive:
-- it never changes riders' attributes, never touches training_plans and never
-- deletes anything.
--
-- 1. rider_acquisitions  — the IMMUTABLE baseline snapshot of a rider's PUBLIC
--    attributes at the moment a manager got the rider (kind 'acquired'), or,
--    for riders that existed before this migration, the current state as the
--    start of tracking (kind 'tracking_start' — never presented as "at
--    acquisition"; no historical values are invented).
-- 2. rider_attribute_history — one row per REAL change of riders.attributes
--    (plus the baseline row), with season, week and timestamp. Premium-only
--    to read (RLS), used for the development chart.
--
-- Both tables are written ONLY by the trigger below (security definer). The
-- client has no INSERT/UPDATE/DELETE grant and no policy; UPDATE is also
-- blocked by a trigger, so not even a service-role bug can rewrite a baseline.
-- Only PUBLIC attributes (the 19 skill values) are stored: potential,
-- trainability, professionalism and recovery live in separate riders columns
-- and never enter these tables.
-- ============================================================================

-- ---- 1. immutable acquisition snapshot ------------------------------------
create table if not exists public.rider_acquisitions (
  id           uuid primary key default gen_random_uuid(),
  rider_id     uuid not null references public.riders (id) on delete cascade,
  manager_id   uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('acquired', 'tracking_start')),
  attributes   jsonb not null,
  season_id    text not null,
  season_week  int  not null,
  acquired_at  timestamptz not null default clock_timestamp()
);

create index if not exists rider_acquisitions_rider_manager_idx
  on public.rider_acquisitions (rider_id, manager_id, acquired_at desc);

-- ---- 2. attribute history --------------------------------------------------
create table if not exists public.rider_attribute_history (
  id              uuid primary key default gen_random_uuid(),
  acquisition_id  uuid not null references public.rider_acquisitions (id) on delete cascade,
  rider_id        uuid not null references public.riders (id) on delete cascade,
  manager_id      uuid not null references auth.users (id) on delete cascade,
  attributes      jsonb not null,
  -- 'baseline' = the snapshot row itself; 'training' = written while a training
  -- plan was being applied; 'other' = any other real change (not yet classified:
  -- races and further mechanics will get their own sources later).
  source          text not null check (source in ('baseline', 'training', 'other')),
  season_id       text not null,
  season_week     int  not null,
  -- clock_timestamp(), not now(): several changes inside one transaction (a batch of
  -- processed weeks) must keep their order.
  recorded_at     timestamptz not null default clock_timestamp()
);

create index if not exists rider_attribute_history_acq_idx
  on public.rider_attribute_history (acquisition_id, recorded_at);

-- ---- 3. nothing is rewritable ---------------------------------------------
create or replace function public.rider_tracking_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'rider tracking rows are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists rider_acquisitions_no_update on public.rider_acquisitions;
create trigger rider_acquisitions_no_update
  before update on public.rider_acquisitions
  for each row execute function public.rider_tracking_immutable();

drop trigger if exists rider_attribute_history_no_update on public.rider_attribute_history;
create trigger rider_attribute_history_no_update
  before update on public.rider_attribute_history
  for each row execute function public.rider_tracking_immutable();

-- ---- 4. the one write path: a trigger on riders ----------------------------
-- Fires when a rider gets a manager (insert with player_id, or player_id set /
-- changed -> NEW baseline for the new manager) and when attributes really
-- change. Changing nothing, a season rollover, a contract extension with the
-- same manager (player_id unchanged) or an age bump never creates a snapshot.
create or replace function public.rider_track_development()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_acq uuid;
  v_ctx text;
  v_source text;
  v_new_manager boolean;
begin
  if new.player_id is null then
    return new;  -- unowned AI filler: nothing to track
  end if;

  v_new_manager := (tg_op = 'INSERT') or (old.player_id is distinct from new.player_id);

  if v_new_manager then
    insert into public.rider_acquisitions (rider_id, manager_id, kind, attributes, season_id, season_week)
    values (new.id, new.player_id, 'acquired', new.attributes,
            public.season_id_at(now()), public.season_week_at(now()))
    returning id into v_acq;
    insert into public.rider_attribute_history (acquisition_id, rider_id, manager_id, attributes, source, season_id, season_week)
    values (v_acq, new.id, new.player_id, new.attributes, 'baseline',
            public.season_id_at(now()), public.season_week_at(now()));
    return new;
  end if;

  if new.attributes is not distinct from old.attributes then
    return new;
  end if;

  select id into v_acq from public.rider_acquisitions
   where rider_id = new.id and manager_id = new.player_id
   order by acquired_at desc, id limit 1;
  if v_acq is null then
    -- Rider predates tracking and nothing created a baseline yet: start tracking
    -- from the state BEFORE this change (never invent a value).
    insert into public.rider_acquisitions (rider_id, manager_id, kind, attributes, season_id, season_week)
    values (new.id, new.player_id, 'tracking_start', old.attributes,
            public.season_id_at(now()), public.season_week_at(now()))
    returning id into v_acq;
    insert into public.rider_attribute_history (acquisition_id, rider_id, manager_id, attributes, source, season_id, season_week)
    values (v_acq, new.id, new.player_id, old.attributes, 'baseline',
            public.season_id_at(now()), public.season_week_at(now()));
  end if;

  -- Classify the change by the call stack: only the training engine is a real
  -- source of attribute changes today.
  get diagnostics v_ctx = pg_context;
  v_source := case when v_ctx like '%apply_training_plan_internal%' then 'training' else 'other' end;

  insert into public.rider_attribute_history (acquisition_id, rider_id, manager_id, attributes, source, season_id, season_week)
  values (v_acq, new.id, new.player_id, new.attributes, v_source,
          public.season_id_at(now()), public.season_week_at(now()));
  return new;
end;
$$;

drop trigger if exists riders_track_development on public.riders;
create trigger riders_track_development
  after insert or update of attributes, player_id on public.riders
  for each row execute function public.rider_track_development();

-- ---- 5. existing riders: current state = START OF TRACKING ------------------
-- Not "at acquisition": the real acquisition values were never stored. No
-- historical value is invented. Idempotent (only riders without a baseline).
do $$
declare
  r record;
  v_acq uuid;
begin
  for r in
    select id, player_id, attributes from public.riders ri
     where ri.player_id is not null
       and not exists (select 1 from public.rider_acquisitions a where a.rider_id = ri.id and a.manager_id = ri.player_id)
  loop
    insert into public.rider_acquisitions (rider_id, manager_id, kind, attributes, season_id, season_week)
    values (r.id, r.player_id, 'tracking_start', r.attributes, public.season_id_at(now()), public.season_week_at(now()))
    returning id into v_acq;
    insert into public.rider_attribute_history (acquisition_id, rider_id, manager_id, attributes, source, season_id, season_week)
    values (v_acq, r.id, r.player_id, r.attributes, 'baseline', public.season_id_at(now()), public.season_week_at(now()));
  end loop;
end;
$$;

-- ---- 6. access: read-only for clients, history is Premium ------------------
alter table public.rider_acquisitions enable row level security;
alter table public.rider_attribute_history enable row level security;

revoke all on public.rider_acquisitions from public, anon, authenticated;
revoke all on public.rider_attribute_history from public, anon, authenticated;
grant select on public.rider_acquisitions to authenticated;
grant select on public.rider_attribute_history to authenticated;

drop policy if exists "rider_acquisitions_select_own" on public.rider_acquisitions;
create policy "rider_acquisitions_select_own"
  on public.rider_acquisitions for select to authenticated
  using (manager_id = auth.uid());

-- The development chart is a Premium feature, enforced here and not only in the UI.
drop policy if exists "rider_attribute_history_select_own_premium" on public.rider_attribute_history;
create policy "rider_attribute_history_select_own_premium"
  on public.rider_attribute_history for select to authenticated
  using (
    manager_id = auth.uid()
    and exists (select 1 from public.premium_entitlements pe where pe.user_id = auth.uid())
  );

revoke all on function public.rider_track_development() from public, anon, authenticated;
revoke all on function public.rider_tracking_immutable() from public, anon, authenticated;
-- >>>>>>>> 20261116_01_rider_contracts.sql (same text as supabase/migrations/20261116_01_rider_contracts.sql) >>>>>>>>
-- ============================================================================
-- Rider contracts V1 + career history (Jazdec -> Kontrakt, Jazdec -> História).
--
-- Run AFTER 20261115_03_rider_development_tracking.sql. Whole file, idempotent,
-- additive: it changes no rider attribute, no training data, deletes nothing and
-- activates NO automatic deletion of anybody.
--
-- What it adds
--   1. rider_acquisitions gets the manager's LEAGUE + SUB-LEAGUE at the moment of
--      the acquisition (the existing immutable snapshot is the single record of
--      "a manager got a rider"; no second acquisition table is created). Rows
--      written before this migration keep NULL (unknown, never invented).
--   2. rider_contracts: one contract per acquisition, 10 game weeks, with exact
--      start/end season + week AND the exact expiry instant (UTC).
--   3. rider_career_events: the rider's career timeline (career start, contract
--      signed). Lives and dies with the rider (ON DELETE CASCADE); it holds no
--      manager results, so manager achievements are independent of it.
--   4. start_rider_contract_internal(): THE ONLY way a contract/event is created.
--      Not callable by clients. A future, server-side "buy a market rider"
--      function must call it in the SAME transaction as the ownership change.
--      There is no purchase function yet (see docs/DECISIONS.md C-050), so no
--      contract is created by anything in this migration.
--   5. my_rider_contract(): read-only, derives state + remaining weeks from the
--      SERVER clock.
--   6. purge_unsold_young_market_riders(): prepared, NOT called by anything, not
--      granted to clients, dry-run by default.
--
-- Contract rules (owner, 2026-11-16): 10 game weeks, the purchase week counts as
-- week 1, ends at the end of the 10th counted week, a season change does not end
-- it. Weeks are the global UTC game calendar (anchor 2026-08-17, Monday 00:00 UTC,
-- 7-day weeks, 10 per season) — never the browser clock.
--   S2 W1 -> S2 W10 · S2 W4 -> S3 W3 · S2 W10 -> S3 W9
-- ============================================================================

-- ---- 0. calendar helpers (same anchor as season_id_at / season_week_at) -----
-- Global week index: 0 = week 1 of season 1. (season-1)*10 + week - 1.
create or replace function public.game_week_index(p_at timestamptz)
returns int
language sql
immutable
as $$
  select (greatest(0, (p_at at time zone 'utc')::date - date '2026-08-17') / 7)::int;
$$;

create or replace function public.game_week_index_of(p_season_id text, p_week int)
returns int
language sql
immutable
as $$
  select (public.season_number_of(p_season_id) - 1) * 10 + (p_week - 1);
$$;

-- Season id / week of a global week index.
create or replace function public.game_season_of_index(p_index int)
returns text
language sql
immutable
as $$
  select 'season-' || (p_index / 10 + 1)::int;
$$;

create or replace function public.game_week_of_index(p_index int)
returns int
language sql
immutable
as $$
  select (p_index % 10) + 1;
$$;

-- The instant a contract that started at p_start expires: Monday 00:00 UTC right
-- after its last counted week. The contract is active while now() < this value.
create or replace function public.contract_expiry_at(p_start timestamptz, p_weeks int default 10)
returns timestamptz
language sql
immutable
as $$
  select ((date '2026-08-17' + (public.game_week_index(p_start) + p_weeks) * 7)::timestamp at time zone 'utc');
$$;

-- ---- 1. league + sub-league of the manager, frozen in the acquisition ------
alter table public.rider_acquisitions
  add column if not exists league text,
  add column if not exists division_number int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rider_acquisitions_league_check') then
    alter table public.rider_acquisitions
      add constraint rider_acquisitions_league_check
      check (league is null or league in ('rookie', 'amateur', 'continental', 'pro', 'elite'));
  end if;
end;
$$;

-- Same function as in migration 20261115_03 (single write path), plus the league
-- snapshot. Rows are immutable, so a later promotion/relegation never rewrites it.
create or replace function public.rider_track_development()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_acq uuid;
  v_ctx text;
  v_source text;
  v_new_manager boolean;
  v_league text;
  v_division int;
begin
  if new.player_id is null then
    return new;  -- unowned AI filler: nothing to track
  end if;

  v_new_manager := (tg_op = 'INSERT') or (old.player_id is distinct from new.player_id);

  if v_new_manager then
    -- The manager's real placement RIGHT NOW (null when they have none yet, e.g. a
    -- starter rider created before the lazy sub-league placement ran).
    select m.league, d.number into v_league, v_division
      from public.league_memberships m
      join public.league_divisions d on d.id = m.division_id
     where m.player_id = new.player_id;

    insert into public.rider_acquisitions (rider_id, manager_id, kind, attributes, season_id, season_week, league, division_number)
    values (new.id, new.player_id, 'acquired', new.attributes,
            public.season_id_at(now()), public.season_week_at(now()), v_league, v_division)
    returning id into v_acq;
    insert into public.rider_attribute_history (acquisition_id, rider_id, manager_id, attributes, source, season_id, season_week)
    values (v_acq, new.id, new.player_id, new.attributes, 'baseline',
            public.season_id_at(now()), public.season_week_at(now()));
    return new;
  end if;

  if new.attributes is not distinct from old.attributes then
    return new;
  end if;

  select id into v_acq from public.rider_acquisitions
   where rider_id = new.id and manager_id = new.player_id
   order by acquired_at desc, id limit 1;
  if v_acq is null then
    insert into public.rider_acquisitions (rider_id, manager_id, kind, attributes, season_id, season_week)
    values (new.id, new.player_id, 'tracking_start', old.attributes,
            public.season_id_at(now()), public.season_week_at(now()))
    returning id into v_acq;
    insert into public.rider_attribute_history (acquisition_id, rider_id, manager_id, attributes, source, season_id, season_week)
    values (v_acq, new.id, new.player_id, old.attributes, 'baseline',
            public.season_id_at(now()), public.season_week_at(now()));
  end if;

  get diagnostics v_ctx = pg_context;
  v_source := case when v_ctx like '%apply_training_plan_internal%' then 'training' else 'other' end;

  insert into public.rider_attribute_history (acquisition_id, rider_id, manager_id, attributes, source, season_id, season_week)
  values (v_acq, new.id, new.player_id, new.attributes, v_source,
          public.season_id_at(now()), public.season_week_at(now()));
  return new;
end;
$$;

revoke all on function public.rider_track_development() from public, anon, authenticated;

-- ---- 2. contracts -----------------------------------------------------------
create table if not exists public.rider_contracts (
  id              uuid primary key default gen_random_uuid(),
  rider_id        uuid not null references public.riders (id) on delete cascade,
  manager_id      uuid not null references auth.users (id) on delete cascade,
  -- ONE contract per acquisition: a repeated request cannot create a second one.
  acquisition_id  uuid not null unique references public.rider_acquisitions (id) on delete cascade,
  start_season_id text not null check (start_season_id ~ '^season-[0-9]{1,6}$'),
  start_week      int  not null check (start_week between 1 and 10),
  end_season_id   text not null check (end_season_id ~ '^season-[0-9]{1,6}$'),
  end_week        int  not null check (end_week between 1 and 10),
  duration_weeks  int  not null check (duration_weeks = 10),
  starts_at       timestamptz not null,
  -- Exact expiry instant (Monday 00:00 UTC after the last counted week).
  expires_at      timestamptz not null,
  -- 'active' until a FUTURE rule ends it; running out of time does NOT change it
  -- (expiry is derived: now() >= expires_at). 'ended' is reserved for later.
  status          text not null default 'active' check (status in ('active', 'ended')),
  created_at      timestamptz not null default clock_timestamp(),
  constraint rider_contracts_span_check check (expires_at > starts_at)
);

-- At most one active contract per rider (also under concurrent requests).
create unique index if not exists rider_contracts_one_active_per_rider
  on public.rider_contracts (rider_id) where status = 'active';
create index if not exists rider_contracts_manager_idx on public.rider_contracts (manager_id, created_at desc);

-- ---- 3. career events -------------------------------------------------------
create table if not exists public.rider_career_events (
  id              uuid primary key default gen_random_uuid(),
  -- Cascade: the history exists only while the rider does and is erased with him.
  rider_id        uuid not null references public.riders (id) on delete cascade,
  manager_id      uuid not null references auth.users (id) on delete cascade,
  acquisition_id  uuid not null references public.rider_acquisitions (id) on delete cascade,
  contract_id     uuid references public.rider_contracts (id) on delete cascade,
  event_type      text not null check (event_type in ('career_start', 'contract_signed')),
  season_id       text not null,
  season_week     int  not null check (season_week between 1 and 10),
  -- League + sub-league of the manager AT THE MOMENT (copied from the acquisition).
  league          text check (league is null or league in ('rookie', 'amateur', 'continental', 'pro', 'elite')),
  division_number  int,
  duration_weeks  int,
  occurred_at     timestamptz not null default clock_timestamp()
);

-- No duplicate historical events when a request is processed again.
create unique index if not exists rider_career_events_one_start_per_rider
  on public.rider_career_events (rider_id) where event_type = 'career_start';
create unique index if not exists rider_career_events_one_signing_per_contract
  on public.rider_career_events (contract_id) where event_type = 'contract_signed';
create index if not exists rider_career_events_rider_idx on public.rider_career_events (rider_id, occurred_at, id);

-- ---- 4. immutability --------------------------------------------------------
create or replace function public.rider_contract_guard()
returns trigger
language plpgsql
as $$
begin
  -- Only the status may change later (a future rule ends a contract); dates, owner
  -- and duration are fixed for good, even for the table owner.
  if new.id is distinct from old.id or new.rider_id is distinct from old.rider_id
     or new.manager_id is distinct from old.manager_id or new.acquisition_id is distinct from old.acquisition_id
     or new.start_season_id is distinct from old.start_season_id or new.start_week is distinct from old.start_week
     or new.end_season_id is distinct from old.end_season_id or new.end_week is distinct from old.end_week
     or new.duration_weeks is distinct from old.duration_weeks or new.starts_at is distinct from old.starts_at
     or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at then
    raise exception 'rider contract dates, owner and duration are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rider_contracts_guard on public.rider_contracts;
create trigger rider_contracts_guard
  before update on public.rider_contracts
  for each row execute function public.rider_contract_guard();

drop trigger if exists rider_career_events_no_update on public.rider_career_events;
create trigger rider_career_events_no_update
  before update on public.rider_career_events
  for each row execute function public.rider_tracking_immutable();

-- ---- 5. access: read-only for clients ---------------------------------------
alter table public.rider_contracts enable row level security;
alter table public.rider_career_events enable row level security;

revoke all on public.rider_contracts from public, anon, authenticated;
revoke all on public.rider_career_events from public, anon, authenticated;
grant select on public.rider_contracts to authenticated;
grant select on public.rider_career_events to authenticated;

drop policy if exists "rider_contracts_select_own" on public.rider_contracts;
create policy "rider_contracts_select_own"
  on public.rider_contracts for select to authenticated
  using (manager_id = auth.uid());

-- The history belongs to the rider: whoever manages him now reads it.
drop policy if exists "rider_career_events_select_own_rider" on public.rider_career_events;
create policy "rider_career_events_select_own_rider"
  on public.rider_career_events for select to authenticated
  using (exists (select 1 from public.riders r where r.id = rider_career_events.rider_id and r.player_id = auth.uid()));

revoke all on function public.rider_contract_guard() from public, anon, authenticated;

-- ---- 6. THE write path: start a contract (server-side only) -----------------
-- Called by a future purchase function inside the transaction that sets
-- riders.player_id (the trigger above has then just written the 'acquired'
-- snapshot with the manager's league). Idempotent: a repeated call returns the
-- same contract and writes nothing.
create or replace function public.start_rider_contract_internal(
  p_rider_id uuid, p_manager_id uuid, p_at timestamptz default clock_timestamp()
)
returns public.rider_contracts
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_acq public.rider_acquisitions;
  v_existing public.rider_contracts;
  v_row public.rider_contracts;
  v_idx int;
  v_end_idx int;
  v_season text;
  v_week int;
begin
  if p_rider_id is null or p_manager_id is null then
    raise exception 'invalid_arguments';
  end if;

  -- Serialise per rider: two parallel requests cannot both create a contract.
  perform pg_advisory_xact_lock(hashtextextended('rider-contract:' || p_rider_id::text, 0));

  select player_id into v_owner from public.riders where id = p_rider_id;
  if v_owner is null or v_owner <> p_manager_id then
    raise exception 'not_rider_owner';
  end if;

  select * into v_acq from public.rider_acquisitions
   where rider_id = p_rider_id and manager_id = p_manager_id and kind = 'acquired'
   order by acquired_at desc, id limit 1;
  if v_acq.id is null then
    raise exception 'no_acquisition';
  end if;

  select * into v_existing from public.rider_contracts where acquisition_id = v_acq.id;
  if v_existing.id is not null then
    return v_existing;                      -- repeated request: nothing new
  end if;

  if exists (select 1 from public.rider_contracts where rider_id = p_rider_id and status = 'active') then
    -- A rider with a still-running contract of ANOTHER acquisition: releasing /
    -- transferring is not designed yet (open question), so refuse instead of guessing.
    raise exception 'active_contract_exists';
  end if;

  v_idx := public.game_week_index(p_at);
  v_end_idx := v_idx + 9;                   -- purchase week = week 1 of 10
  v_season := public.season_id_at(p_at);
  v_week := public.season_week_at(p_at);

  insert into public.rider_contracts (
    rider_id, manager_id, acquisition_id, start_season_id, start_week, end_season_id, end_week,
    duration_weeks, starts_at, expires_at
  ) values (
    p_rider_id, p_manager_id, v_acq.id, v_season, v_week,
    public.game_season_of_index(v_end_idx), public.game_week_of_index(v_end_idx),
    10, p_at, public.contract_expiry_at(p_at, 10)
  ) returning * into v_row;

  -- First purchase ever of this rider (no earlier manager) => career starts now.
  if not exists (select 1 from public.rider_acquisitions where rider_id = p_rider_id and id <> v_acq.id) then
    insert into public.rider_career_events (rider_id, manager_id, acquisition_id, contract_id, event_type,
                                            season_id, season_week, league, division_number, occurred_at)
    values (p_rider_id, p_manager_id, v_acq.id, null, 'career_start', v_season, v_week,
            v_acq.league, v_acq.division_number, p_at)
    on conflict do nothing;
  end if;

  insert into public.rider_career_events (rider_id, manager_id, acquisition_id, contract_id, event_type,
                                          season_id, season_week, league, division_number, duration_weeks, occurred_at)
  values (p_rider_id, p_manager_id, v_acq.id, v_row.id, 'contract_signed', v_season, v_week,
          v_acq.league, v_acq.division_number, 10, p_at)
  on conflict do nothing;

  return v_row;
end;
$$;

revoke all on function public.start_rider_contract_internal(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---- 7. read: current contract of MY rider, state from the SERVER clock -----
-- state: 'active' | 'expired' (time ran out; nothing else happens automatically) |
-- 'ended' (reserved). remaining_weeks counts the current game week while it runs.
create or replace function public.my_rider_contract()
returns table (
  contract_id uuid, rider_id uuid, state text,
  start_season_id text, start_week int, end_season_id text, end_week int,
  duration_weeks int, starts_at timestamptz, expires_at timestamptz,
  remaining_weeks int, server_now timestamptz
)
language sql
stable
as $$
  select c.id, c.rider_id,
         case when c.status = 'ended' then 'ended'
              when clock_timestamp() >= c.expires_at then 'expired'
              else 'active' end,
         c.start_season_id, c.start_week, c.end_season_id, c.end_week,
         c.duration_weeks, c.starts_at, c.expires_at,
         case when c.status = 'ended' or clock_timestamp() >= c.expires_at then 0
              else greatest(0, public.game_week_index_of(c.end_season_id, c.end_week) - public.game_week_index(clock_timestamp()) + 1) end,
         clock_timestamp()
    from public.rider_contracts c
    join public.riders r on r.id = c.rider_id and r.player_id = c.manager_id
   where c.manager_id = auth.uid()
   order by c.created_at desc, c.id
   limit 1;
$$;

grant execute on function public.my_rider_contract() to authenticated;
grant execute on function public.game_week_index(timestamptz) to authenticated;
grant execute on function public.game_week_index_of(text, int) to authenticated;
grant execute on function public.game_season_of_index(int) to authenticated;
grant execute on function public.game_week_of_index(int) to authenticated;
grant execute on function public.contract_expiry_at(timestamptz, int) to authenticated;

-- ---- 8. young market riders: the removal rule, PREPARED, NOT ACTIVE ---------
-- Rule (owner, 2026-11-16): a young rider enters the market at 17 and may stay at
-- 17, 18, 19 and 20. If nobody ever bought him by the end of the period in which
-- he is 20 (season aging then makes him 21) he ends his career and is deleted for
-- good — no archive, no history. Only riders who NEVER started a professional
-- career: a row that was ever acquired, or that is not a generated one
-- (source admin/week6), is never touched.
--
-- Nothing calls this function: it is not in process_season_aging(), not granted to
-- any role and defaults to a DRY RUN (returns the number of rows it WOULD delete).
-- Activating it is a separate, explicit decision (see docs/DECISIONS.md C-050).
create or replace function public.purge_unsold_young_market_riders(p_apply boolean default false)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.market_riders m
   where m.status = 'available'
     and m.acquired_by_player_id is null
     and m.acquired_rider_id is null
     and m.acquired_at is null
     and m.source in ('admin', 'week6')
     and m.age > 20;

  if p_apply then
    delete from public.market_riders m
     where m.status = 'available'
       and m.acquired_by_player_id is null
       and m.acquired_rider_id is null
       and m.acquired_at is null
       and m.source in ('admin', 'week6')
       and m.age > 20;
  end if;
  return v_count;
end;
$$;

revoke all on function public.purge_unsold_young_market_riders(boolean) from public, anon, authenticated;
-- >>>>>>>> 20261116_02_market_purchase_and_swap.sql (same text as supabase/migrations/20261116_02_market_purchase_and_swap.sql) >>>>>>>>
-- ============================================================================
-- Market purchase + weekly rider swap (contracts V1, part 2).
--
-- Run AFTER 20261116_01_rider_contracts.sql. Whole file, idempotent, additive.
-- It changes no rider attribute and deletes no data; it is SWITCHED OFF by
-- default (see 1.) so nothing happens until the owner flips one row.
--
-- Approved rules (owner, 2026-11-16)
--   1. A manager may buy a market rider any time (during a Tour, a training week,
--      with a valid contract). The purchase does NOT swap anything at once.
--   2. The bought rider is RESERVED for that manager (status 'reserved'): nobody
--      else can buy him. A manager has at most ONE pending swap.
--   3. The current rider finishes the running Tour / training week. The swap runs
--      at the next weekly closure: Sunday 24:00 UTC = Monday 00:00 UTC.
--   4. At closure the OLD rider is closed first (due training applied, race
--      results required), only then the swap happens.
--   5. The old rider's contract ends and he returns to the market with his identity,
--      age, abilities, hidden attributes and career history.
--   6. The new rider becomes the manager's active rider and gets a NEW 10-week
--      contract counted from the week of the real takeover (buy S2 W4 -> takeover
--      S2 W5 -> contract until the end of S3 W4).
--   7. Manager achievements are not tied to the rider (nothing here touches them).
--
-- Identity: ONE row in public.riders per rider, for his whole life.
--   * A market rider that never had a manager exists only in market_riders until
--     his first takeover; then ONE riders row is created from it (acquired_rider_id
--     links the two for good).
--   * A rider who leaves a manager stays in riders as "on the market"
--     (player_id NULL, on_market true — the third state the old riders_ai_or_player
--     check could not express) and his linked market_riders row becomes
--     'available' again. Buying him again re-uses the same riders row: no new rider
--     is ever created for a transfer.
--   * "One active rider per manager" = UNIQUE(riders.player_id), unchanged.
--
-- SWITCH: public.rider_swap_settings.enabled (default false). While it is false
-- reserve_market_rider() and process_due_rider_swaps() refuse / do nothing. The
-- owner must enable it only when the weekly closure guarantees finished races and
-- trainings (see docs/DECISIONS.md C-051, O-018). Nothing in this migration
-- enables it.
-- ============================================================================

-- ---- 1. feature switch (default OFF) ----------------------------------------
create table if not exists public.rider_swap_settings (
  id       boolean primary key default true check (id),   -- single row
  enabled  boolean not null default false,
  changed_at timestamptz not null default now()
);
insert into public.rider_swap_settings (id, enabled) values (true, false) on conflict (id) do nothing;
alter table public.rider_swap_settings enable row level security;
revoke all on public.rider_swap_settings from public, anon, authenticated;
grant select on public.rider_swap_settings to authenticated;
drop policy if exists "rider_swap_settings_select_all" on public.rider_swap_settings;
create policy "rider_swap_settings_select_all" on public.rider_swap_settings for select to authenticated using (true);

create or replace function public.rider_swap_enabled()
returns boolean
language sql
stable
as $$
  select coalesce((select enabled from public.rider_swap_settings where id), false);
$$;
grant execute on function public.rider_swap_enabled() to authenticated;

-- ---- 2. riders: the third state "on the market" ------------------------------
alter table public.riders add column if not exists on_market boolean not null default false;
alter table public.riders drop constraint if exists riders_ai_or_player_check;
alter table public.riders add constraint riders_ai_or_player_check check (
  (is_ai and player_id is null and not on_market)
  or (not is_ai and player_id is not null and not on_market)
  or (not is_ai and player_id is null and on_market)
);

-- ---- 3. market_riders: reserved, released, identity link ---------------------
alter table public.market_riders drop constraint if exists market_riders_status_check;
alter table public.market_riders add constraint market_riders_status_check
  check (status in ('available', 'reserved', 'acquired'));
alter table public.market_riders drop constraint if exists market_riders_source_check;
alter table public.market_riders add constraint market_riders_source_check
  check (source in ('admin', 'week6', 'released'));

-- acquired_rider_id is now the permanent identity link; cascade so removing a rider
-- (end of career) takes his market row with him.
alter table public.market_riders drop constraint if exists market_riders_acquired_rider_id_fkey;
alter table public.market_riders add constraint market_riders_acquired_rider_id_fkey
  foreign key (acquired_rider_id) references public.riders (id) on delete cascade;
create unique index if not exists market_riders_one_row_per_rider
  on public.market_riders (acquired_rider_id) where acquired_rider_id is not null;

-- A market row that is linked to a living rider is his identity record: it is never
-- deleted directly (an admin test reset must not orphan a returned rider).
create or replace function public.market_rider_link_guard()
returns trigger
language plpgsql
as $$
begin
  if old.acquired_rider_id is not null
     and exists (select 1 from public.riders r where r.id = old.acquired_rider_id) then
    raise exception 'market row of an existing rider cannot be deleted' using errcode = '42501';
  end if;
  return old;
end;
$$;
drop trigger if exists market_riders_link_guard on public.market_riders;
create trigger market_riders_link_guard before delete on public.market_riders
  for each row execute function public.market_rider_link_guard();
revoke all on function public.market_rider_link_guard() from public, anon, authenticated;

-- ---- 4. aging: no double aging of a rider who is both in riders and on the market --
-- Same function as in schema.sql (+1 per season, claimed once per season). Only
-- change: market rows linked to a rider are NOT aged themselves; they are re-copied
-- from the (already aged) riders row and moved to the current season so a returned
-- rider stays visible. Aging model itself is unchanged.
create or replace function public.process_season_aging()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_anchor            date := date '2026-08-17'; -- SEASON_ONE_START
  v_season_length_days int  := 70;                -- SEASON_LENGTH_DAYS
  v_days_since_start  int;
  v_current_season    int;
  v_last_processed    int;
  v_season_number     int;
  v_season_id         text;
  v_season_start      date;
  v_next_season_start date;
  v_claimed_id        text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_days_since_start := greatest(0, current_date - v_anchor);
  v_current_season := floor(v_days_since_start::numeric / v_season_length_days) + 1;

  select coalesce(max(season_number), 0) into v_last_processed from public.season_transition_processing;

  for v_season_number in (v_last_processed + 1)..(v_current_season - 1) loop
    v_season_id := 'season-' || v_season_number;
    v_season_start := v_anchor + (v_season_number - 1) * v_season_length_days;
    v_next_season_start := v_season_start + v_season_length_days;

    insert into public.season_transition_processing (season_id, season_number)
    values (v_season_id, v_season_number)
    on conflict (season_id) do nothing
    returning season_id into v_claimed_id;

    if v_claimed_id is not null then
      update public.riders set age = age + 1 where created_at < v_next_season_start;

      update public.market_riders set age = age + 1
      where generated_at < v_next_season_start and status = 'available' and acquired_rider_id is null;

      -- Returned riders: copy the aged identity, keep them in the current season's pool.
      update public.market_riders m
         set age = r.age, season_id = 'season-' || v_current_season
        from public.riders r
       where m.acquired_rider_id = r.id and m.status = 'available' and r.on_market;
    end if;
  end loop;
end;
$$;
revoke all on function public.process_season_aging() from public;
grant execute on function public.process_season_aging() to authenticated;

-- ---- 5. league eligibility (limits are CONFIG, none invented) ----------------
-- Rookie OVR limits exist as a rule (lower to acquire, higher to keep) but their
-- numbers are NOT decided: every limit is NULL = no limit. The check is evaluated
-- for the manager's league AT THE MOMENT: at purchase and again at takeover, i.e.
-- after the season change — a purchase in week 10 cannot dodge the new season's
-- league, and a manager promoted to Amateur is no longer bound by the Rookie limit.
create table if not exists public.league_rider_limits (
  league          text primary key check (league in ('rookie', 'amateur', 'continental', 'pro', 'elite')),
  acquire_max_ovr int check (acquire_max_ovr is null or acquire_max_ovr > 0),
  keep_max_ovr    int check (keep_max_ovr is null or keep_max_ovr > 0)
);
insert into public.league_rider_limits (league) values ('rookie'), ('amateur'), ('continental'), ('pro'), ('elite')
  on conflict (league) do nothing;
alter table public.league_rider_limits enable row level security;
revoke all on public.league_rider_limits from public, anon, authenticated;
grant select on public.league_rider_limits to authenticated;
drop policy if exists "league_rider_limits_select_all" on public.league_rider_limits;
create policy "league_rider_limits_select_all" on public.league_rider_limits for select to authenticated using (true);

-- OVR = Výkon×0.50 + Taktika×0.25 + Technika×0.20 + Skúsenosti×0.05 (lib/rider/score.ts overallRating,
-- unrounded group means, rounded at the end). A drift test compares the attribute lists with the TS config.
create or replace function public.rider_overall_rating(p_attrs jsonb)
returns int
language sql
immutable
as $$
  select round(
    public.overall_performance(p_attrs) * 0.50
    + ((p_attrs ->> 'positioning')::numeric + (p_attrs ->> 'attackTiming')::numeric + (p_attrs ->> 'reaction')::numeric
       + (p_attrs ->> 'energyManagement')::numeric + (p_attrs ->> 'breakawaySkill')::numeric) / 5 * 0.25
    + ((p_attrs ->> 'descending')::numeric + (p_attrs ->> 'bikeHandling')::numeric + (p_attrs ->> 'cornering')::numeric
       + (p_attrs ->> 'packRiding')::numeric + (p_attrs ->> 'wetHandling')::numeric + (p_attrs ->> 'roughSurface')::numeric) / 6 * 0.20
    + (p_attrs ->> 'experience')::numeric * 0.05
  )::int;
$$;

create or replace function public.manager_league_now(p_manager uuid)
returns text
language sql
stable
as $$
  select coalesce(
    (select m.league from public.league_memberships m where m.player_id = p_manager),
    (select p.league from public.profiles p where p.id = p_manager),
    'rookie');
$$;

-- p_context: 'acquire' (buying) or 'keep' (holding an existing rider; used by the season
-- transition when it is built). No limit configured = eligible.
create or replace function public.rider_league_eligible(p_league text, p_attrs jsonb, p_context text)
returns boolean
language plpgsql
stable
as $$
declare
  v_limit int;
begin
  if p_context not in ('acquire', 'keep') then
    raise exception 'invalid_context';
  end if;
  select case p_context when 'acquire' then l.acquire_max_ovr else l.keep_max_ovr end
    into v_limit from public.league_rider_limits l where l.league = p_league;
  return v_limit is null or public.rider_overall_rating(p_attrs) <= v_limit;
end;
$$;
grant execute on function public.rider_overall_rating(jsonb) to authenticated;
grant execute on function public.rider_league_eligible(text, jsonb, text) to authenticated;

-- ---- 6. pending swaps --------------------------------------------------------
create table if not exists public.rider_swaps (
  id                 uuid primary key default gen_random_uuid(),
  manager_id         uuid not null references auth.users (id) on delete cascade,
  old_rider_id       uuid not null references public.riders (id) on delete cascade,
  market_rider_id    uuid not null references public.market_riders (id) on delete restrict,
  new_rider_id       uuid references public.riders (id) on delete set null,
  new_contract_id    uuid references public.rider_contracts (id) on delete set null,
  status             text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  reserved_at        timestamptz not null default clock_timestamp(),
  -- Monday 00:00 UTC that starts the week after the purchase week.
  takeover_at        timestamptz not null,
  takeover_season_id text not null,
  takeover_week      int not null check (takeover_week between 1 and 10),
  closed_at          timestamptz,
  cancel_reason      text,
  blocked_reason     text
);
-- At most ONE pending swap per manager, and a market rider can be reserved once.
create unique index if not exists rider_swaps_one_pending_per_manager
  on public.rider_swaps (manager_id) where status = 'pending';
create unique index if not exists rider_swaps_one_pending_per_market_rider
  on public.rider_swaps (market_rider_id) where status = 'pending';
create index if not exists rider_swaps_due_idx on public.rider_swaps (takeover_at) where status = 'pending';

alter table public.rider_swaps enable row level security;
revoke all on public.rider_swaps from public, anon, authenticated;
grant select on public.rider_swaps to authenticated;
drop policy if exists "rider_swaps_select_own" on public.rider_swaps;
create policy "rider_swaps_select_own" on public.rider_swaps for select to authenticated using (manager_id = auth.uid());

-- History: the old rider's contract end is part of his career.
alter table public.rider_career_events drop constraint if exists rider_career_events_event_type_check;
alter table public.rider_career_events add constraint rider_career_events_event_type_check
  check (event_type in ('career_start', 'contract_signed', 'contract_ended'));
create unique index if not exists rider_career_events_one_end_per_contract
  on public.rider_career_events (contract_id) where event_type = 'contract_ended';

-- ---- 7. reserve (purchase) ---------------------------------------------------
create or replace function public.reserve_market_rider_internal(p_manager uuid, p_market_id uuid, p_at timestamptz)
returns public.rider_swaps
language plpgsql
security definer set search_path = public
as $$
declare
  v_old uuid;
  v_mk public.market_riders;
  v_idx int;
  v_row public.rider_swaps;
begin
  if p_manager is null then
    raise exception 'not_authenticated';
  end if;
  if not public.rider_swap_enabled() then
    raise exception 'swap_disabled';
  end if;

  -- Serialise this manager's purchases; the market row lock below serialises buyers of one rider.
  perform pg_advisory_xact_lock(hashtextextended('rider-swap:' || p_manager::text, 0));

  select id into v_old from public.riders where player_id = p_manager;
  if v_old is null then
    raise exception 'no_active_rider';
  end if;
  if exists (select 1 from public.rider_swaps where manager_id = p_manager and status = 'pending') then
    raise exception 'swap_pending';
  end if;

  select * into v_mk from public.market_riders where id = p_market_id for update;
  if v_mk.id is null then
    raise exception 'not_found';
  end if;
  if v_mk.tier = 'premium' and not exists (select 1 from public.premium_entitlements pe where pe.user_id = p_manager) then
    raise exception 'not_found';          -- same as RLS: a Premium row does not exist for a Free player
  end if;
  if v_mk.status <> 'available' then
    raise exception 'not_available';
  end if;
  if not public.rider_league_eligible(public.manager_league_now(p_manager), v_mk.attributes, 'acquire') then
    raise exception 'not_eligible';
  end if;

  update public.market_riders set status = 'reserved' where id = v_mk.id;

  v_idx := public.game_week_index(p_at) + 1;
  insert into public.rider_swaps (manager_id, old_rider_id, market_rider_id, reserved_at, takeover_at, takeover_season_id, takeover_week)
  values (p_manager, v_old, v_mk.id, p_at, public.contract_expiry_at(p_at, 1),
          public.game_season_of_index(v_idx), public.game_week_of_index(v_idx))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.reserve_market_rider(p_market_rider_id uuid)
returns public.rider_swaps
language sql
security definer set search_path = public
as $$
  select * from public.reserve_market_rider_internal(auth.uid(), p_market_rider_id, clock_timestamp());
$$;

-- ---- 8. closure: complete one swap (internal) -------------------------------
-- Returns 'completed' | 'already_<status>' | 'not_due' | 'disabled' | 'deferred' | 'cancelled'.
-- Idempotent: the swap row is locked and re-read, so a repeated or concurrent call
-- sees status <> 'pending' and does nothing.
create or replace function public.complete_rider_swap_internal(p_swap_id uuid, p_now timestamptz)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_swap public.rider_swaps;
  v_old public.riders;
  v_mk public.market_riders;
  v_plan uuid;
  v_new uuid;
  v_contract public.rider_contracts;
  v_old_contract public.rider_contracts;
  v_acq uuid;
begin
  select * into v_swap from public.rider_swaps where id = p_swap_id for update;
  if v_swap.id is null then
    raise exception 'swap_not_found';
  end if;
  if v_swap.status <> 'pending' then
    return 'already_' || v_swap.status;
  end if;
  if not public.rider_swap_enabled() then
    return 'disabled';
  end if;
  if v_swap.takeover_at > p_now then
    return 'not_due';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rider-swap:' || v_swap.manager_id::text, 0));

  select * into v_old from public.riders where id = v_swap.old_rider_id for update;
  select * into v_mk from public.market_riders where id = v_swap.market_rider_id for update;

  if v_old.id is null or v_old.player_id is distinct from v_swap.manager_id then
    -- the manager no longer has that rider: nothing to swap; release the reservation
    update public.market_riders set status = 'available' where id = v_mk.id and status = 'reserved';
    update public.rider_swaps set status = 'cancelled', cancel_reason = 'old_rider_changed', closed_at = p_now where id = v_swap.id;
    return 'cancelled';
  end if;
  if v_mk.status <> 'reserved' then
    raise exception 'inconsistent_reservation';
  end if;

  -- (4) close the OLD rider first -------------------------------------------------
  -- Trainings of every finished week are applied now (idempotent per plan).
  for v_plan in
    select tp.id from public.training_plans tp
     where tp.rider_id = v_old.id and tp.applied_at is null
       and public.training_plan_is_due(tp.season_id, tp.week_number, p_now)
     order by public.season_number_of(tp.season_id), tp.week_number
  loop
    perform public.apply_training_plan_internal(v_plan);
  end loop;

  -- Races: a finished Tour the rider was registered for must have its result stored.
  -- (There is no race processing yet: such a swap WAITS instead of losing the result.)
  if exists (
    select 1 from public.tour_registrations r
      join public.tour_schedule s on s.tour_id = r.tour_id
     where r.rider_id = v_old.id
       and public.training_plan_is_due(r.season_id, s.week_number, p_now)
       and not exists (select 1 from public.race_results rr
                        where rr.rider_id = v_old.id and rr.season_id = r.season_id and rr.tour_id = r.tour_id)
  ) then
    update public.rider_swaps set blocked_reason = 'races_not_closed' where id = v_swap.id;
    return 'deferred';
  end if;

  -- Eligibility is decided for the league the manager has NOW (after any season change).
  select * into v_old from public.riders where id = v_swap.old_rider_id;   -- after training
  if not public.rider_league_eligible(public.manager_league_now(v_swap.manager_id), v_mk.attributes, 'acquire') then
    update public.market_riders set status = 'available' where id = v_mk.id;
    update public.rider_swaps set status = 'cancelled', cancel_reason = 'not_eligible', closed_at = p_now, blocked_reason = null where id = v_swap.id;
    return 'cancelled';
  end if;

  -- (5) the old rider leaves ----------------------------------------------------
  -- Plans / registrations for weeks that have not happened can no longer be honoured by
  -- him and must not apply to a later manager: plans are closed WITHOUT effect
  -- (applied_at set, gains stay NULL — nothing is deleted), future registrations are removed.
  update public.training_plans set applied_at = p_now where rider_id = v_old.id and applied_at is null;
  delete from public.tour_registrations r
   using public.tour_schedule s
   where r.rider_id = v_old.id and s.tour_id = r.tour_id
     and not public.training_plan_is_due(r.season_id, s.week_number, p_now);

  select * into v_old_contract from public.rider_contracts where rider_id = v_old.id and status = 'active';
  if v_old_contract.id is not null then
    update public.rider_contracts set status = 'ended' where id = v_old_contract.id;
    insert into public.rider_career_events (rider_id, manager_id, acquisition_id, contract_id, event_type, season_id, season_week, league, division_number, occurred_at)
    select v_old.id, v_old.player_id, v_old_contract.acquisition_id, v_old_contract.id, 'contract_ended',
           v_swap.takeover_season_id, v_swap.takeover_week, a.league, a.division_number, v_swap.takeover_at
      from public.rider_acquisitions a where a.id = v_old_contract.acquisition_id
    on conflict do nothing;
  end if;

  update public.riders set player_id = null, on_market = true where id = v_old.id;
  select * into v_old from public.riders where id = v_old.id;

  update public.market_riders
     set status = 'available', acquired_by_player_id = null, acquired_at = null,
         season_id = public.season_id_at(p_now), age = v_old.age, attributes = v_old.attributes, condition = v_old.condition,
         inferred_archetype = v_old.inferred_archetype, potential = v_old.potential, trainability = v_old.trainability,
         professionalism = v_old.professionalism, recovery = v_old.recovery
   where acquired_rider_id = v_old.id;
  if not found then
    insert into public.market_riders (season_id, tier, status, first_name, surname, country_name, country_iso2, age, attributes, condition,
                                      inferred_archetype, potential, trainability, professionalism, recovery, generator_version, source,
                                      generated_at, acquired_rider_id)
    values (public.season_id_at(p_now), 'free', 'available', v_old.first_name, v_old.surname, v_old.country_name, v_old.country_iso2,
            v_old.age, v_old.attributes, v_old.condition, v_old.inferred_archetype, v_old.potential, v_old.trainability,
            v_old.professionalism, v_old.recovery, v_old.generator_version, 'released', p_now, v_old.id);
  end if;

  -- (8) the new rider becomes active --------------------------------------------
  if v_mk.acquired_rider_id is null then
    insert into public.riders (player_id, is_ai, on_market, first_name, surname, country_name, country_iso2, age, attributes, condition,
                               condition_previous, inferred_archetype, potential, trainability, professionalism, recovery, generator_version)
    values (v_swap.manager_id, false, false, v_mk.first_name, v_mk.surname, v_mk.country_name, v_mk.country_iso2, v_mk.age, v_mk.attributes,
            v_mk.condition, v_mk.condition, v_mk.inferred_archetype, v_mk.potential, v_mk.trainability, v_mk.professionalism, v_mk.recovery,
            v_mk.generator_version)
    returning id into v_new;
  else
    v_new := v_mk.acquired_rider_id;
    update public.riders set player_id = v_swap.manager_id, on_market = false
     where id = v_new and on_market and player_id is null;
    if not found then
      raise exception 'rider_not_on_market';
    end if;
  end if;
  -- (the riders trigger has just written the 'acquired' snapshot with the manager's league)

  update public.market_riders
     set status = 'acquired', acquired_by_player_id = v_swap.manager_id, acquired_at = p_now, acquired_rider_id = v_new
   where id = v_mk.id;

  -- (9) the contract counts from the takeover week (the closure instant), not the reservation
  select * into v_contract from public.start_rider_contract_internal(v_new, v_swap.manager_id, v_swap.takeover_at);

  update public.rider_swaps
     set status = 'completed', new_rider_id = v_new, new_contract_id = v_contract.id, closed_at = p_now, blocked_reason = null
   where id = v_swap.id;
  return 'completed';
end;
$$;

-- ---- 9. closure entry point (lazy, like season aging) -----------------------
create or replace function public.process_due_rider_swaps()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_done int := 0;
  v_res text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.rider_swap_enabled() then
    return 0;
  end if;

  for v_id in
    select id from public.rider_swaps
     where status = 'pending' and takeover_at <= clock_timestamp()
     order by takeover_at, id
     for update skip locked
  loop
    begin
      v_res := public.complete_rider_swap_internal(v_id, clock_timestamp());
      if v_res = 'completed' then v_done := v_done + 1; end if;
    exception when others then
      -- this swap's work is rolled back as a whole; it stays pending and is retried
      update public.rider_swaps set blocked_reason = left(sqlerrm, 200) where id = v_id;
    end;
  end loop;
  return v_done;
end;
$$;

-- ---- 10. read: my pending swap (names only, no hidden values) ---------------
create or replace function public.my_pending_swap()
returns table (
  swap_id uuid, takeover_at timestamptz, takeover_season_id text, takeover_week int,
  new_first_name text, new_surname text, new_country_iso2 text, new_age int
)
language sql
stable
security definer set search_path = public
as $$
  select s.id, s.takeover_at, s.takeover_season_id, s.takeover_week,
         m.first_name, m.surname, m.country_iso2, m.age
    from public.rider_swaps s
    join public.market_riders m on m.id = s.market_rider_id
   where s.manager_id = auth.uid() and s.status = 'pending'
   limit 1;
$$;

-- ---- 11. grants --------------------------------------------------------------
revoke all on function public.reserve_market_rider_internal(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_rider_swap_internal(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_market_rider(uuid) from public, anon;
revoke all on function public.process_due_rider_swaps() from public, anon;
revoke all on function public.my_pending_swap() from public, anon;
revoke all on function public.manager_league_now(uuid) from public, anon, authenticated;
grant execute on function public.reserve_market_rider(uuid) to authenticated;
grant execute on function public.process_due_rider_swaps() to authenticated;
grant execute on function public.my_pending_swap() to authenticated;
