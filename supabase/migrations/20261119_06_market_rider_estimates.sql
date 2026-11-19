-- O-011 follow-up: coarse 1-5 estimates of a market rider's hidden development values. PREPARED, NOT RUN. Run it only after the owner approves.
-- Run AFTER 20261119_01 (potential_to_stars) and 20261119_02 (migration B). Additive: no change to market_riders, no data change, no grant on any
-- hidden column (they stay closed - migration B is NOT touched). The app works without it too (it then shows "estimate not available").
--
-- Why a function and not a column grant: trainability / professionalism / recovery / vitality are revoked from `authenticated` on purpose (O-011). The only
-- safe way to show a rough read-out is a SECURITY DEFINER function that reads the hidden number INSIDE the database and returns ONLY small 1-5 levels.
--
-- Rules (owner, 2026-11-19, option A):
--   * Potential      = the approved bands (potential_to_stars: 1-39, 40-59, 60-74, 75-87, 88-100), NO noise (the star bucket is already a public column).
--   * Trainability, Professionalism, Recovery, Vitality = a STABLE noise of +-10 points added to the true 1-100 value (clamped to 1..100), then equal
--     fifths (1-20 =1, 21-40 =2, 41-60 =3, 61-80 =4, 81-100 =5). So a shown 3/5 means roughly 31-70, a shown 5/5 roughly 71-100 - never an exact figure.
--   * The noise is a function of (secret salt, rider id, attribute name): the same on every page load, per rider and attribute, and cannot be averaged away.
--   * Nothing numeric leaves the database: five smallint levels, no interval, no raw value.
--
-- THE SECRET SALT is NOT in this file, in the code or on GitHub. It is generated INSIDE the database the first time this file runs (gen_random_uuid) and stored
-- in private.market_estimate_secret: schema `private` is not exposed by the API and is closed to anon/authenticated; only the SECURITY DEFINER function reads it.
-- Re-running this file NEVER replaces the salt (ON CONFLICT DO NOTHING) - replacing it would change every rider's estimate. It lives in the database, so it is
-- part of any pg_dump backup of the database (keep those backups private). If the table is ever deleted, the estimates simply re-roll (nothing is lost).
-- TypeScript twin: only the level bands (marketScoreToLevel); the noise exists in the database only.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.market_estimate_secret (
  id   boolean primary key default true check (id),
  salt text not null
);
revoke all on private.market_estimate_secret from public, anon, authenticated;
insert into private.market_estimate_secret (id, salt)
  values (true, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (id) do nothing;

create or replace function public.market_score_to_level(p_value int)
returns int
language sql
immutable
as $$
  select greatest(1, least(5, ceil(p_value / 20.0)))::int;
$$;
revoke all on function public.market_score_to_level(int) from public, anon, authenticated;

-- Stable noisy level of one hidden value: noise = hash(salt, rider id, attribute) mapped to an integer in [-10, +10].
create or replace function public.market_noisy_level(p_value int, p_id uuid, p_attr text)
returns int
language sql
stable
security definer set search_path = public, private
as $$
  select public.market_score_to_level(greatest(1, least(100,
           p_value + (((('x' || substr(md5(s.salt || ':' || p_id::text || ':' || p_attr), 1, 8))::bit(32)::bigint) % 21)::int - 10))))
  from private.market_estimate_secret s where s.id;
$$;
revoke all on function public.market_noisy_level(int, uuid, text) from public, anon, authenticated;

-- Visibility = the SAME rule as the market_riders_select_available policy: the rider's own acquisition, or an 'available' rider of the free tier,
-- or of the premium tier only for a player holding a premium_entitlements row. Anything else returns NO row (never an error that confirms the id exists).
create or replace function public.market_rider_estimates(p_id uuid)
returns table (potential_stars int, trainability_level int, professionalism_level int, recovery_level int, vitality_level int)
language sql
stable
security definer set search_path = public
as $$
  select public.potential_to_stars(m.potential)::int,
         public.market_noisy_level(m.trainability,    m.id, 'trainability'),
         public.market_noisy_level(m.professionalism, m.id, 'professionalism'),
         public.market_noisy_level(m.recovery,        m.id, 'recovery'),
         public.market_noisy_level(m.vitality,        m.id, 'vitality')
  from public.market_riders m
  where m.id = p_id
    and auth.uid() is not null
    and (
      m.acquired_by_player_id = auth.uid()
      or (m.status = 'available'
          and (m.tier = 'free' or exists (select 1 from public.premium_entitlements pe where pe.user_id = auth.uid())))
    );
$$;
revoke all on function public.market_rider_estimates(uuid) from public, anon, authenticated;
grant execute on function public.market_rider_estimates(uuid) to authenticated;

-- make the API see the new function right away (otherwise it can take a while until the schema cache refreshes)
notify pgrst, 'reload schema';
