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
