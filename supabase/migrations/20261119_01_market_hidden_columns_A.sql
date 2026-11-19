-- O-011, part A of 2 — SAFE TO RUN BEFORE THE NEW CODE IS DEPLOYED. Changes no data and revokes nothing:
-- the old code keeps working, the new code needs what this file adds.
-- Adds (1) market_riders.potential_stars, the 1-5 star bucket of Potential computed by the database, and
--      (2) admin_market_riders(season), the checked function the admin panel reads full rows through.
-- Run order: A  ->  deploy the code (wait for a green Vercel build)  ->  B (20261119_02_market_hidden_columns_B.sql).
-- Idempotent.

-- 1. star bucket = mirror of rider_score_to_level() / potentialToStars(potential, 55, 95): ceil(pct * 5) clamped to 1..5.
--    The 55..95 scale is the production Potential scale; if that scale ever changes, this formula and the web code change together.
alter table public.market_riders
  add column if not exists potential_stars smallint
  generated always as (greatest(1, least(5, ceil((potential - 55) / 40.0 * 5)::int))::smallint) stored;

-- 2. admin: full rows (incl. hidden values) only for users in admin_users. The Supabase dashboard / SQL editor are unaffected.
create or replace function public.admin_market_riders(p_season_id text)
returns setof public.market_riders
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query select * from public.market_riders where season_id = p_season_id order by generated_at desc, id;
end;
$$;
revoke all on function public.admin_market_riders(text) from public, anon, authenticated;
grant execute on function public.admin_market_riders(text) to authenticated;
