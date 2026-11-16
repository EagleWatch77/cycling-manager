-- ============================================================================
-- Rebríčky / league standings (2026-11-16) — PREPARED FOR REVIEW, NOT DEPLOYED.
--
-- Adds, for the manager-bound league table:
--   1. profiles.country_code  — the MANAGER's country (ISO-3166 alpha-2), set
--      by the manager in settings. Never derived from language, IP or rider.
--   2. league_points          — points bound to manager + season + sub-league
--      (never to a rider; a rider swap, promotion or new season changes nothing
--      already stored). kind = 'stage' fills the E columns; other kinds
--      ('tour_rank', 'jersey', 'achievement', ...) are reserved: they only add
--      to the total. No scoring values are defined here. Rows are written by
--      trusted server code only (no client INSERT/UPDATE/DELETE).
--   3. league_ms_status       — World Championships status per manager+season
--      (qualifying / invited / confirmed / declined / reserve). Structure only.
--   4. Two SECURITY DEFINER read functions that expose ONLY public game data
--      (display name, country, points, MS status) of a chosen sub-league.
--      profiles stays own-row-only; no e-mail or private column is exposed.
-- Idempotent. Run after 20261114_02 and 20261114_03.
-- ============================================================================

alter table public.profiles add column if not exists country_code text;
alter table public.profiles drop constraint if exists profiles_country_code_format;
alter table public.profiles add constraint profiles_country_code_format
  check (country_code is null or country_code ~ '^[A-Z]{2}$');
-- Managers may set their own country (same pattern as display_name).
grant update (country_code) on public.profiles to authenticated;

create table if not exists public.league_points (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references auth.users (id) on delete cascade,
  season_id   text not null check (season_id ~ '^season-[0-9]+$'),
  division_id uuid not null references public.league_divisions (id),
  kind        text not null default 'stage',
  tour_no     int  not null check (tour_no >= 1),
  stage_no    int  check (stage_no >= 1),
  points      int  not null default 0,
  created_at  timestamptz not null default now(),
  -- One row per manager / season / kind / tour / stage: cannot be counted twice.
  constraint league_points_stage_needs_no check (kind <> 'stage' or stage_no is not null)
);
create unique index if not exists league_points_unique
  on public.league_points (player_id, season_id, kind, tour_no, coalesce(stage_no, 0));
create index if not exists league_points_division_idx on public.league_points (division_id, season_id);

create table if not exists public.league_ms_status (
  player_id uuid not null references auth.users (id) on delete cascade,
  season_id text not null check (season_id ~ '^season-[0-9]+$'),
  status    text not null check (status in ('qualifying', 'invited', 'confirmed', 'declined', 'reserve')),
  updated_at timestamptz not null default now(),
  primary key (player_id, season_id)
);

alter table public.league_points enable row level security;
alter table public.league_ms_status enable row level security;
revoke all on public.league_points from anon, authenticated;
revoke all on public.league_ms_status from anon, authenticated;
-- No client policies: reads go through the functions below, writes through service code.

-- Managers of one sub-league: public game data only.
create or replace function public.league_standing_managers(p_division uuid)
returns table (player_id uuid, display_name text, country_code text, ms_status text, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.player_id, p.display_name, p.country_code, s.status, (m.player_id = auth.uid())
  from public.league_memberships m
  join public.profiles p on p.id = m.player_id
  left join public.league_ms_status s on s.player_id = m.player_id and s.season_id = public.current_season_id()
  where m.division_id = p_division and auth.uid() is not null
$$;

create or replace function public.league_standing_points(p_division uuid, p_season text)
returns table (player_id uuid, kind text, tour_no int, stage_no int, points int)
language sql
stable
security definer
set search_path = public
as $$
  select lp.player_id, lp.kind, lp.tour_no, lp.stage_no, lp.points
  from public.league_points lp
  where lp.division_id = p_division and lp.season_id = p_season and auth.uid() is not null
$$;

revoke all on function public.league_standing_managers(uuid) from public, anon;
revoke all on function public.league_standing_points(uuid, text) from public, anon;
grant execute on function public.league_standing_managers(uuid) to authenticated;
grant execute on function public.league_standing_points(uuid, text) to authenticated;

-- Seasons that have stored points for a sub-league (history selector).
create or replace function public.league_standing_seasons(p_division uuid)
returns table (season_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct lp.season_id from public.league_points lp
  where lp.division_id = p_division and auth.uid() is not null
$$;
revoke all on function public.league_standing_seasons(uuid) from public, anon;
grant execute on function public.league_standing_seasons(uuid) to authenticated;
