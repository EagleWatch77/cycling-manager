-- O-011, part A of 2 — SAFE TO RUN BEFORE THE NEW CODE IS DEPLOYED. Changes no data and revokes nothing:
-- the old code keeps working, the new code needs what this file adds.
-- Adds (1) potential_to_stars() + market_riders.potential_stars (stars by the approved Potential bands; my_rider_estimates() uses the same bands), and
--      (2) admin_market_riders(season), the checked function the admin panel reads full rows through.
-- Run order: A  ->  deploy the code (wait for a green Vercel build)  ->  B (20261119_02_market_hidden_columns_B.sql).
-- Idempotent.

-- 1. Potential stars follow the approved Potential bands (owner 2026-11-19, 1..100 scale): 1-39 =1, 40-59 =2, 60-74 =3, 75-87 =4, 88-100 =5.
--    One definition, mirrored by potentialStarsOf() in lib/rider/development.ts (kept equal by the parity test).
--    Pure function of one number, no secret: executable by players (a generated column is evaluated for whoever writes the row).
create or replace function public.potential_to_stars(p_potential int)
returns smallint
language sql
immutable
as $$
  select (case when p_potential >= 88 then 5 when p_potential >= 75 then 4 when p_potential >= 60 then 3 when p_potential >= 40 then 2 else 1 end)::smallint;
$$;
grant execute on function public.potential_to_stars(int) to authenticated;

alter table public.market_riders
  add column if not exists potential_stars smallint
  generated always as (public.potential_to_stars(potential)) stored;

-- the player's OWN rider shows the same stars (same bands) as the market does
create or replace function public.my_rider_estimates()
returns table (potential_stars int, trainability_level int, professionalism_level int, recovery_level int)
language sql
stable
security definer set search_path = public
as $$
  select public.potential_to_stars(r.potential)::int, public.rider_score_to_level(r.trainability),
         public.rider_score_to_level(r.professionalism), public.rider_score_to_level(r.recovery)
  from public.riders r
  where r.player_id = auth.uid();
$$;
revoke all on function public.my_rider_estimates() from public, anon, authenticated;
grant execute on function public.my_rider_estimates() to authenticated;

-- 2. admin: full rows (the WHOLE market when no season is given - the market is permanent across seasons;
--    season_id is history only) (incl. hidden values) only for users in admin_users. The Supabase dashboard / SQL editor are unaffected.
create or replace function public.admin_market_riders(p_season_id text default null)
returns setof public.market_riders
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query select * from public.market_riders where (p_season_id is null or season_id = p_season_id) order by generated_at desc, id;
end;
$$;
revoke all on function public.admin_market_riders(text) from public, anon, authenticated;
grant execute on function public.admin_market_riders(text) to authenticated;
