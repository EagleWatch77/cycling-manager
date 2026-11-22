-- ============================================================================
-- Sponzori — GENERÁTOR OSOBNÝCH PONÚK HLAVNÝCH SPONZOROV (owner 2026-11-22). Whole file, idempotent, additive.
-- Run AFTER 20261122_01 and 20261122_02 (it refuses otherwise). Deletes nothing, changes no rider, no contract, no money.
--
-- WHAT IT DOES (all on the SERVER, in the database)
--   * every player gets up to 3 personal MAIN offers chosen from the 30-company catalogue (sponsor_companies kind 'main');
--     a set never contains the same company twice; the choice is individual (hash of player + update period + company);
--     the company of the player's most recently signed contract is not offered again (the existing "not twice in a row" rule, interpretation unchanged);
--   * each offer has EXACTLY 2 different goals chosen from sponsor_goal_catalog: an easier one and a harder one, by league, contract length,
--     calendar and (after >= 2 Tours with REAL results) the player's real form; only goals the game can really evaluate are offered;
--   * an offer lives exactly 21 days from creation (CHECK from 20261122_02); money columns stay NULL ("Zatiaľ neurčené");
--   * a new player gets the first 3 offers AT ONCE (trigger on profiles, best effort) and, as a safety net, on the first visit of /sponsors
--     (ensure_my_sponsor_offers());
--   * refill = the next weekly update (Sunday 00:00 Europe/Bratislava, DST-safe) after the offers were rejected/expired: unexpired offers stay,
--     only the missing ones are added (never above 3); repeated calls in the same period create nothing (sponsor_player_state);
--   * players are generated offers even when every main slot is taken (signing is blocked later by the contract guard).
-- NOT DONE ON PURPOSE: no money, no signing, no payout, no secondary offers, no scheduler (see the weekly update note at the end).
-- Players can no longer read the whole catalogue: RLS now returns only the companies of their OWN offers/contracts.
-- Rollback: drop the trigger sponsor_profile_created_trg and the functions below, restore policy sponsor_companies_select from 20261122_01.
-- ============================================================================

-- One transaction: either the whole file is applied or nothing (a failed run leaves no half-state).
begin;

-- ORDER GUARD: this file is OLDER than a migration that is already applied. Running it again would silently put an older version of shared
-- functions back, so it refuses (nothing is changed). Run the sponsor migrations once, in order; only the NEWEST one may be repeated.
do $order$ begin
  if to_regprocedure('public.sponsor_reachable_tours(timestamptz, integer)') is not null then
    raise exception '20261122_03 must not be run again: _04 (or later) is already applied and would be overwritten by an older generator. Nothing was changed.';
  end if;
end $order$;

do $guard$ begin
  if to_regclass('public.sponsor_companies') is null or to_regclass('public.sponsor_offers') is null
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='sponsor_companies' and column_name='catalog_no') then
    raise exception 'Run 20261122_01_sponsors_foundation.sql and 20261122_02_sponsor_catalog_main_30.sql first.';
  end if;
end $guard$;

-- 1. configuration tables (data-driven, owner can tune them later without code) ---------------------------------------------
-- rank = the difficulty ladder used to choose "easier" and "harder". implemented = the game can really evaluate this goal today.
create table if not exists public.sponsor_goal_catalog (
  goal_type text primary key check (goal_type in ('participateTour','finishTour','top50','top10','winStage','anyJersey','winTour','winSeason','promotion','participateWorlds','top3Worlds','winWorlds')),
  rank smallint not null unique,
  repeatable boolean not null,
  implemented boolean not null,
  min_tours smallint not null default 1 check (min_tours >= 0),      -- Tours that must be reachable during the contract
  note text
);
insert into public.sponsor_goal_catalog (goal_type, rank, repeatable, implemented, min_tours, note) values
  ('participateTour', 1, true,  true,  1, null),
  ('finishTour',      2, true,  true,  1, null),
  ('top50',           3, true,  true,  1, null),
  ('top10',           4, true,  true,  1, null),
  ('winStage',        5, true,  true,  1, null),
  ('anyJersey',       6, true,  true,  1, 'every Tour in data/tours.ts has jerseys'),
  ('winTour',         7, true,  true,  1, null),
  ('winSeason',       8, false, false, 1, 'NOT offered: the definition of "winning the season" is not decided'),
  ('promotion',       9, false, false, 1, 'NOT offered: promotion/relegation is not implemented (C-025)'),
  ('participateWorlds',10, false, false, 1, 'NOT offered: World Championships are not implemented (C-021)'),
  ('top3Worlds',     11, false, false, 1, 'NOT offered: World Championships are not implemented'),
  ('winWorlds',      12, false, false, 1, 'NOT offered: World Championships are not implemented')
on conflict (goal_type) do nothing;

-- which ranks of the ladder are "easier" / "harder" in each league (base form). PROPOSAL awaiting owner approval (O-032).
create table if not exists public.sponsor_league_goal_windows (
  league text primary key check (league in ('rookie','amateur','continental','pro','elite')),
  easy_from smallint not null, easy_to smallint not null, hard_from smallint not null, hard_to smallint not null,
  check (easy_from <= easy_to and hard_from <= hard_to and easy_from <= hard_from and easy_to <= hard_to)
);
insert into public.sponsor_league_goal_windows (league, easy_from, easy_to, hard_from, hard_to) values
  ('rookie', 1, 2, 3, 4), ('amateur', 2, 3, 4, 5), ('continental', 2, 3, 4, 6), ('pro', 3, 4, 5, 7), ('elite', 3, 4, 5, 7)
on conflict (league) do nothing;

create table if not exists public.sponsor_generator_settings (
  id boolean primary key default true check (id),
  generator_enabled boolean not null default true,                      -- pause switch
  form_min_tours int not null default 2 check (form_min_tours >= 1),    -- real results are used after this many Tours (owner: after the first two)
  form_high_pct numeric not null default 0.25,                          -- average finishing percentile <= this -> 'high' form (PROPOSAL, O-032)
  form_low_pct numeric not null default 0.75                            -- >= this -> 'low' form (PROPOSAL, O-032)
);
insert into public.sponsor_generator_settings (id) values (true) on conflict (id) do nothing;

-- one row per player: the update period in which the market was last filled (idempotency of the weekly refill)
create table if not exists public.sponsor_player_state (
  player_id uuid primary key references auth.users (id) on delete cascade,
  last_fill_week_key date not null,
  last_fill_at timestamptz not null
);

alter table public.sponsor_offers add column if not exists generator_version text;
alter table public.sponsor_offers add column if not exists generator_tier text;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'sponsor_offers_generator_tier_check') then
    alter table public.sponsor_offers add constraint sponsor_offers_generator_tier_check check (generator_tier is null or generator_tier in ('base','low','high'));
  end if;
end $c$;

alter table public.sponsor_goal_catalog enable row level security;
alter table public.sponsor_league_goal_windows enable row level security;
alter table public.sponsor_generator_settings enable row level security;
alter table public.sponsor_player_state enable row level security;
revoke all on public.sponsor_goal_catalog, public.sponsor_league_goal_windows, public.sponsor_generator_settings, public.sponsor_player_state from public, anon, authenticated;

-- 2. a player sees only the companies of HIS OWN offers and contracts (not the catalogue) ------------------------------------
drop policy if exists sponsor_companies_select on public.sponsor_companies;
drop policy if exists sponsor_companies_select_own on public.sponsor_companies;
create policy sponsor_companies_select_own on public.sponsor_companies for select to authenticated
  using (exists (select 1 from public.sponsor_offers o where o.company_id = sponsor_companies.id and o.player_id = auth.uid())
      or exists (select 1 from public.sponsor_contracts c where c.company_id = sponsor_companies.id and c.player_id = auth.uid()));

-- 3. helpers -------------------------------------------------------------------------------------------------------------------
-- Tours reachable during ANY window of the contract length, counted conservatively: a season has 10 weeks and a player may select at most 3 Tours
-- per season (lib/leagues.ts maxSeasonTours), so a contract of >= 10 weeks always allows >= 3 Tours per 10 weeks; shorter ones are credited 1.
create or replace function public.sponsor_min_reachable_tours(p_weeks int)
returns int language sql immutable as $$ select case when p_weeks >= 10 then 3 * (p_weeks / 10) else 1 end $$;

-- the player's form from REAL results only: 'base' until he has results from >= form_min_tours different Tours.
-- percentile = position / number of recorded results of that Tour. Nothing writes race_results yet, so today everyone is 'base'.
create or replace function public.sponsor_player_form(p_player uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.sponsor_generator_settings; v_tours int; v_avg numeric;
begin
  select * into s from public.sponsor_generator_settings where id;
  with mine as (
    select rr.season_id, rr.tour_id, rr.position::numeric
           / nullif((select count(*) from public.race_results f where f.season_id = rr.season_id and f.tour_id = rr.tour_id), 0) as pct
    from public.race_results rr join public.riders r on r.id = rr.rider_id
    where r.player_id = p_player)
  select count(distinct (season_id, tour_id)), avg(pct) into v_tours, v_avg from mine;
  if v_tours is null or v_tours < s.form_min_tours or v_avg is null then return 'base'; end if;
  if v_avg <= s.form_high_pct then return 'high'; end if;
  if v_avg >= s.form_low_pct then return 'low'; end if;
  return 'base';
end $$;

-- chooses the easier and the harder goal; returns NULLs when fewer than 2 distinct goals are possible (then no offer is made)
create or replace function public.sponsor_pick_goals(p_league text, p_weeks int, p_tier text, p_seed text, out g1 text, out g2 text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare w public.sponsor_league_goal_windows; v_shift int := case p_tier when 'high' then 1 when 'low' then -1 else 0 end;
        v_reach int := public.sponsor_min_reachable_tours(p_weeks); v_min int; v_max int; e_rank int;
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
  if g2 is null then          -- nothing in the harder window: the next harder possible goal
    select c.goal_type into g2 from public.sponsor_goal_catalog c
     where c.implemented and c.min_tours <= v_reach and public.sponsor_goal_allowed(c.goal_type, p_league) and c.rank > e_rank order by c.rank limit 1;
  end if;
  if g2 is null then         -- the easy goal was already the hardest one: keep it as the hard goal and take the next easier one as the easy goal
    g2 := g1;
    select c.goal_type into g1 from public.sponsor_goal_catalog c
     where c.implemented and c.min_tours <= v_reach and public.sponsor_goal_allowed(c.goal_type, p_league) and c.rank < e_rank order by c.rank desc limit 1;
  end if;
end $$;

-- 4. the generator (internal) ------------------------------------------------------------------------------------------------
-- Fills the player's personal MAIN market up to 3 offers. Called (a) at registration, (b) lazily when the player opens /sponsors,
-- (c) by sponsor_weekly_update(). It does something only when the player has no state yet (first fill, at once) or when a new weekly
-- update period (Sunday 00:00 Europe/Bratislava) has started since the last fill. Returns the number of offers created.
create or replace function public.sponsor_generate_offers_internal(p_player uuid, p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key date := public.sponsor_week_key(p_now); v_league text; v_state public.sponsor_player_state; v_enabled boolean;
  v_open int; v_need int; v_last uuid; v_tier text; v_made int := 0; v_eligible int; r record; v_weeks int; v_seed text; v_g1 text; v_g2 text;
begin
  select generator_enabled into v_enabled from public.sponsor_generator_settings where id;
  if not coalesce(v_enabled, false) then return 0; end if;
  select league into v_league from public.profiles where id = p_player for update;       -- serialises concurrent runs for this player
  if v_league is null then return 0; end if;
  select * into v_state from public.sponsor_player_state where player_id = p_player;
  if found and v_state.last_fill_week_key >= v_key then return 0; end if;                -- already filled in this update period

  select count(*) into v_eligible from public.sponsor_companies where kind = 'main' and active and catalog_no is not null;
  if v_eligible = 0 then return 0; end if;                                               -- empty catalogue: change nothing, retry later

  -- weekly step 1: offers whose 21 days are over expire (main offers only; secondary offers are never touched)
  update public.sponsor_offers set status = 'expired', resolved_at = p_now
   where player_id = p_player and kind = 'main' and status = 'open' and expires_at <= p_now;

  select count(*) into v_open from public.sponsor_offers where player_id = p_player and kind = 'main' and status = 'open';
  v_need := greatest(0, 3 - v_open);
  select company_id into v_last from public.sponsor_contracts where player_id = p_player order by signed_at desc, id limit 1;
  v_tier := public.sponsor_player_form(p_player);

  -- weekly step 2: add the missing offers (unexpired ones stay); never the same company twice, never the last signed one
  for r in
    select c.id from public.sponsor_companies c
     where c.kind = 'main' and c.active and c.catalog_no is not null
       and not exists (select 1 from public.sponsor_offers o where o.player_id = p_player and o.company_id = c.id and o.status = 'open')
       and (v_last is null or c.id <> v_last)
     order by md5(p_player::text || v_key::text || c.id::text)
  loop
    exit when v_made >= v_need;
    v_seed := p_player::text || v_key::text || r.id::text;
    v_weeks := case when v_league = 'elite' and get_byte(decode(md5(v_seed || 'len'), 'hex'), 0) % 2 = 1 then 20 else 10 end;
    select g1, g2 into v_g1, v_g2 from public.sponsor_pick_goals(v_league, v_weeks, v_tier, v_seed);
    continue when v_g1 is null or v_g2 is null or v_g1 = v_g2;
    insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, status, created_at, expires_at, generator_version, generator_tier)
    values (p_player, r.id, 'main', v_weeks, v_g1, v_g2, 'open', p_now, p_now + interval '21 days', 'g1', v_tier);
    v_made := v_made + 1;
  end loop;

  insert into public.sponsor_player_state (player_id, last_fill_week_key, last_fill_at) values (p_player, v_key, p_now)
  on conflict (player_id) do update set last_fill_week_key = excluded.last_fill_week_key, last_fill_at = excluded.last_fill_at;
  return v_made;
end $$;

-- the only generator entry point for players: acts for the CALLER only
create or replace function public.ensure_my_sponsor_offers()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return public.sponsor_generate_offers_internal(auth.uid(), now());
end $$;

-- weekly update for ALL players (internal; for a scheduler — see the note below). Idempotent: players already filled in this period are skipped.
create or replace function public.sponsor_weekly_update(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_total int := 0;
begin
  for r in select id from public.profiles loop
    v_total := v_total + public.sponsor_generate_offers_internal(r.id, p_now);
  end loop;
  return v_total;
end $$;

-- registration: the first 3 offers at once. Best effort: a failure here must NEVER break sign-up (the /sponsors page repeats the call).
create or replace function public.sponsor_profile_created() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.sponsor_generate_offers_internal(new.id, now());
  exception when others then
    raise warning 'sponsor offers for new profile % failed: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists sponsor_profile_created_trg on public.profiles;
create trigger sponsor_profile_created_trg after insert on public.profiles for each row execute function public.sponsor_profile_created();

revoke execute on function public.sponsor_min_reachable_tours(int), public.sponsor_player_form(uuid), public.sponsor_pick_goals(text, int, text, text, out text, out text),
  public.sponsor_generate_offers_internal(uuid, timestamptz), public.ensure_my_sponsor_offers(), public.sponsor_weekly_update(timestamptz),
  public.sponsor_profile_created() from public, anon, authenticated;
grant execute on function public.ensure_my_sponsor_offers() to authenticated;

-- ============================================================================
-- SCHEDULER NOTE (NOT CONFIGURED): the project has no scheduler. Today the weekly refill happens LAZILY: the first time a player opens /sponsors after
-- Sunday 00:00 Europe/Bratislava, ensure_my_sponsor_offers() expires his overdue offers and adds the missing ones. That is correct for the player (nobody
-- else can see his market). If you also want it to run without anyone logging in, schedule ONE call after enabling the pg_cron extension (Supabase ->
-- Database -> Extensions), e.g. every hour (the function is idempotent, so the exact minute does not matter):
--     select cron.schedule('sponsor-weekly-update', '5 * * * *', $$select public.sponsor_weekly_update()$$);
-- Do NOT do this before the owner confirms. Until then no scheduler exists and none is claimed.
-- ============================================================================

commit;
