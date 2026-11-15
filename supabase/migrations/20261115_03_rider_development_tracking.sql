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
