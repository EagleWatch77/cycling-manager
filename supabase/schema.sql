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
