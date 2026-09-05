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
