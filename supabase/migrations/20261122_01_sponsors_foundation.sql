-- ============================================================================
-- Sponzori — SAFE FOUNDATION (owner rules 2026-11-22). Whole file, idempotent, additive: touches no existing table, no rider, no data.
-- Run AFTER 20261114_01..03 (needs public.profiles + auth.users). Does not need any other migration.
--
-- WHAT THIS IS: data model + hard database rules for sponsors. WHAT IT IS NOT: money. The weekly income, the goal bonuses
-- and the offer-generation formulas are NOT approved yet, so:
--   * every money column is NULLABLE ("not yet determined") and, when set, must be > 0 — no zero or invented amount can be stored;
--   * a CONTRACT row cannot exist without a positive weekly income and positive bonuses (NOT NULL + CHECK);
--   * there is NO function that signs a contract, ends one early, pays anything or generates offers. They are added after the owner
--     approves the economy. The trigger below already guards the contract table, so a future signing function cannot break the rules.
--   * switch public.sponsor_settings.economy_enabled stays FALSE.
--
-- Rules enforced here (mirror of apps/web/src/lib/sponsors/rules.ts):
--   limits per league (main/secondary): rookie 1/1, amateur 1/2, continental 1/2, pro 1/3, elite 2/2
--   duration: main rookie..pro 10 game weeks, main elite 10 or 20, secondary 5 (every league)
--   market: at most 3 open MAIN + 3 open SECONDARY offers per player; each offer lives 3 game weeks (expires_at)
--   exactly two different goals per offer, each reachable in the player's league (no promotion in Elite; Worlds goals by league)
--   the same sponsor cannot be signed twice in a row; promotion/relegation never touches a contract (no league column on contracts)
--   payouts carry a unique key (contract, week key, kind, goal slot, occurrence) so a repeated weekly update can never pay twice
--   weekly economic update = Sunday 00:00 Europe/Bratislava (public.sponsor_week_key)
-- Rollback: nothing else depends on these objects; to remove them drop the five tables and the sponsor_* functions (no data is invented).
-- ============================================================================

-- 1. pure helper functions (also exposed to players; they only compute) ------------------------------------------------
create or replace function public.sponsor_limit(p_league text, p_kind text)
returns int language sql immutable as $$
  select case p_kind
    when 'main' then case p_league when 'elite' then 2 when 'rookie' then 1 when 'amateur' then 1 when 'continental' then 1 when 'pro' then 1 end
    when 'secondary' then case p_league when 'rookie' then 1 when 'amateur' then 2 when 'continental' then 2 when 'pro' then 3 when 'elite' then 2 end
  end
$$;

create or replace function public.sponsor_duration_allowed(p_league text, p_kind text, p_weeks int)
returns boolean language sql immutable as $$
  select case p_kind
    when 'secondary' then p_weeks = 5
    when 'main' then case when p_league = 'elite' then p_weeks in (10, 20) else p_weeks = 10 end
    else false
  end
$$;

create or replace function public.sponsor_goal_allowed(p_goal text, p_league text)
returns boolean language sql immutable as $$
  select case p_goal
    when 'promotion' then p_league in ('rookie', 'amateur', 'continental', 'pro')
    when 'participateWorlds' then p_league in ('continental', 'pro', 'elite')
    when 'top3Worlds' then p_league in ('pro', 'elite')
    when 'winWorlds' then p_league = 'elite'
    when 'participateTour' then true when 'finishTour' then true when 'top50' then true when 'top10' then true
    when 'winStage' then true when 'anyJersey' then true when 'winTour' then true when 'winSeason' then true
    else false
  end
$$;

-- Sunday 00:00 Europe/Bratislava: the Bratislava calendar date of the most recent such Sunday (idempotency key of weekly payouts).
create or replace function public.sponsor_week_key(p_at timestamptz)
returns date language sql immutable as $$
  select ((p_at at time zone 'Europe/Bratislava')::date - extract(dow from (p_at at time zone 'Europe/Bratislava'))::int)
$$;

-- early termination fee: 30 % of the REMAINING guaranteed income, whole cents, half up (1000/week x 4 weeks = 1200)
create or replace function public.sponsor_severance_cents(p_weekly_cents bigint, p_weeks_left int)
returns bigint language sql immutable as $$
  select (p_weekly_cents * greatest(p_weeks_left, 0) * 30 + 50) / 100
$$;

-- 2. tables ---------------------------------------------------------------------------------------------------------------
create table if not exists public.sponsor_settings (
  id boolean primary key default true check (id),
  economy_enabled boolean not null default false     -- stays FALSE until the owner approves the sponsor economy
);
insert into public.sponsor_settings (id, economy_enabled) values (true, false) on conflict (id) do nothing;

-- the catalogue of FICTIONAL companies; one company may sponsor many players (no global exclusivity). Empty until names are approved.
create table if not exists public.sponsor_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sponsor_offers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users (id) on delete cascade,      -- every player has a PERSONAL market
  company_id uuid not null references public.sponsor_companies (id),
  kind text not null check (kind in ('main', 'secondary')),
  duration_weeks int not null check (duration_weeks in (5, 10, 20)),
  weekly_income_cents bigint check (weekly_income_cents is null or weekly_income_cents > 0),     -- NULL = "Zatiaľ neurčené"
  goal1_type text not null, goal1_bonus_cents bigint check (goal1_bonus_cents is null or goal1_bonus_cents > 0),   -- easier goal
  goal2_type text not null, goal2_bonus_cents bigint check (goal2_bonus_cents is null or goal2_bonus_cents > 0),   -- harder goal
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,                     -- created_at + 3 game weeks, set by the (future) generator
  resolved_at timestamptz,
  check (goal1_type <> goal2_type),
  check (goal1_type in ('participateTour','finishTour','top50','top10','winStage','anyJersey','winTour','winSeason','promotion','participateWorlds','top3Worlds','winWorlds')),
  check (goal2_type in ('participateTour','finishTour','top50','top10','winStage','anyJersey','winTour','winSeason','promotion','participateWorlds','top3Worlds','winWorlds')),
  check (expires_at > created_at)
);
create index if not exists sponsor_offers_player_idx on public.sponsor_offers (player_id, status);
-- one open offer per company per player
create unique index if not exists sponsor_offers_one_open_per_company on public.sponsor_offers (player_id, company_id) where status = 'open';

create table if not exists public.sponsor_contracts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users (id) on delete cascade,
  offer_id uuid not null unique references public.sponsor_offers (id),
  company_id uuid not null references public.sponsor_companies (id),
  kind text not null check (kind in ('main', 'secondary')),
  duration_weeks int not null check (duration_weeks in (5, 10, 20)),
  weekly_income_cents bigint not null check (weekly_income_cents > 0),            -- a real contract always has real money
  goal1_type text not null, goal1_bonus_cents bigint not null check (goal1_bonus_cents > 0),
  goal2_type text not null, goal2_bonus_cents bigint not null check (goal2_bonus_cents > 0),
  signed_at timestamptz not null default now(),
  ends_at timestamptz not null,                        -- own end date; contracts cross season borders, promotion/relegation never touches them
  status text not null default 'active' check (status in ('active', 'ended', 'terminated')),
  ended_at timestamptz,
  severance_cents bigint check (severance_cents is null or severance_cents >= 0),
  check (goal1_type <> goal2_type),
  check (ends_at > signed_at)
);
create index if not exists sponsor_contracts_player_idx on public.sponsor_contracts (player_id, status);

-- payouts (guaranteed weekly income + goal bonuses). Prepared only: nothing writes here yet. The unique key makes a repeated
-- weekly update harmless. goal_slot 0 = guaranteed income, 1/2 = goal bonus; occurrence numbers repeated payments of a repeatable goal.
create table if not exists public.sponsor_payouts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.sponsor_contracts (id),
  week_key date not null,
  kind text not null check (kind in ('guaranteed', 'bonus')),
  goal_slot smallint not null default 0 check (goal_slot in (0, 1, 2)),
  occurrence int not null default 0 check (occurrence >= 0),
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  check ((kind = 'guaranteed' and goal_slot = 0) or (kind = 'bonus' and goal_slot in (1, 2))),
  unique (contract_id, week_key, kind, goal_slot, occurrence)
);

-- 3. rules enforced in the database (hold for ANY writer, including a future signing function) -------------------------
create or replace function public.sponsor_offers_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_league text; v_open int;
begin
  if tg_op = 'INSERT' then        -- league rules are judged when the offer is created; a later promotion must never block rejecting/expiring it
    select league into v_league from public.profiles where id = new.player_id;
    if v_league is null then raise exception 'no_profile'; end if;
    if not public.sponsor_duration_allowed(v_league, new.kind, new.duration_weeks) then raise exception 'duration_not_allowed'; end if;
    if not public.sponsor_goal_allowed(new.goal1_type, v_league) or not public.sponsor_goal_allowed(new.goal2_type, v_league) then
      raise exception 'goal_not_available_in_league';
    end if;
  end if;
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open') then
    perform 1 from public.profiles where id = new.player_id for update;      -- serialises concurrent inserts for one player
    select count(*) into v_open from public.sponsor_offers
      where player_id = new.player_id and kind = new.kind and status = 'open' and id <> new.id;
    if v_open >= 3 then raise exception 'market_full_for_kind'; end if;       -- 3 main + 3 secondary = at most 6
  end if;
  return new;
end $$;
drop trigger if exists sponsor_offers_guard_trg on public.sponsor_offers;
create trigger sponsor_offers_guard_trg before insert or update on public.sponsor_offers for each row execute function public.sponsor_offers_guard();

create or replace function public.sponsor_contracts_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_league text; v_active int; v_last uuid; v_offer public.sponsor_offers;
begin
  if tg_op = 'UPDATE' and (new.player_id, new.company_id, new.kind, new.duration_weeks, new.weekly_income_cents, new.signed_at, new.ends_at, new.offer_id,
        new.goal1_type, new.goal1_bonus_cents, new.goal2_type, new.goal2_bonus_cents)
      is distinct from (old.player_id, old.company_id, old.kind, old.duration_weeks, old.weekly_income_cents, old.signed_at, old.ends_at, old.offer_id,
        old.goal1_type, old.goal1_bonus_cents, old.goal2_type, old.goal2_bonus_cents) then
    raise exception 'contract_terms_are_immutable';
  end if;
  if tg_op = 'INSERT' then
    select league into v_league from public.profiles where id = new.player_id for update;     -- one signing at a time per player
    if v_league is null then raise exception 'no_profile'; end if;
    select * into v_offer from public.sponsor_offers where id = new.offer_id;
    if v_offer.id is null or v_offer.player_id <> new.player_id or v_offer.company_id <> new.company_id then raise exception 'offer_mismatch'; end if;
    if not public.sponsor_duration_allowed(v_league, new.kind, new.duration_weeks) then raise exception 'duration_not_allowed'; end if;
    select count(*) into v_active from public.sponsor_contracts where player_id = new.player_id and kind = new.kind and status = 'active';
    if v_active >= public.sponsor_limit(v_league, new.kind) then raise exception 'sponsor_slots_full'; end if;
    select company_id into v_last from public.sponsor_contracts where player_id = new.player_id order by signed_at desc, id limit 1;
    if v_last is not null and v_last = new.company_id then raise exception 'same_sponsor_twice_in_a_row'; end if;
    if new.status <> 'active' then raise exception 'new_contract_must_be_active'; end if;
  end if;
  return new;
end $$;
drop trigger if exists sponsor_contracts_guard_trg on public.sponsor_contracts;
create trigger sponsor_contracts_guard_trg before insert or update on public.sponsor_contracts for each row execute function public.sponsor_contracts_guard();

-- 4. the only client action available today: reject an open offer (no money moves) ------------------------------------------
create or replace function public.reject_my_sponsor_offer(p_offer_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.sponsor_offers set status = 'rejected', resolved_at = now()
    where id = p_offer_id and player_id = auth.uid() and status = 'open';
  get diagnostics v_n = row_count;
  return v_n = 1;                                            -- the rejected offer disappears at once; a new one comes with the next weekly update
end $$;

-- internal weekly step (NOT callable by players): expire open offers whose time is up
create or replace function public.expire_sponsor_offers(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  update public.sponsor_offers set status = 'expired', resolved_at = p_now where status = 'open' and expires_at <= p_now;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 5. access: players READ only their own rows; nobody writes from the browser ---------------------------------------------
alter table public.sponsor_settings enable row level security;
alter table public.sponsor_companies enable row level security;
alter table public.sponsor_offers enable row level security;
alter table public.sponsor_contracts enable row level security;
alter table public.sponsor_payouts enable row level security;
revoke all on public.sponsor_settings, public.sponsor_companies, public.sponsor_offers, public.sponsor_contracts, public.sponsor_payouts from public, anon, authenticated;
grant select on public.sponsor_settings, public.sponsor_companies, public.sponsor_offers, public.sponsor_contracts, public.sponsor_payouts to authenticated;

drop policy if exists sponsor_settings_select on public.sponsor_settings;
create policy sponsor_settings_select on public.sponsor_settings for select to authenticated using (true);
drop policy if exists sponsor_companies_select on public.sponsor_companies;
create policy sponsor_companies_select on public.sponsor_companies for select to authenticated using (active);
drop policy if exists sponsor_offers_select_own on public.sponsor_offers;
create policy sponsor_offers_select_own on public.sponsor_offers for select to authenticated using (player_id = auth.uid());
drop policy if exists sponsor_contracts_select_own on public.sponsor_contracts;
create policy sponsor_contracts_select_own on public.sponsor_contracts for select to authenticated using (player_id = auth.uid());
drop policy if exists sponsor_payouts_select_own on public.sponsor_payouts;
create policy sponsor_payouts_select_own on public.sponsor_payouts for select to authenticated
  using (exists (select 1 from public.sponsor_contracts c where c.id = contract_id and c.player_id = auth.uid()));

revoke execute on function public.sponsor_limit(text, text), public.sponsor_duration_allowed(text, text, int), public.sponsor_goal_allowed(text, text),
  public.sponsor_week_key(timestamptz), public.sponsor_severance_cents(bigint, int), public.sponsor_offers_guard(), public.sponsor_contracts_guard(),
  public.reject_my_sponsor_offer(uuid), public.expire_sponsor_offers(timestamptz) from public, anon, authenticated;
grant execute on function public.sponsor_limit(text, text), public.sponsor_duration_allowed(text, text, int), public.sponsor_goal_allowed(text, text),
  public.sponsor_week_key(timestamptz), public.sponsor_severance_cents(bigint, int), public.reject_my_sponsor_offer(uuid) to authenticated;
