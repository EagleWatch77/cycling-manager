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
