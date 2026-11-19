/**
 * Writes the idempotent seed SQL for the launch market (100 free riders).
 * npx tsx --tsconfig tsconfig.json src/lib/training/development/launchMarket.cli.ts > ../../supabase/seeds/20261119_launch_market_100.sql
 */
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';
import { generateLaunchMarket, launchMarketId, LAUNCH_MARKET_BATCH, LAUNCH_MARKET_COUNT } from './launchMarket';
import { MARKET_GENERATOR_VERSION } from './initialMarket';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const pool = generateLaunchMarket();
const rows = pool.map((r, i) => {
  const attrs = JSON.stringify(Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, r.attributes[k]])));
  const apt = JSON.stringify(Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, Math.round(r.aptitude[k] * 1000) / 1000])));
  return `  (${q(launchMarketId(i))}::uuid, ${q(r.firstName)}, ${q(r.surname)}, ${q(r.countryName)}, ${q(r.countryIso2)}, ${r.age}, ${q(attrs)}::jsonb, ${q(r.inferredShape)}, ${r.hidden.potential}, ${r.hidden.trainability}, ${r.hidden.professionalism}, ${r.hidden.recovery}, ${r.hidden.vitality}, ${q(apt)}::jsonb)`;
});
const ids = pool.map((_, i) => q(launchMarketId(i))).join(', ');

console.log(`-- Launch market: ${LAUNCH_MARKET_COUNT} new free riders (batch ${LAUNCH_MARKET_BATCH}, generator ${MARKET_GENERATOR_VERSION}).
-- Idempotent: fixed ids + ON CONFLICT DO NOTHING, so a second run adds nothing. Existing riders are never touched.
-- The real OVR (F4, rider_overall_rating) is computed by the database from the stored attributes - it is never written.
-- The whole DO block is one transaction: if the count or the OVR range is wrong, everything is rolled back.
-- Potential follows the approved bands on 1..100 (35/45/14/4.5/1.2/0.3 %, probabilistic - no forced count per band); the other hidden traits are N(50;20) on 1..100.
do $seed$
declare
  v_season text := public.season_id_at(now());
  v_before int;
  v_after int;
  v_bad int;
begin
  select count(*) into v_before from public.market_riders where id in (${ids});

  insert into public.market_riders
    (id, season_id, tier, status, first_name, surname, country_name, country_iso2, age, attributes, condition,
     inferred_archetype, potential, trainability, professionalism, recovery, vitality, aptitude_profile, generator_version, source)
  select v.id, v_season, 'free', 'available', v.first_name, v.surname, v.country_name, v.country_iso2, v.age, v.attributes,
         '{"energy":100,"fatigue":0,"form":50,"fitness":60,"morale":70}'::jsonb,
         v.arch, v.potential, v.trainability, v.professionalism, v.recovery, v.vitality, v.apt, ${q(MARKET_GENERATOR_VERSION)}, 'admin'
  from (values
${rows.join(',\n')}
  ) as v(id, first_name, surname, country_name, country_iso2, age, attributes, arch, potential, trainability, professionalism, recovery, vitality, apt)
  on conflict (id) do nothing;

  select count(*) into v_after from public.market_riders where id in (${ids});
  if v_after <> ${LAUNCH_MARKET_COUNT} then
    raise exception 'launch market: expected ${LAUNCH_MARKET_COUNT} riders, found % (before %)', v_after, v_before;
  end if;

  select count(*) into v_bad from public.market_riders
   where id in (${ids})
     and (public.rider_overall_rating(attributes) not between 69 and 75
          or age not between 17 and 20
          or (attributes ->> 'experience')::int not between 1 and 20
          or potential not between 1 and 100);
  if v_bad <> 0 then
    raise exception 'launch market: % riders outside OVR 69..75 / age 17..20 / Experience 1..20 / potential 1..100', v_bad;
  end if;

  raise notice 'launch market OK: % riders in % (newly added: %)', v_after, v_season, v_after - v_before;
end
$seed$;

-- Check (run separately): the new riders, OVR computed by the database.
-- select count(*), min(public.rider_overall_rating(attributes)), max(public.rider_overall_rating(attributes)) from public.market_riders where generator_version = ${q(MARKET_GENERATOR_VERSION)} and tier = 'free' and status = 'available';
`);
