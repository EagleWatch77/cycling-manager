-- ============================================================================
-- Sponzori — OPRAVA GENERÁTORA (owner 2026-11-22): zákaz duplicitnej firmy u jedného hráča, súbežnosť, ciele podľa skutočného kalendára.
-- Whole file, one transaction, idempotent, additive. Run AFTER 20261122_01, _02 and _03 (it refuses otherwise).
-- Deletes nothing, changes no existing offer/contract/money. NOT RUN in production.
--
--  1. ONE PLAYER, ONE COMPANY (binding): a player never gets an offer from a company he already has a valid (open) offer from, or an ACTIVE
--     contract with (any kind: main or secondary — the check is by company_id, so a later secondary catalogue is covered automatically),
--     or the company of his most recently signed contract (the approved "not twice in a row" rule, interpretation unchanged).
--     The same company may still offer to OTHER players; after a rejection/expiry it is available again (unless a rule above blocks it).
--  2. DATABASE PROTECTION (not only the generator): trigger on sponsor_offers (INSERT) and sponsor_contracts (INSERT) + partial unique indexes,
--     serialised per player with a transaction advisory lock, so concurrent requests cannot create a duplicate. The generator takes the same lock.
--  3. EXISTING DUPLICATES: read-only report sponsor_duplicate_report(); sponsor_fix_duplicate_offers(p_apply) is a DRY RUN by default and, when
--     applied, only sets a conflicting OPEN offer to 'expired' (never deletes, never touches a contract). Both are owner-only (not granted to clients).
--  4. GOALS BY THE REAL CALENDAR: sponsor_reachable_tours() counts the race weeks of the real calendar (public.tour_schedule + the season start,
--     the same data the game uses) that are guaranteed to fall inside the contract whatever day the player signs within the 21-day validity.
--     A goal needing more Tours than that is not offered. If the calendar is not available nothing is generated (and no state is stored, so the
--     next visit retries) — no goal is ever guessed.
-- No refill after a rejection: unchanged (only the Sunday update refills; tested).
-- ============================================================================

-- One transaction: either the whole file is applied or nothing (a failed run leaves no half-state).
begin;

do $guard$ begin
  if to_regclass('public.sponsor_player_state') is null or to_regprocedure('public.sponsor_generate_offers_internal(uuid, timestamptz)') is null then
    raise exception 'Run 20261122_01, _02 and _03 first.';
  end if;
  if to_regclass('public.tour_schedule') is null then
    raise exception 'public.tour_schedule (the game calendar) does not exist: the generator needs the real calendar. Nothing was changed.';
  end if;
end $guard$;

-- 1. the real calendar: guaranteed Tour weeks inside a contract ---------------------------------------------------------------
-- A contract signed in week s covers the game weeks s .. s+W-1 (same arithmetic as contract_expiry_at). The player may sign any day of the
-- 21 days the offer is valid, so only weeks that lie after the LATEST possible signing week (registration still possible) and inside the
-- EARLIEST possible contract are guaranteed. Several Tours in the same week count once (a rider enters only one of them).
-- The season start is read from public.game_season_one_start() when that exists, else the project constant 2026-08-17 (apps/web/src/lib/calendar/season.ts).
create or replace function public.sponsor_reachable_tours(p_now timestamptz, p_weeks int)
returns int language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_start date; v_w_now int; v_w_latest int; v_first int; v_last int; v_n int;
begin
  if to_regclass('public.tour_schedule') is null or p_weeks is null or p_weeks < 1 then return 0; end if;
  if to_regprocedure('public.game_season_one_start()') is not null then execute 'select public.game_season_one_start()' into v_start; end if;
  v_start := coalesce(v_start, date '2026-08-17');
  v_w_now    := greatest(0, (p_now at time zone 'utc')::date - v_start) / 7;
  v_w_latest := greatest(0, ((p_now + interval '21 days') at time zone 'utc')::date - v_start) / 7;
  v_first := v_w_latest + 1;
  v_last  := v_w_now + p_weeks - 1;
  if v_last < v_first then return 0; end if;
  select count(*) into v_n from generate_series(v_first, v_last) k
   where exists (select 1 from public.tour_schedule s where s.week_number = (k % 10) + 1);
  return v_n;
end $$;

-- the goal picker now receives the REAL number of reachable Tour weeks (it used to receive the contract length and estimate)
drop function if exists public.sponsor_pick_goals(text, int, text, text);
create function public.sponsor_pick_goals(p_league text, p_reach_tours int, p_tier text, p_seed text, out g1 text, out g2 text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare w public.sponsor_league_goal_windows; v_shift int := case p_tier when 'high' then 1 when 'low' then -1 else 0 end;
        v_reach int := coalesce(p_reach_tours, 0); v_min int; v_max int; e_rank int;
begin
  select * into w from public.sponsor_league_goal_windows where league = p_league;
  if not found then return; end if;
  select min(rank), max(rank) into v_min, v_max from public.sponsor_goal_catalog c
    where c.implemented and c.min_tours <= v_reach and public.sponsor_goal_allowed(c.goal_type, p_league);
  if v_min is null or v_min = v_max then return; end if;

  select c.goal_type, c.rank into g1, e_rank from public.sponsor_goal_catalog c
   where c.implemented and c.min_tours <= v_reach and public.sponsor_goal_allowed(c.goal_type, p_league)
     and c.rank between greatest(v_min, least(v_max, w.easy_from + v_shift)) and greatest(v_min, least(v_max, w.easy_to + v_shift))
   order by md5(p_seed || 'easy' || c.goal_type) limit 1;
  if g1 is null then
    select c.goal_type, c.rank into g1, e_rank from public.sponsor_goal_catalog c
     where c.implemented and c.min_tours <= v_reach and public.sponsor_goal_allowed(c.goal_type, p_league) order by c.rank limit 1;
  end if;

  select c.goal_type into g2 from public.sponsor_goal_catalog c
   where c.implemented and c.min_tours <= v_reach and public.sponsor_goal_allowed(c.goal_type, p_league) and c.rank > e_rank
     and c.rank between greatest(v_min, least(v_max, w.hard_from + v_shift)) and greatest(v_min, least(v_max, w.hard_to + v_shift))
   order by md5(p_seed || 'hard' || c.goal_type) limit 1;
  if g2 is null then
    select c.goal_type into g2 from public.sponsor_goal_catalog c
     where c.implemented and c.min_tours <= v_reach and public.sponsor_goal_allowed(c.goal_type, p_league) and c.rank > e_rank order by c.rank limit 1;
  end if;
  if g2 is null then
    g2 := g1;
    select c.goal_type into g1 from public.sponsor_goal_catalog c
     where c.implemented and c.min_tours <= v_reach and public.sponsor_goal_allowed(c.goal_type, p_league) and c.rank < e_rank order by c.rank desc limit 1;
  end if;
end $$;

-- 2. database guards: one company per player (valid offer / active contract / last signed) ----------------------------------------
create or replace function public.sponsor_player_lock(p_player uuid) returns void
language sql as $$ select pg_advisory_xact_lock(hashtextextended('sponsor_player:' || p_player::text, 0)) $$;

create or replace function public.sponsor_offer_company_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_last uuid;
begin
  if new.status <> 'open' then return new; end if;
  perform public.sponsor_player_lock(new.player_id);                       -- concurrent offers/contracts of ONE player queue here
  if exists (select 1 from public.sponsor_offers o where o.player_id = new.player_id and o.company_id = new.company_id and o.status = 'open' and o.id <> new.id) then
    raise exception 'sponsor_company_already_offered' using errcode = '23505';
  end if;
  if exists (select 1 from public.sponsor_contracts c where c.player_id = new.player_id and c.company_id = new.company_id and c.status = 'active') then
    raise exception 'sponsor_company_has_active_contract' using errcode = '23505';
  end if;
  select company_id into v_last from public.sponsor_contracts where player_id = new.player_id order by signed_at desc, id limit 1;
  if v_last is not null and v_last = new.company_id then
    raise exception 'sponsor_same_company_twice' using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists sponsor_offers_company_guard_trg on public.sponsor_offers;
create trigger sponsor_offers_company_guard_trg before insert on public.sponsor_offers for each row execute function public.sponsor_offer_company_guard();

create or replace function public.sponsor_contract_company_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status <> 'active' then return new; end if;
  perform public.sponsor_player_lock(new.player_id);
  if exists (select 1 from public.sponsor_contracts c where c.player_id = new.player_id and c.company_id = new.company_id and c.status = 'active' and c.id <> new.id) then
    raise exception 'sponsor_company_has_active_contract' using errcode = '23505';
  end if;
  -- any OTHER valid offer of the same firm (the offer being signed is new.offer_id): the pair "contract + offer of one firm" must never exist
  if exists (select 1 from public.sponsor_offers o where o.player_id = new.player_id and o.company_id = new.company_id and o.status = 'open' and o.id <> new.offer_id) then
    raise exception 'sponsor_company_already_offered' using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists sponsor_contracts_company_guard_trg on public.sponsor_contracts;
create trigger sponsor_contracts_company_guard_trg before insert on public.sponsor_contracts for each row execute function public.sponsor_contract_company_guard();

revoke execute on function public.sponsor_player_lock(uuid), public.sponsor_offer_company_guard(), public.sponsor_contract_company_guard(),
  public.sponsor_reachable_tours(timestamptz, int), public.sponsor_pick_goals(text, int, text, text, out text, out text) from public, anon, authenticated;

-- belt and braces: a unique index for active contracts. Created only when NO duplicate exists yet (otherwise the trigger still protects new rows
-- and sponsor_duplicate_report() lists the old ones; nothing is deleted and this file does not fail).
do $idx$ begin
  if exists (select 1 from public.sponsor_contracts where status = 'active' group by player_id, company_id having count(*) > 1) then
    raise warning 'sponsor_contracts has duplicate ACTIVE contracts of one company for one player: unique index NOT created; run select * from public.sponsor_duplicate_report();';
  else
    create unique index if not exists sponsor_contracts_one_active_per_company on public.sponsor_contracts (player_id, company_id) where status = 'active';
  end if;
end $idx$;

-- 3. existing duplicates: read-only report + dry-run fixer (owner only) --------------------------------------------------------
create or replace function public.sponsor_duplicate_report()
returns table (issue text, player_id uuid, company_id uuid, company_name text, offer_id uuid, contract_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'open_offer_and_active_contract', o.player_id, o.company_id, co.name, o.id, k.id
    from public.sponsor_offers o join public.sponsor_contracts k on k.player_id = o.player_id and k.company_id = o.company_id and k.status = 'active'
    join public.sponsor_companies co on co.id = o.company_id where o.status = 'open'
  union all
  select 'two_open_offers_same_company', o.player_id, o.company_id, co.name, o.id, null::uuid
    from public.sponsor_offers o join public.sponsor_companies co on co.id = o.company_id
   where o.status = 'open' and exists (select 1 from public.sponsor_offers x where x.player_id = o.player_id and x.company_id = o.company_id and x.status = 'open' and x.id <> o.id)
  union all
  select 'two_active_contracts_same_company', k.player_id, k.company_id, co.name, null::uuid, k.id
    from public.sponsor_contracts k join public.sponsor_companies co on co.id = k.company_id
   where k.status = 'active' and exists (select 1 from public.sponsor_contracts x where x.player_id = k.player_id and x.company_id = k.company_id and x.status = 'active' and x.id <> k.id)
  order by 1, 2, 4
$$;

-- p_apply = false (default): only lists. p_apply = true: sets the conflicting OPEN OFFER to 'expired' (history kept). Contracts are never touched:
-- two active contracts of one company must be reviewed by the owner by hand.
create or replace function public.sponsor_fix_duplicate_offers(p_apply boolean default false)
returns table (action text, player_id uuid, company_name text, offer_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in select * from public.sponsor_duplicate_report() d where d.issue = 'open_offer_and_active_contract' loop
    if p_apply then update public.sponsor_offers set status = 'expired', resolved_at = now() where id = r.offer_id and status = 'open'; end if;
    action := case when p_apply then 'expired' else 'would_expire' end; player_id := r.player_id; company_name := r.company_name; offer_id := r.offer_id;
    return next;
  end loop;
end $$;
revoke execute on function public.sponsor_duplicate_report(), public.sponsor_fix_duplicate_offers(boolean) from public, anon, authenticated;

-- 4. the generator, now with: per-player lock, ALL active contracts excluded, real calendar --------------------------------------
create or replace function public.sponsor_generate_offers_internal(p_player uuid, p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key date := public.sponsor_week_key(p_now); v_league text; v_state public.sponsor_player_state; v_enabled boolean;
  v_open int; v_need int; v_last uuid; v_tier text; v_made int := 0; v_eligible int; r record; v_weeks int; v_seed text; v_g1 text; v_g2 text; v_reach int;
begin
  select generator_enabled into v_enabled from public.sponsor_generator_settings where id;
  if not coalesce(v_enabled, false) then return 0; end if;
  perform public.sponsor_player_lock(p_player);                                         -- same lock the database guards use: concurrent runs queue here
  select league into v_league from public.profiles where id = p_player for update;
  if v_league is null then return 0; end if;
  select * into v_state from public.sponsor_player_state where player_id = p_player;     -- read AFTER the lock: a queued run sees the first run's state
  if found and v_state.last_fill_week_key >= v_key then return 0; end if;

  select count(*) into v_eligible from public.sponsor_companies where kind = 'main' and active and catalog_no is not null;
  if v_eligible = 0 then return 0; end if;
  -- real calendar: no Tour guaranteed inside a 10-week contract (or no calendar at all) -> nothing is generated and NO state is stored (retry on the next call)
  if public.sponsor_reachable_tours(p_now, 10) = 0 then return 0; end if;

  update public.sponsor_offers set status = 'expired', resolved_at = p_now
   where player_id = p_player and kind = 'main' and status = 'open' and expires_at <= p_now;

  select count(*) into v_open from public.sponsor_offers where player_id = p_player and kind = 'main' and status = 'open';
  v_need := greatest(0, 3 - v_open);
  select company_id into v_last from public.sponsor_contracts where player_id = p_player order by signed_at desc, id limit 1;
  v_tier := public.sponsor_player_form(p_player);

  for r in
    select c.id from public.sponsor_companies c
     where c.kind = 'main' and c.active and c.catalog_no is not null
       and not exists (select 1 from public.sponsor_offers o where o.player_id = p_player and o.company_id = c.id and o.status = 'open')          -- valid offer (any kind)
       and not exists (select 1 from public.sponsor_contracts k where k.player_id = p_player and k.company_id = c.id and k.status = 'active')    -- active contract
       and (v_last is null or c.id <> v_last)                                                                                                   -- not twice in a row
     order by md5(p_player::text || v_key::text || c.id::text)
  loop
    exit when v_made >= v_need;
    v_seed := p_player::text || v_key::text || r.id::text;
    v_weeks := case when v_league = 'elite' and get_byte(decode(md5(v_seed || 'len'), 'hex'), 0) % 2 = 1 then 20 else 10 end;
    v_reach := public.sponsor_reachable_tours(p_now, v_weeks);
    select g1, g2 into v_g1, v_g2 from public.sponsor_pick_goals(v_league, v_reach, v_tier, v_seed);
    continue when v_g1 is null or v_g2 is null or v_g1 = v_g2;
    insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, status, created_at, expires_at, generator_version, generator_tier)
    values (p_player, r.id, 'main', v_weeks, v_g1, v_g2, 'open', p_now, p_now + interval '21 days', 'g2', v_tier);
    v_made := v_made + 1;
  end loop;

  insert into public.sponsor_player_state (player_id, last_fill_week_key, last_fill_at) values (p_player, v_key, p_now)
  on conflict (player_id) do update set last_fill_week_key = excluded.last_fill_week_key, last_fill_at = excluded.last_fill_at;
  return v_made;
end $$;
revoke execute on function public.sponsor_generate_offers_internal(uuid, timestamptz) from public, anon, authenticated;

commit;
