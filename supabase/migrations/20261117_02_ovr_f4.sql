-- ============================================================================
-- ONE official OVR (decision C-083, model F4) - SQL twin of lib/rider/score.ts overallRating().
--   V   = 0.60 x mean(3 best of the 7 Performance attributes) + 0.40 x mean(all 7)
--   OVR = round(0.60 V + 0.15 best Tactics + 0.10 best Technique + 0.15 Experience), clamped 1..200
-- Why this migration is needed: rider_overall_rating() decides the league eligibility limits (acquire/keep) in
-- rider_league_eligible(). If the profile/market show the F4 OVR while this function kept the old 50/25/20/5 mean-based formula,
-- the same rider would have two different OVRs. Only the body of ONE function changes (same name/signature/grants); no table,
-- no data, no limit value and no other function is touched. The limits table has no numbers yet, so no existing eligibility changes.
-- Exact integer form: 700 x OVR = 84 x top3Sum + 24 x sum7 + 105 x bestTactic + 70 x bestTechnique + 105 x Experience
-- (identical rounding to the TypeScript side; round half up). NOT applied by anyone - the owner runs it.
-- ============================================================================
create or replace function public.rider_overall_rating(p_attrs jsonb)
returns int
language sql
immutable
as $$
  with perf as (
    select (p_attrs ->> k)::numeric as v
      from unnest(array['climbing','hills','flat','sprint','timeTrial','endurance','acceleration']) as k
  ), top3 as (
    select coalesce(sum(v), 0) as s from (select v from perf order by v desc limit 3) t
  )
  select greatest(1, least(200, floor((
      84 * (select s from top3)
      + 24 * (select sum(v) from perf)
      + 105 * greatest((p_attrs ->> 'positioning')::numeric, (p_attrs ->> 'attackTiming')::numeric, (p_attrs ->> 'reaction')::numeric,
                       (p_attrs ->> 'energyManagement')::numeric, (p_attrs ->> 'breakawaySkill')::numeric)
      + 70 * greatest((p_attrs ->> 'descending')::numeric, (p_attrs ->> 'bikeHandling')::numeric, (p_attrs ->> 'cornering')::numeric,
                      (p_attrs ->> 'packRiding')::numeric, (p_attrs ->> 'wetHandling')::numeric, (p_attrs ->> 'roughSurface')::numeric)
      + 105 * (p_attrs ->> 'experience')::numeric
      + 350) / 700)))::int;
$$;
grant execute on function public.rider_overall_rating(jsonb) to authenticated;
