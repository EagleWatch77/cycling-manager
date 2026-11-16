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
