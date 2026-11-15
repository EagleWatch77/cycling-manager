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
