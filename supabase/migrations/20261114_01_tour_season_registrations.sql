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
