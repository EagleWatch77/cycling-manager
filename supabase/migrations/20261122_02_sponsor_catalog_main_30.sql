-- ============================================================================
-- Sponzori — katalóg 30 schválených HLAVNÝCH sponzorov (owner 2026-11-22). Whole file, idempotent, additive.
-- Run AFTER 20261122_01_sponsors_foundation.sql (it refuses to run without it). Changes no existing row, no rider, no contract.
--
--   * sponsor_companies gets `kind` ('main' | 'secondary', default 'main') and `catalog_no` (order inside the catalogue).
--     A separate catalogue of SECONDARY sponsors can be added later (kind = 'secondary'), nothing here blocks it.
--   * inserts the 30 approved fictional companies (kind 'main', catalog_no 1..30). Re-running creates no duplicate
--     (unique name; ON CONFLICT DO NOTHING) and ends with a self-check that exactly these 30 exist as main sponsors.
--   * offers/contracts: the company's kind must equal the offer's kind (a main offer can only come from a main company).
--   * an offer lives EXACTLY 21 days (expires_at = created_at + 21 days) — owner rule, enforced by a CHECK.
--   * one company may sponsor any number of different players (no global exclusivity; unchanged).
--   * players can only READ the catalogue (RLS from 20261122_01 unchanged); nobody can change it from the browser.
-- NO money is created here and no offer is generated. The economy switch stays FALSE.
-- Rollback (only if needed): delete from public.sponsor_companies where kind='main' and catalog_no between 1 and 30
--   and not exists (select 1 from public.sponsor_offers o where o.company_id = sponsor_companies.id); the columns can stay.
-- ============================================================================

do $guard$ begin
  if to_regclass('public.sponsor_companies') is null or to_regclass('public.sponsor_offers') is null then
    raise exception 'Run 20261122_01_sponsors_foundation.sql first (sponsor tables are missing).';
  end if;
end $guard$;

alter table public.sponsor_companies add column if not exists kind text not null default 'main';
alter table public.sponsor_companies add column if not exists catalog_no int;

do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'sponsor_companies_kind_check') then
    alter table public.sponsor_companies add constraint sponsor_companies_kind_check check (kind in ('main', 'secondary'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sponsor_companies_catalog_no_check') then
    alter table public.sponsor_companies add constraint sponsor_companies_catalog_no_check check (catalog_no is null or catalog_no > 0);
  end if;
  -- an offer lives exactly 21 days from creation
  if not exists (select 1 from pg_constraint where conname = 'sponsor_offers_valid_21_days') then
    alter table public.sponsor_offers add constraint sponsor_offers_valid_21_days check (expires_at = created_at + interval '21 days');
  end if;
end $c$;
create unique index if not exists sponsor_companies_catalog_pos on public.sponsor_companies (kind, catalog_no) where catalog_no is not null;

-- the approved catalogue of main sponsors (order = the approved list)
insert into public.sponsor_companies (name, kind, catalog_no)
select n, 'main', o from unnest(array[
  'Veltaro Cycling','Kadrin Wheels','Aerovex','Torvello Bikes','Rydexa','Solvanta Energy','Noryx Power','Voltaris Group','Eltrava Energy','Energonix',
  'Veltrion Motors','Arvexa Automotive','Nordaris Mobility','Motravia','Axeron Motors','Datrix Systems','Quantelis','Nexoria Tech','Syntrava','Corevanta',
  'Monvera Capital','Asteriq Finance','Valtrix Bank','Norvella Insurance','Fintravo','Altivex Logistics','Montaris Group','Avendra Global','Trinex Industries','Orvanta Holdings'
]) with ordinality as t(n, o)
on conflict (name) do nothing;

-- a re-run (or a name that already existed) still gets its catalogue number, without touching anything else
update public.sponsor_companies c set catalog_no = t.o
from unnest(array[
  'Veltaro Cycling','Kadrin Wheels','Aerovex','Torvello Bikes','Rydexa','Solvanta Energy','Noryx Power','Voltaris Group','Eltrava Energy','Energonix',
  'Veltrion Motors','Arvexa Automotive','Nordaris Mobility','Motravia','Axeron Motors','Datrix Systems','Quantelis','Nexoria Tech','Syntrava','Corevanta',
  'Monvera Capital','Asteriq Finance','Valtrix Bank','Norvella Insurance','Fintravo','Altivex Logistics','Montaris Group','Avendra Global','Trinex Industries','Orvanta Holdings'
]) with ordinality as t(n, o)
where c.name = t.n and c.catalog_no is null and c.kind = 'main';

do $v$ declare v_n int; begin
  select count(*) into v_n from public.sponsor_companies where kind = 'main' and catalog_no between 1 and 30 and active;
  if v_n <> 30 then raise exception 'sponsor catalogue check failed: expected 30 main sponsors, found %', v_n; end if;
end $v$;

-- the company's kind must match the offer's kind (replaces the guards from 20261122_01, same rules plus this one)
create or replace function public.sponsor_offers_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_league text; v_open int; v_ckind text;
begin
  if tg_op = 'INSERT' then        -- league rules are judged when the offer is created; a later promotion must never block rejecting/expiring it
    select league into v_league from public.profiles where id = new.player_id;
    if v_league is null then raise exception 'no_profile'; end if;
    if not public.sponsor_duration_allowed(v_league, new.kind, new.duration_weeks) then raise exception 'duration_not_allowed'; end if;
    if not public.sponsor_goal_allowed(new.goal1_type, v_league) or not public.sponsor_goal_allowed(new.goal2_type, v_league) then
      raise exception 'goal_not_available_in_league';
    end if;
    select kind into v_ckind from public.sponsor_companies where id = new.company_id;
    if v_ckind is distinct from new.kind then raise exception 'company_kind_mismatch'; end if;
  end if;
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open') then
    perform 1 from public.profiles where id = new.player_id for update;
    select count(*) into v_open from public.sponsor_offers
      where player_id = new.player_id and kind = new.kind and status = 'open' and id <> new.id;
    if v_open >= 3 then raise exception 'market_full_for_kind'; end if;
  end if;
  return new;
end $$;

revoke execute on function public.sponsor_offers_guard() from public, anon, authenticated;
