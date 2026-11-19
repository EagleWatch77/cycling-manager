-- SUPERSEDED / ARCHIVED — NEVER RUN THIS FILE. It is not a migration (that is why it lives outside supabase/migrations/).
-- It is an earlier draft of 20261114_02_league_divisions.sql. Its assign_my_league_division(p_season_id text) takes the season FROM THE CLIENT (a player could
-- forge it) and grants it to authenticated; the current migration deliberately drops that signature and uses the parameterless assign_my_league_division().
-- Because its file name sorted AFTER 20261114_02/_03, an automatic run of all migrations would have recreated the unsafe function.
-- Kept only for history. Tested: supabase/tests/migrations_active_set.test.sh.
-- ============================================================================
-- Leagues & sub-leagues V1 (2026-11-14).
--
-- Five leagues (rookie, amateur, continental, pro, elite). A league is split
-- into sub-leagues of at most 50 players, labelled "<League> 1.<number>"
-- (Rookie 1.1, Rookie 1.2, ...). Sub-leagues of one league are equal; the
-- number carries no strength. Elite has at most one sub-league (Elite 1.1).
-- Sub-leagues are created on demand, never in advance.
--
-- A player is a member of exactly ONE sub-league (league_memberships.player_id
-- is the primary key). A later promotion/relegation is a plain UPDATE of
-- division_id/league (the triggers below keep the counters and
-- profiles.league in step) — no such rule exists yet.
--
-- Capacity is protected twice: (1) allocate_league_division() serialises per
-- league with an advisory lock, (2) league_divisions.member_count is bounded
-- by a CHECK, so even a direct INSERT can never exceed capacity.
--
-- profiles.league stays (existing readers: facilities, caps). It is now kept
-- in sync from the membership by a trigger.
--
-- Idempotent: safe to run again. NOT run automatically on any database.
-- ============================================================================

create table if not exists public.league_divisions (
  id           uuid primary key default gen_random_uuid(),
  league       text not null check (league in ('rookie', 'amateur', 'continental', 'pro', 'elite')),
  -- Sub-league number: the "n" in "<League> 1.<n>".
  number       int  not null check (number >= 1),
  capacity     int  not null default 50 check (capacity >= 1),
  -- Maintained by league_membership_count_trg(); bounded by the CHECK below.
  member_count int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (league, number),
  -- Target of the composite FK from league_memberships (league <-> division).
  unique (id, league),
  constraint league_divisions_member_count_range check (member_count >= 0 and member_count <= capacity),
  constraint league_divisions_elite_single check (league <> 'elite' or number = 1)
);

create table if not exists public.league_memberships (
  player_id        uuid primary key references auth.users (id) on delete cascade,
  division_id      uuid not null,
  league           text not null,
  -- The GLOBAL season the player joined in (lib/calendar/season.ts), not a
  -- personal "season 1".
  joined_season_id text not null check (joined_season_id ~ '^season-[0-9]+$'),
  joined_at        timestamptz not null default now(),
  -- Ties the stored league to the sub-league's league: cannot disagree.
  foreign key (division_id, league) references public.league_divisions (id, league)
);

create index if not exists league_memberships_division_idx on public.league_memberships (division_id);

-- ---- Row-level security: reads only; every write goes through the functions below.
alter table public.league_divisions enable row level security;
alter table public.league_memberships enable row level security;

drop policy if exists "league_divisions_select_all" on public.league_divisions;
create policy "league_divisions_select_all"
  on public.league_divisions for select
  to authenticated
  using (true);

drop policy if exists "league_memberships_select_own" on public.league_memberships;
create policy "league_memberships_select_own"
  on public.league_memberships for select
  to authenticated
  using (auth.uid() = player_id);

revoke all on public.league_divisions from anon, authenticated;
revoke all on public.league_memberships from anon, authenticated;
grant select on public.league_divisions to authenticated;
grant select on public.league_memberships to authenticated;

-- ---- Counter + profile sync triggers.
create or replace function public.league_membership_count_trg()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.league_divisions set member_count = member_count - 1 where id = old.division_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    -- Violates league_divisions_member_count_range (23514) when the sub-league is full.
    update public.league_divisions set member_count = member_count + 1 where id = new.division_id;
  end if;
  return null;
end;
$$;

drop trigger if exists league_membership_count on public.league_memberships;
create trigger league_membership_count
  after insert or delete or update of division_id on public.league_memberships
  for each row execute function public.league_membership_count_trg();

create or replace function public.league_membership_sync_profile_trg()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set league = new.league where id = new.player_id and league is distinct from new.league;
  return null;
end;
$$;

drop trigger if exists league_membership_sync_profile on public.league_memberships;
create trigger league_membership_sync_profile
  after insert or update of league on public.league_memberships
  for each row execute function public.league_membership_sync_profile_trg();

-- ---- Allocation (internal; not granted to any client role).
-- Returns a sub-league of p_league with a free spot: the lowest-numbered one,
-- else a newly created one. Must run inside the transaction that then inserts
-- the membership: the advisory lock lives until that transaction ends, so two
-- concurrent allocations for one league are strictly serial.
create or replace function public.allocate_league_division(p_league text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id   uuid;
  v_next int;
begin
  if p_league is null or p_league not in ('rookie', 'amateur', 'continental', 'pro', 'elite') then
    raise exception 'invalid_league' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('league_division_alloc:' || p_league));

  select id into v_id
  from public.league_divisions
  where league = p_league and member_count < capacity
  order by number
  limit 1
  for update;
  if v_id is not null then
    return v_id;
  end if;

  -- Elite never gets a second sub-league.
  if p_league = 'elite' and exists (select 1 from public.league_divisions where league = 'elite') then
    raise exception 'elite_full' using errcode = 'P0001';
  end if;

  select coalesce(max(number), 0) + 1 into v_next from public.league_divisions where league = p_league;
  insert into public.league_divisions (league, number) values (p_league, v_next) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.allocate_league_division(text) from public;

-- ---- A new (or not-yet-placed) player joins Rookie. Idempotent: an existing
-- member just gets their current sub-league back.
create or replace function public.assign_my_league_division(p_season_id text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_player   uuid := auth.uid();
  v_existing uuid;
  v_div      uuid;
begin
  if v_player is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_season_id is null or p_season_id !~ '^season-[0-9]+$' then
    raise exception 'invalid_season' using errcode = 'P0001';
  end if;

  select division_id into v_existing from public.league_memberships where player_id = v_player;
  if v_existing is not null then
    return v_existing;
  end if;

  v_div := public.allocate_league_division('rookie');

  -- ON CONFLICT: two simultaneous calls for the same player cannot create two
  -- memberships (PK) and the loser does not touch the counter.
  insert into public.league_memberships (player_id, division_id, league, joined_season_id)
  values (v_player, v_div, 'rookie', p_season_id)
  on conflict (player_id) do nothing;

  return (select division_id from public.league_memberships where player_id = v_player);
end;
$$;

revoke all on function public.assign_my_league_division(text) from public;
grant execute on function public.assign_my_league_division(text) to authenticated;

-- ---- Members of the CALLER's own sub-league: public identity only, no
-- attributes or hidden fields. Same deliberate "no security_invoker" pattern
-- as rider_rankings (riders' own RLS would hide everyone else); the WHERE
-- clause scopes it to the caller's sub-league.
create or replace view public.division_members as
select
  m.division_id,
  d.league,
  d.number,
  r.id as rider_id,
  r.first_name,
  r.surname,
  r.country_name,
  r.country_iso2,
  r.age,
  m.joined_at
from public.league_memberships m
join public.league_divisions d on d.id = m.division_id
join public.riders r on r.player_id = m.player_id
where m.division_id = (select division_id from public.league_memberships where player_id = auth.uid());

grant select on public.division_members to authenticated;

-- ---- One-time placement of existing (test) accounts, oldest first. They keep
-- their stored league when valid, else Rookie. 'season-1' is a placeholder:
-- game progress is reset before the official launch.
do $$
declare
  r record;
  v_league text;
  v_div uuid;
begin
  for r in
    select p.id, p.league
    from public.profiles p
    where not exists (select 1 from public.league_memberships m where m.player_id = p.id)
    order by p.created_at, p.id
  loop
    v_league := case when r.league in ('rookie', 'amateur', 'continental', 'pro', 'elite') then r.league else 'rookie' end;
    v_div := public.allocate_league_division(v_league);
    insert into public.league_memberships (player_id, division_id, league, joined_season_id)
    values (r.id, v_div, v_league, 'season-1')
    on conflict (player_id) do nothing;
  end loop;
end $$;
