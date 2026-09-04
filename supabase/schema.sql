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
