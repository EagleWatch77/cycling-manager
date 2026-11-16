-- ============================================================================
-- Market purchase + weekly rider swap (contracts V1, part 2).
--
-- Run AFTER 20261116_01_rider_contracts.sql. Whole file, idempotent, additive.
-- It changes no rider attribute and deletes no data; it is SWITCHED OFF by
-- default (see 1.) so nothing happens until the owner flips one row.
--
-- Approved rules (owner, 2026-11-16)
--   1. A manager may buy a market rider any time (during a Tour, a training week,
--      with a valid contract). The purchase does NOT swap anything at once.
--   2. The bought rider is RESERVED for that manager (status 'reserved'): nobody
--      else can buy him. A manager has at most ONE pending swap.
--   3. The current rider finishes the running Tour / training week. The swap runs
--      at the next weekly closure: Sunday 24:00 UTC = Monday 00:00 UTC.
--   4. At closure the OLD rider is closed first (due training applied, race
--      results required), only then the swap happens.
--   5. The old rider's contract ends and he returns to the market with his identity,
--      age, abilities, hidden attributes and career history.
--   6. The new rider becomes the manager's active rider and gets a NEW 10-week
--      contract counted from the week of the real takeover (buy S2 W4 -> takeover
--      S2 W5 -> contract until the end of S3 W4).
--   7. Manager achievements are not tied to the rider (nothing here touches them).
--
-- Identity: ONE row in public.riders per rider, for his whole life.
--   * A market rider that never had a manager exists only in market_riders until
--     his first takeover; then ONE riders row is created from it (acquired_rider_id
--     links the two for good).
--   * A rider who leaves a manager stays in riders as "on the market"
--     (player_id NULL, on_market true — the third state the old riders_ai_or_player
--     check could not express) and his linked market_riders row becomes
--     'available' again. Buying him again re-uses the same riders row: no new rider
--     is ever created for a transfer.
--   * "One active rider per manager" = UNIQUE(riders.player_id), unchanged.
--
-- SWITCH: public.rider_swap_settings.enabled (default false). While it is false
-- reserve_market_rider() and process_due_rider_swaps() refuse / do nothing. The
-- owner must enable it only when the weekly closure guarantees finished races and
-- trainings (see docs/DECISIONS.md C-051, O-018). Nothing in this migration
-- enables it.
-- ============================================================================

-- ---- 1. feature switch (default OFF) ----------------------------------------
create table if not exists public.rider_swap_settings (
  id       boolean primary key default true check (id),   -- single row
  enabled  boolean not null default false,
  changed_at timestamptz not null default now()
);
insert into public.rider_swap_settings (id, enabled) values (true, false) on conflict (id) do nothing;
alter table public.rider_swap_settings enable row level security;
revoke all on public.rider_swap_settings from public, anon, authenticated;
grant select on public.rider_swap_settings to authenticated;
drop policy if exists "rider_swap_settings_select_all" on public.rider_swap_settings;
create policy "rider_swap_settings_select_all" on public.rider_swap_settings for select to authenticated using (true);

create or replace function public.rider_swap_enabled()
returns boolean
language sql
stable
as $$
  select coalesce((select enabled from public.rider_swap_settings where id), false);
$$;
grant execute on function public.rider_swap_enabled() to authenticated;

-- ---- 2. riders: the third state "on the market" ------------------------------
alter table public.riders add column if not exists on_market boolean not null default false;
alter table public.riders drop constraint if exists riders_ai_or_player_check;
alter table public.riders add constraint riders_ai_or_player_check check (
  (is_ai and player_id is null and not on_market)
  or (not is_ai and player_id is not null and not on_market)
  or (not is_ai and player_id is null and on_market)
);

-- ---- 3. market_riders: reserved, released, identity link ---------------------
alter table public.market_riders drop constraint if exists market_riders_status_check;
alter table public.market_riders add constraint market_riders_status_check
  check (status in ('available', 'reserved', 'acquired'));
alter table public.market_riders drop constraint if exists market_riders_source_check;
alter table public.market_riders add constraint market_riders_source_check
  check (source in ('admin', 'week6', 'released'));

-- acquired_rider_id is now the permanent identity link; cascade so removing a rider
-- (end of career) takes his market row with him.
alter table public.market_riders drop constraint if exists market_riders_acquired_rider_id_fkey;
alter table public.market_riders add constraint market_riders_acquired_rider_id_fkey
  foreign key (acquired_rider_id) references public.riders (id) on delete cascade;
create unique index if not exists market_riders_one_row_per_rider
  on public.market_riders (acquired_rider_id) where acquired_rider_id is not null;

-- A market row that is linked to a living rider is his identity record: it is never
-- deleted directly (an admin test reset must not orphan a returned rider).
create or replace function public.market_rider_link_guard()
returns trigger
language plpgsql
as $$
begin
  if old.acquired_rider_id is not null
     and exists (select 1 from public.riders r where r.id = old.acquired_rider_id) then
    raise exception 'market row of an existing rider cannot be deleted' using errcode = '42501';
  end if;
  return old;
end;
$$;
drop trigger if exists market_riders_link_guard on public.market_riders;
create trigger market_riders_link_guard before delete on public.market_riders
  for each row execute function public.market_rider_link_guard();
revoke all on function public.market_rider_link_guard() from public, anon, authenticated;

-- ---- 4. aging: no double aging of a rider who is both in riders and on the market --
-- Same function as in schema.sql (+1 per season, claimed once per season). Only
-- change: market rows linked to a rider are NOT aged themselves; they are re-copied
-- from the (already aged) riders row and moved to the current season so a returned
-- rider stays visible. Aging model itself is unchanged.
create or replace function public.process_season_aging()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_anchor            date := date '2026-08-17'; -- SEASON_ONE_START
  v_season_length_days int  := 70;                -- SEASON_LENGTH_DAYS
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
    v_next_season_start := v_season_start + v_season_length_days;

    insert into public.season_transition_processing (season_id, season_number)
    values (v_season_id, v_season_number)
    on conflict (season_id) do nothing
    returning season_id into v_claimed_id;

    if v_claimed_id is not null then
      update public.riders set age = age + 1 where created_at < v_next_season_start;

      update public.market_riders set age = age + 1
      where generated_at < v_next_season_start and status = 'available' and acquired_rider_id is null;

      -- Returned riders: copy the aged identity, keep them in the current season's pool.
      update public.market_riders m
         set age = r.age, season_id = 'season-' || v_current_season
        from public.riders r
       where m.acquired_rider_id = r.id and m.status = 'available' and r.on_market;
    end if;
  end loop;
end;
$$;
revoke all on function public.process_season_aging() from public;
grant execute on function public.process_season_aging() to authenticated;

-- ---- 5. league eligibility (limits are CONFIG, none invented) ----------------
-- Rookie OVR limits exist as a rule (lower to acquire, higher to keep) but their
-- numbers are NOT decided: every limit is NULL = no limit. The check is evaluated
-- for the manager's league AT THE MOMENT: at purchase and again at takeover, i.e.
-- after the season change — a purchase in week 10 cannot dodge the new season's
-- league, and a manager promoted to Amateur is no longer bound by the Rookie limit.
create table if not exists public.league_rider_limits (
  league          text primary key check (league in ('rookie', 'amateur', 'continental', 'pro', 'elite')),
  acquire_max_ovr int check (acquire_max_ovr is null or acquire_max_ovr > 0),
  keep_max_ovr    int check (keep_max_ovr is null or keep_max_ovr > 0)
);
insert into public.league_rider_limits (league) values ('rookie'), ('amateur'), ('continental'), ('pro'), ('elite')
  on conflict (league) do nothing;
alter table public.league_rider_limits enable row level security;
revoke all on public.league_rider_limits from public, anon, authenticated;
grant select on public.league_rider_limits to authenticated;
drop policy if exists "league_rider_limits_select_all" on public.league_rider_limits;
create policy "league_rider_limits_select_all" on public.league_rider_limits for select to authenticated using (true);

-- OVR = Výkon×0.50 + Taktika×0.25 + Technika×0.20 + Skúsenosti×0.05 (lib/rider/score.ts overallRating,
-- unrounded group means, rounded at the end). A drift test compares the attribute lists with the TS config.
create or replace function public.rider_overall_rating(p_attrs jsonb)
returns int
language sql
immutable
as $$
  select round(
    public.overall_performance(p_attrs) * 0.50
    + ((p_attrs ->> 'positioning')::numeric + (p_attrs ->> 'attackTiming')::numeric + (p_attrs ->> 'reaction')::numeric
       + (p_attrs ->> 'energyManagement')::numeric + (p_attrs ->> 'breakawaySkill')::numeric) / 5 * 0.25
    + ((p_attrs ->> 'descending')::numeric + (p_attrs ->> 'bikeHandling')::numeric + (p_attrs ->> 'cornering')::numeric
       + (p_attrs ->> 'packRiding')::numeric + (p_attrs ->> 'wetHandling')::numeric + (p_attrs ->> 'roughSurface')::numeric) / 6 * 0.20
    + (p_attrs ->> 'experience')::numeric * 0.05
  )::int;
$$;

create or replace function public.manager_league_now(p_manager uuid)
returns text
language sql
stable
as $$
  select coalesce(
    (select m.league from public.league_memberships m where m.player_id = p_manager),
    (select p.league from public.profiles p where p.id = p_manager),
    'rookie');
$$;

-- p_context: 'acquire' (buying) or 'keep' (holding an existing rider; used by the season
-- transition when it is built). No limit configured = eligible.
create or replace function public.rider_league_eligible(p_league text, p_attrs jsonb, p_context text)
returns boolean
language plpgsql
stable
as $$
declare
  v_limit int;
begin
  if p_context not in ('acquire', 'keep') then
    raise exception 'invalid_context';
  end if;
  select case p_context when 'acquire' then l.acquire_max_ovr else l.keep_max_ovr end
    into v_limit from public.league_rider_limits l where l.league = p_league;
  return v_limit is null or public.rider_overall_rating(p_attrs) <= v_limit;
end;
$$;
grant execute on function public.rider_overall_rating(jsonb) to authenticated;
grant execute on function public.rider_league_eligible(text, jsonb, text) to authenticated;

-- ---- 6. pending swaps --------------------------------------------------------
create table if not exists public.rider_swaps (
  id                 uuid primary key default gen_random_uuid(),
  manager_id         uuid not null references auth.users (id) on delete cascade,
  old_rider_id       uuid not null references public.riders (id) on delete cascade,
  market_rider_id    uuid not null references public.market_riders (id) on delete restrict,
  new_rider_id       uuid references public.riders (id) on delete set null,
  new_contract_id    uuid references public.rider_contracts (id) on delete set null,
  status             text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  reserved_at        timestamptz not null default clock_timestamp(),
  -- Monday 00:00 UTC that starts the week after the purchase week.
  takeover_at        timestamptz not null,
  takeover_season_id text not null,
  takeover_week      int not null check (takeover_week between 1 and 10),
  closed_at          timestamptz,
  cancel_reason      text,
  blocked_reason     text
);
-- At most ONE pending swap per manager, and a market rider can be reserved once.
create unique index if not exists rider_swaps_one_pending_per_manager
  on public.rider_swaps (manager_id) where status = 'pending';
create unique index if not exists rider_swaps_one_pending_per_market_rider
  on public.rider_swaps (market_rider_id) where status = 'pending';
create index if not exists rider_swaps_due_idx on public.rider_swaps (takeover_at) where status = 'pending';

alter table public.rider_swaps enable row level security;
revoke all on public.rider_swaps from public, anon, authenticated;
grant select on public.rider_swaps to authenticated;
drop policy if exists "rider_swaps_select_own" on public.rider_swaps;
create policy "rider_swaps_select_own" on public.rider_swaps for select to authenticated using (manager_id = auth.uid());

-- History: the old rider's contract end is part of his career.
alter table public.rider_career_events drop constraint if exists rider_career_events_event_type_check;
alter table public.rider_career_events add constraint rider_career_events_event_type_check
  check (event_type in ('career_start', 'contract_signed', 'contract_ended'));
create unique index if not exists rider_career_events_one_end_per_contract
  on public.rider_career_events (contract_id) where event_type = 'contract_ended';

-- ---- 7. reserve (purchase) ---------------------------------------------------
create or replace function public.reserve_market_rider_internal(p_manager uuid, p_market_id uuid, p_at timestamptz)
returns public.rider_swaps
language plpgsql
security definer set search_path = public
as $$
declare
  v_old uuid;
  v_mk public.market_riders;
  v_idx int;
  v_row public.rider_swaps;
begin
  if p_manager is null then
    raise exception 'not_authenticated';
  end if;
  if not public.rider_swap_enabled() then
    raise exception 'swap_disabled';
  end if;

  -- Serialise this manager's purchases; the market row lock below serialises buyers of one rider.
  perform pg_advisory_xact_lock(hashtextextended('rider-swap:' || p_manager::text, 0));

  select id into v_old from public.riders where player_id = p_manager;
  if v_old is null then
    raise exception 'no_active_rider';
  end if;
  if exists (select 1 from public.rider_swaps where manager_id = p_manager and status = 'pending') then
    raise exception 'swap_pending';
  end if;

  select * into v_mk from public.market_riders where id = p_market_id for update;
  if v_mk.id is null then
    raise exception 'not_found';
  end if;
  if v_mk.tier = 'premium' and not exists (select 1 from public.premium_entitlements pe where pe.user_id = p_manager) then
    raise exception 'not_found';          -- same as RLS: a Premium row does not exist for a Free player
  end if;
  if v_mk.status <> 'available' then
    raise exception 'not_available';
  end if;
  if not public.rider_league_eligible(public.manager_league_now(p_manager), v_mk.attributes, 'acquire') then
    raise exception 'not_eligible';
  end if;

  update public.market_riders set status = 'reserved' where id = v_mk.id;

  v_idx := public.game_week_index(p_at) + 1;
  insert into public.rider_swaps (manager_id, old_rider_id, market_rider_id, reserved_at, takeover_at, takeover_season_id, takeover_week)
  values (p_manager, v_old, v_mk.id, p_at, public.contract_expiry_at(p_at, 1),
          public.game_season_of_index(v_idx), public.game_week_of_index(v_idx))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.reserve_market_rider(p_market_rider_id uuid)
returns public.rider_swaps
language sql
security definer set search_path = public
as $$
  select * from public.reserve_market_rider_internal(auth.uid(), p_market_rider_id, clock_timestamp());
$$;

-- ---- 8. closure: complete one swap (internal) -------------------------------
-- Returns 'completed' | 'already_<status>' | 'not_due' | 'disabled' | 'deferred' | 'cancelled'.
-- Idempotent: the swap row is locked and re-read, so a repeated or concurrent call
-- sees status <> 'pending' and does nothing.
create or replace function public.complete_rider_swap_internal(p_swap_id uuid, p_now timestamptz)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_swap public.rider_swaps;
  v_old public.riders;
  v_mk public.market_riders;
  v_plan uuid;
  v_new uuid;
  v_contract public.rider_contracts;
  v_old_contract public.rider_contracts;
  v_acq uuid;
begin
  select * into v_swap from public.rider_swaps where id = p_swap_id for update;
  if v_swap.id is null then
    raise exception 'swap_not_found';
  end if;
  if v_swap.status <> 'pending' then
    return 'already_' || v_swap.status;
  end if;
  if not public.rider_swap_enabled() then
    return 'disabled';
  end if;
  if v_swap.takeover_at > p_now then
    return 'not_due';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rider-swap:' || v_swap.manager_id::text, 0));

  select * into v_old from public.riders where id = v_swap.old_rider_id for update;
  select * into v_mk from public.market_riders where id = v_swap.market_rider_id for update;

  if v_old.id is null or v_old.player_id is distinct from v_swap.manager_id then
    -- the manager no longer has that rider: nothing to swap; release the reservation
    update public.market_riders set status = 'available' where id = v_mk.id and status = 'reserved';
    update public.rider_swaps set status = 'cancelled', cancel_reason = 'old_rider_changed', closed_at = p_now where id = v_swap.id;
    return 'cancelled';
  end if;
  if v_mk.status <> 'reserved' then
    raise exception 'inconsistent_reservation';
  end if;

  -- (4) close the OLD rider first -------------------------------------------------
  -- Trainings of every finished week are applied now (idempotent per plan).
  for v_plan in
    select tp.id from public.training_plans tp
     where tp.rider_id = v_old.id and tp.applied_at is null
       and public.training_plan_is_due(tp.season_id, tp.week_number, p_now)
     order by public.season_number_of(tp.season_id), tp.week_number
  loop
    perform public.apply_training_plan_internal(v_plan);
  end loop;

  -- Races: a finished Tour the rider was registered for must have its result stored.
  -- (There is no race processing yet: such a swap WAITS instead of losing the result.)
  if exists (
    select 1 from public.tour_registrations r
      join public.tour_schedule s on s.tour_id = r.tour_id
     where r.rider_id = v_old.id
       and public.training_plan_is_due(r.season_id, s.week_number, p_now)
       and not exists (select 1 from public.race_results rr
                        where rr.rider_id = v_old.id and rr.season_id = r.season_id and rr.tour_id = r.tour_id)
  ) then
    update public.rider_swaps set blocked_reason = 'races_not_closed' where id = v_swap.id;
    return 'deferred';
  end if;

  -- Eligibility is decided for the league the manager has NOW (after any season change).
  select * into v_old from public.riders where id = v_swap.old_rider_id;   -- after training
  if not public.rider_league_eligible(public.manager_league_now(v_swap.manager_id), v_mk.attributes, 'acquire') then
    update public.market_riders set status = 'available' where id = v_mk.id;
    update public.rider_swaps set status = 'cancelled', cancel_reason = 'not_eligible', closed_at = p_now, blocked_reason = null where id = v_swap.id;
    return 'cancelled';
  end if;

  -- (5) the old rider leaves ----------------------------------------------------
  -- Plans / registrations for weeks that have not happened can no longer be honoured by
  -- him and must not apply to a later manager: plans are closed WITHOUT effect
  -- (applied_at set, gains stay NULL — nothing is deleted), future registrations are removed.
  update public.training_plans set applied_at = p_now where rider_id = v_old.id and applied_at is null;
  delete from public.tour_registrations r
   using public.tour_schedule s
   where r.rider_id = v_old.id and s.tour_id = r.tour_id
     and not public.training_plan_is_due(r.season_id, s.week_number, p_now);

  select * into v_old_contract from public.rider_contracts where rider_id = v_old.id and status = 'active';
  if v_old_contract.id is not null then
    update public.rider_contracts set status = 'ended' where id = v_old_contract.id;
    insert into public.rider_career_events (rider_id, manager_id, acquisition_id, contract_id, event_type, season_id, season_week, league, division_number, occurred_at)
    select v_old.id, v_old.player_id, v_old_contract.acquisition_id, v_old_contract.id, 'contract_ended',
           v_swap.takeover_season_id, v_swap.takeover_week, a.league, a.division_number, v_swap.takeover_at
      from public.rider_acquisitions a where a.id = v_old_contract.acquisition_id
    on conflict do nothing;
  end if;

  update public.riders set player_id = null, on_market = true where id = v_old.id;
  select * into v_old from public.riders where id = v_old.id;

  update public.market_riders
     set status = 'available', acquired_by_player_id = null, acquired_at = null,
         season_id = public.season_id_at(p_now), age = v_old.age, attributes = v_old.attributes, condition = v_old.condition,
         inferred_archetype = v_old.inferred_archetype, potential = v_old.potential, trainability = v_old.trainability,
         professionalism = v_old.professionalism, recovery = v_old.recovery
   where acquired_rider_id = v_old.id;
  if not found then
    insert into public.market_riders (season_id, tier, status, first_name, surname, country_name, country_iso2, age, attributes, condition,
                                      inferred_archetype, potential, trainability, professionalism, recovery, generator_version, source,
                                      generated_at, acquired_rider_id)
    values (public.season_id_at(p_now), 'free', 'available', v_old.first_name, v_old.surname, v_old.country_name, v_old.country_iso2,
            v_old.age, v_old.attributes, v_old.condition, v_old.inferred_archetype, v_old.potential, v_old.trainability,
            v_old.professionalism, v_old.recovery, v_old.generator_version, 'released', p_now, v_old.id);
  end if;

  -- (8) the new rider becomes active --------------------------------------------
  if v_mk.acquired_rider_id is null then
    insert into public.riders (player_id, is_ai, on_market, first_name, surname, country_name, country_iso2, age, attributes, condition,
                               condition_previous, inferred_archetype, potential, trainability, professionalism, recovery, generator_version)
    values (v_swap.manager_id, false, false, v_mk.first_name, v_mk.surname, v_mk.country_name, v_mk.country_iso2, v_mk.age, v_mk.attributes,
            v_mk.condition, v_mk.condition, v_mk.inferred_archetype, v_mk.potential, v_mk.trainability, v_mk.professionalism, v_mk.recovery,
            v_mk.generator_version)
    returning id into v_new;
  else
    v_new := v_mk.acquired_rider_id;
    update public.riders set player_id = v_swap.manager_id, on_market = false
     where id = v_new and on_market and player_id is null;
    if not found then
      raise exception 'rider_not_on_market';
    end if;
  end if;
  -- (the riders trigger has just written the 'acquired' snapshot with the manager's league)

  update public.market_riders
     set status = 'acquired', acquired_by_player_id = v_swap.manager_id, acquired_at = p_now, acquired_rider_id = v_new
   where id = v_mk.id;

  -- (9) the contract counts from the takeover week (the closure instant), not the reservation
  select * into v_contract from public.start_rider_contract_internal(v_new, v_swap.manager_id, v_swap.takeover_at);

  update public.rider_swaps
     set status = 'completed', new_rider_id = v_new, new_contract_id = v_contract.id, closed_at = p_now, blocked_reason = null
   where id = v_swap.id;
  return 'completed';
end;
$$;

-- ---- 9. closure entry point (lazy, like season aging) -----------------------
create or replace function public.process_due_rider_swaps()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_done int := 0;
  v_res text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.rider_swap_enabled() then
    return 0;
  end if;

  for v_id in
    select id from public.rider_swaps
     where status = 'pending' and takeover_at <= clock_timestamp()
     order by takeover_at, id
     for update skip locked
  loop
    begin
      v_res := public.complete_rider_swap_internal(v_id, clock_timestamp());
      if v_res = 'completed' then v_done := v_done + 1; end if;
    exception when others then
      -- this swap's work is rolled back as a whole; it stays pending and is retried
      update public.rider_swaps set blocked_reason = left(sqlerrm, 200) where id = v_id;
    end;
  end loop;
  return v_done;
end;
$$;

-- ---- 10. read: my pending swap (names only, no hidden values) ---------------
create or replace function public.my_pending_swap()
returns table (
  swap_id uuid, takeover_at timestamptz, takeover_season_id text, takeover_week int,
  new_first_name text, new_surname text, new_country_iso2 text, new_age int
)
language sql
stable
security definer set search_path = public
as $$
  select s.id, s.takeover_at, s.takeover_season_id, s.takeover_week,
         m.first_name, m.surname, m.country_iso2, m.age
    from public.rider_swaps s
    join public.market_riders m on m.id = s.market_rider_id
   where s.manager_id = auth.uid() and s.status = 'pending'
   limit 1;
$$;

-- ---- 11. grants --------------------------------------------------------------
revoke all on function public.reserve_market_rider_internal(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_rider_swap_internal(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_market_rider(uuid) from public, anon;
revoke all on function public.process_due_rider_swaps() from public, anon;
revoke all on function public.my_pending_swap() from public, anon;
revoke all on function public.manager_league_now(uuid) from public, anon, authenticated;
grant execute on function public.reserve_market_rider(uuid) to authenticated;
grant execute on function public.process_due_rider_swaps() to authenticated;
grant execute on function public.my_pending_swap() to authenticated;
