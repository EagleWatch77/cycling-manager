-- O-011 follow-up: coarse 1-5 estimates of a market rider's hidden development values. PREPARED, NOT RUN. Run it only after the owner approves.
-- Run AFTER 20261119_01 (potential_to_stars) and 20261119_02 (migration B). Additive and idempotent: no table change, no data change, no grant on any
-- hidden column (they stay closed - migration B is NOT touched). The code that uses it works without it too (it then shows "estimate not available").
--
-- Why a function and not a column grant: trainability / professionalism / recovery / vitality are revoked from `authenticated` on purpose (O-011). The only
-- safe way to show a rough read-out is a SECURITY DEFINER function that reads the hidden number INSIDE the database and returns ONLY a 1-5 level.
-- Nothing numeric leaves the database: five smallint levels (1..5), no interval, no raw value.
--
-- Bands (WORKING, owner decision O-029): Potential = the approved bands (potential_to_stars: 1-39, 40-59, 60-74, 75-87, 88-100). The other four hidden
-- values live on the 1-100 scale (GAME_DESIGN: "päť skrytých atribútov ... 1-100") and use equal fifths: 1-20 =1, 21-40 =2, 41-60 =3, 61-80 =4, 81-100 =5.
-- The old rider_score_to_level() (55-95 scale) is NOT used here: it is the legacy scale of the player's own starter rider (see CURRENT_TASK open items).
-- TypeScript twin: marketScoreToLevel() in apps/web/src/lib/market/estimates.ts (kept equal by estimates.test.ts and supabase/tests/market_rider_estimates.test.sh).

create or replace function public.market_score_to_level(p_value int)
returns int
language sql
immutable
as $$
  select greatest(1, least(5, ceil(p_value / 20.0)))::int;
$$;
revoke all on function public.market_score_to_level(int) from public, anon, authenticated;

-- Visibility = the SAME rule as the market_riders_select_available policy: the rider's own acquisition, or an 'available' rider of the free tier,
-- or of the premium tier only for a player holding a premium_entitlements row. Anything else returns NO row (never an error that confirms the id exists).
create or replace function public.market_rider_estimates(p_id uuid)
returns table (potential_stars int, trainability_level int, professionalism_level int, recovery_level int, vitality_level int)
language sql
stable
security definer set search_path = public
as $$
  select public.potential_to_stars(m.potential)::int,
         public.market_score_to_level(m.trainability),
         public.market_score_to_level(m.professionalism),
         public.market_score_to_level(m.recovery),
         public.market_score_to_level(m.vitality)
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
