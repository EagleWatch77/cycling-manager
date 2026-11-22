-- ============================================================================
-- Sponzori — VEDĽAJŠÍ SPONZORI (owner 2026-11-22). Whole file, one transaction, idempotent, additive.
-- Run ONCE, AFTER 20261122_01 .. _05 (they are already applied in production: do NOT run them again). NOT RUN yet.
--
--  1. CATALOGUE: the 50 approved fictional SECONDARY sponsors (sponsor_companies.kind = 'secondary', catalog_no 1..50) next to the 30 main ones
--     = 80 companies. Re-running creates no duplicate (unique name, ON CONFLICT DO NOTHING) and ends with a self-check (exactly 30 main + 50 secondary).
--  2. GENERATOR: the existing server-side generator now fills TWO personal markets per player: up to 3 MAIN and up to 3 SECONDARY offers (max 6).
--     Same rules for both: one company per player (a valid offer of ANY kind / an active contract of ANY kind / the last signed company are excluded;
--     the database guards from _04/_05 already work by company_id, so they cover secondary offers at INSERT and UPDATE and under concurrency),
--     exactly 21 days of validity, no money, 2 different goals (easier / harder), nothing is created without suitable goals.
--     A secondary contract is always 5 game weeks (sponsor_duration_allowed) and its goals are judged against the REAL calendar of THOSE 5 weeks:
--     sponsor_reachable_tours_min() = the number of race weeks (tour_schedule) that the contract is GUARANTEED to contain after the signing week,
--     taken as the MINIMUM over every possible signing week inside the 21 days of validity. (The main-offer function from _04 is left untouched.)
--  3. PER-KIND STATE: sponsor_player_state gets secondary_fill_week_key/at. A player who already has his main offers (state from _03) has no
--     secondary key yet, so his FIRST visit of /sponsors after this migration fills the 3 secondary offers ONCE and immediately; his main offers are not
--     touched (the main part is skipped: its period key is already current). From then on the secondary market follows the same rule as the main one:
--     a rejected/expired offer is replaced at the next update period = Sunday 00:00 Europe/Bratislava, never at once. A new player gets 3 + 3 at registration.
--  4. LOG: when fewer offers than needed can be made, the reason is stored (sponsor_generator_log, closed to players, one row per player/kind/period/reason).
-- NOT DONE ON PURPOSE: no money, no signing, no payout, no early termination, no scheduler (the weekly refill is still lazy: first visit after Sunday 00:00).
-- Changes no existing offer, contract, rider or money. Deletes nothing.
-- ============================================================================

-- One transaction: either the whole file is applied or nothing (a failed run leaves no half-state).
begin;

do $guard$ begin
  if to_regprocedure('public.sponsor_reachable_tours(timestamptz, integer)') is null
     or not exists (select 1 from pg_trigger where tgname = 'sponsor_offers_company_guard_upd_trg' and not tgisinternal)
     or to_regclass('public.sponsor_player_state') is null then
    raise exception 'Run 20261122_01 .. _05 first (they must already be applied). Nothing was changed.';
  end if;
end $guard$;

-- 1. the approved catalogue of SECONDARY sponsors (order = the approved list) ------------------------------------------------------
insert into public.sponsor_companies (name, kind, catalog_no)
select n, 'secondary', o from unnest(array[
  'Velora Nutrition','Endriva Fuel','Nutrexia Sport','Proventa Hydration','Carbion Energy','Hydrava','Peakora Nutrition','Vitanex Sport','Geltrix','Revora Recovery',
  'Aerion Helmets','Veltrix Apparel','Gripora','Pedalix','Carbonex Components','Optivelo','Rovenna Sportswear','Spinora','Vexaro Gear','Lumetra Lights',
  'Nexbit Digital','Trackora Systems','Pulsion Tech','DataVelo','Synexis Mobile','Velometric','Optaris Electronics','Cloudvanta','Nexaro Devices','Chronexa',
  'Montiva Hotels','Traveon','Alpiora Resorts','Routevia Travel','Velmont Coffee','Frutella Foods','Granovia','Naturivo','Aquenor Water','Bravento Foods',
  'Transvex Express','Moventra Logistics','Packora','Urbanexa','Servion Auto','Finora Pay','Insurevia','Noventra Media','Printora Studio','EcoVantis'
]) with ordinality as t(n, o)
on conflict (name) do nothing;

-- a re-run (or a name that already existed) still gets its catalogue number, without touching anything else
update public.sponsor_companies c set catalog_no = t.o
from unnest(array[
  'Velora Nutrition','Endriva Fuel','Nutrexia Sport','Proventa Hydration','Carbion Energy','Hydrava','Peakora Nutrition','Vitanex Sport','Geltrix','Revora Recovery',
  'Aerion Helmets','Veltrix Apparel','Gripora','Pedalix','Carbonex Components','Optivelo','Rovenna Sportswear','Spinora','Vexaro Gear','Lumetra Lights',
  'Nexbit Digital','Trackora Systems','Pulsion Tech','DataVelo','Synexis Mobile','Velometric','Optaris Electronics','Cloudvanta','Nexaro Devices','Chronexa',
  'Montiva Hotels','Traveon','Alpiora Resorts','Routevia Travel','Velmont Coffee','Frutella Foods','Granovia','Naturivo','Aquenor Water','Bravento Foods',
  'Transvex Express','Moventra Logistics','Packora','Urbanexa','Servion Auto','Finora Pay','Insurevia','Noventra Media','Printora Studio','EcoVantis'
]) with ordinality as t(n, o)
where c.name = t.n and c.catalog_no is null and c.kind = 'secondary';

do $v$ declare v_s int; v_m int; v_all int; begin
  select count(*) into v_s from public.sponsor_companies where kind = 'secondary' and catalog_no between 1 and 50 and active;
  select count(*) into v_m from public.sponsor_companies where kind = 'main' and catalog_no between 1 and 30 and active;
  select count(*) into v_all from public.sponsor_companies where catalog_no is not null;
  if v_s <> 50 then raise exception 'sponsor catalogue check failed: expected 50 secondary sponsors, found %', v_s; end if;
  if v_m <> 30 then raise exception 'sponsor catalogue check failed: expected 30 main sponsors, found %', v_m; end if;
  if v_all <> 80 then raise exception 'sponsor catalogue check failed: expected 80 numbered companies, found %', v_all; end if;
end $v$;

-- 2. per-kind state + the log ----------------------------------------------------------------------------------------------------------------
alter table public.sponsor_player_state alter column last_fill_week_key drop not null;
alter table public.sponsor_player_state alter column last_fill_at drop not null;
alter table public.sponsor_player_state add column if not exists secondary_fill_week_key date;
alter table public.sponsor_player_state add column if not exists secondary_fill_at timestamptz;

create table if not exists public.sponsor_generator_log (
  id bigint generated always as identity primary key,
  player_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('main', 'secondary')),
  week_key date not null,
  reason text not null check (reason in ('no_catalogue', 'no_race_weeks_in_contract', 'fewer_offers_than_needed')),
  needed int not null,
  made int not null,
  created_at timestamptz not null default now(),
  unique (player_id, kind, week_key, reason)
);
alter table public.sponsor_generator_log enable row level security;
revoke all on public.sponsor_generator_log from public, anon, authenticated;

-- 3. calendar: race weeks a contract of p_weeks weeks is guaranteed to contain, whatever week the player signs in -----------------
-- Signing week s lies between the week of p_now and the week of p_now + 21 days; the contract covers game weeks s .. s+p_weeks-1; only weeks AFTER
-- the signing week count (registration still possible); several Tours in one week count once. Result = the minimum over all possible s.
create or replace function public.sponsor_reachable_tours_min(p_now timestamptz, p_weeks int)
returns int language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_start date; v_w_now int; v_w_latest int; v_min int;
begin
  if to_regclass('public.tour_schedule') is null or p_weeks is null or p_weeks < 2 then return 0; end if;
  if to_regprocedure('public.game_season_one_start()') is not null then execute 'select public.game_season_one_start()' into v_start; end if;
  v_start := coalesce(v_start, date '2026-08-17');
  v_w_now    := greatest(0, (p_now at time zone 'utc')::date - v_start) / 7;
  v_w_latest := greatest(0, ((p_now + interval '21 days') at time zone 'utc')::date - v_start) / 7;
  select min(c) into v_min from (
    select (select count(*) from generate_series(s + 1, s + p_weeks - 1) k
             where exists (select 1 from public.tour_schedule t where t.week_number = (k % 10) + 1)) as c
    from generate_series(v_w_now, v_w_latest) s) z;
  return coalesce(v_min, 0);
end $$;

-- 4. the generator, one kind at a time ------------------------------------------------------------------------------------------------------
-- p_kind 'main' behaves EXACTLY as the generator of _04 (same selection, same goals, same calendar function); 'secondary' uses 5-week contracts and the
-- calendar function above. Returns made (offers created) and store (true = the period of this kind counts as handled; false = nothing could be judged
-- yet, e.g. no calendar or no catalogue, so the next call retries).
create or replace function public.sponsor_fill_kind_internal(p_player uuid, p_kind text, p_league text, p_tier text, p_last uuid, p_now timestamptz, p_key date,
                                                             out made int, out store boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_eligible int; v_reach int; v_open int; v_need int; r record; v_weeks int; v_seed text; v_g1 text; v_g2 text; v_ver text := case p_kind when 'main' then 'g2' else 'g3' end;
begin
  made := 0; store := false;
  select count(*) into v_eligible from public.sponsor_companies where kind = p_kind and active and catalog_no is not null;
  if v_eligible = 0 then
    insert into public.sponsor_generator_log (player_id, kind, week_key, reason, needed, made) values (p_player, p_kind, p_key, 'no_catalogue', 3, 0) on conflict do nothing;
    return;
  end if;
  v_reach := case p_kind when 'main' then public.sponsor_reachable_tours(p_now, 10) else public.sponsor_reachable_tours_min(p_now, 5) end;
  if v_reach = 0 then
    insert into public.sponsor_generator_log (player_id, kind, week_key, reason, needed, made) values (p_player, p_kind, p_key, 'no_race_weeks_in_contract', 3, 0) on conflict do nothing;
    return;
  end if;

  update public.sponsor_offers set status = 'expired', resolved_at = p_now
   where player_id = p_player and kind = p_kind and status = 'open' and expires_at <= p_now;
  select count(*) into v_open from public.sponsor_offers where player_id = p_player and kind = p_kind and status = 'open';
  v_need := greatest(0, 3 - v_open);

  for r in
    select c.id from public.sponsor_companies c
     where c.kind = p_kind and c.active and c.catalog_no is not null
       and not exists (select 1 from public.sponsor_offers o where o.player_id = p_player and o.company_id = c.id and o.status = 'open')          -- valid offer (any kind)
       and not exists (select 1 from public.sponsor_contracts k where k.player_id = p_player and k.company_id = c.id and k.status = 'active')    -- active contract (any kind)
       and (p_last is null or c.id <> p_last)                                                                                                   -- not twice in a row
     order by md5(p_player::text || p_key::text || c.id::text)
  loop
    exit when made >= v_need;
    v_seed := p_player::text || p_key::text || r.id::text;
    if p_kind = 'main' then
      v_weeks := case when p_league = 'elite' and get_byte(decode(md5(v_seed || 'len'), 'hex'), 0) % 2 = 1 then 20 else 10 end;
      v_reach := public.sponsor_reachable_tours(p_now, v_weeks);
    else
      v_weeks := 5;
      v_reach := public.sponsor_reachable_tours_min(p_now, 5);
    end if;
    select g1, g2 into v_g1, v_g2 from public.sponsor_pick_goals(p_league, v_reach, p_tier, v_seed);
    continue when v_g1 is null or v_g2 is null or v_g1 = v_g2;
    insert into public.sponsor_offers (player_id, company_id, kind, duration_weeks, goal1_type, goal2_type, status, created_at, expires_at, generator_version, generator_tier)
    values (p_player, r.id, p_kind, v_weeks, v_g1, v_g2, 'open', p_now, p_now + interval '21 days', v_ver, p_tier);
    made := made + 1;
  end loop;

  if made < v_need then
    insert into public.sponsor_generator_log (player_id, kind, week_key, reason, needed, made) values (p_player, p_kind, p_key, 'fewer_offers_than_needed', v_need, made) on conflict do nothing;
  end if;
  store := true;
end $$;

-- the entry point keeps its name and signature (ensure_my_sponsor_offers, the weekly update and the registration trigger call it unchanged)
create or replace function public.sponsor_generate_offers_internal(p_player uuid, p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key date := public.sponsor_week_key(p_now); v_league text; v_state public.sponsor_player_state; v_found boolean; v_enabled boolean;
  v_do_main boolean; v_do_sec boolean; v_tier text; v_last uuid; v_made int := 0; v_n int; v_main_store boolean := false; v_sec_store boolean := false;
begin
  select generator_enabled into v_enabled from public.sponsor_generator_settings where id;
  if not coalesce(v_enabled, false) then return 0; end if;
  perform public.sponsor_player_lock(p_player);                                         -- same lock the database guards use: concurrent runs queue here
  select league into v_league from public.profiles where id = p_player for update;
  if v_league is null then return 0; end if;
  select * into v_state from public.sponsor_player_state where player_id = p_player;     -- read AFTER the lock
  v_found := found;
  -- main: its own period key (unchanged meaning). secondary: its own key; a missing key = the one-time first fill, which does not touch the main market.
  v_do_main := not v_found or v_state.last_fill_week_key is null or v_state.last_fill_week_key < v_key;
  v_do_sec  := not v_found or v_state.secondary_fill_week_key is null or v_state.secondary_fill_week_key < v_key;
  if not v_do_main and not v_do_sec then return 0; end if;

  v_tier := public.sponsor_player_form(p_player);
  select company_id into v_last from public.sponsor_contracts where player_id = p_player order by signed_at desc, id limit 1;

  if v_do_main then select f.made, f.store into v_n, v_main_store from public.sponsor_fill_kind_internal(p_player, 'main', v_league, v_tier, v_last, p_now, v_key) f; v_made := v_made + v_n; end if;
  if v_do_sec  then select f.made, f.store into v_n, v_sec_store from public.sponsor_fill_kind_internal(p_player, 'secondary', v_league, v_tier, v_last, p_now, v_key) f; v_made := v_made + v_n; end if;

  if v_main_store or v_sec_store then
    insert into public.sponsor_player_state (player_id) values (p_player) on conflict (player_id) do nothing;
    if v_main_store then update public.sponsor_player_state set last_fill_week_key = v_key, last_fill_at = p_now where player_id = p_player; end if;
    if v_sec_store then update public.sponsor_player_state set secondary_fill_week_key = v_key, secondary_fill_at = p_now where player_id = p_player; end if;
  end if;
  return v_made;
end $$;

revoke execute on function public.sponsor_reachable_tours_min(timestamptz, int), public.sponsor_fill_kind_internal(uuid, text, text, text, uuid, timestamptz, date, out int, out boolean),
  public.sponsor_generate_offers_internal(uuid, timestamptz) from public, anon, authenticated;

commit;
