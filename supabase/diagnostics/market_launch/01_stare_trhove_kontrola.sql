-- 01_stare_trhove_kontrola.sql  (IBA ČÍTA – nič nemení)
-- Spusti v Supabase SQL Editore, každý dotaz zvlášť (alebo všetky naraz, výsledky sú v záložkách).
-- Cieľ: presne identifikovať pôvodných 45 testovacích jazdcov (starý generátor 'starter-v1', voľní, bez akejkoľvek väzby).

-- A) ZOZNAM jazdcov určených na odstránenie (výber NIE JE podľa OVR, ale podľa verzie generátora, stavu a absencie väzieb)
with cand as (
  select m.* from public.market_riders m
  where m.generator_version = 'starter-v1'
    and m.status = 'available'
    and m.acquired_rider_id is null and m.acquired_by_player_id is null and m.acquired_at is null
    and m.source in ('admin', 'week6')
    and not exists (select 1 from public.rider_swaps s where s.market_rider_id = m.id)
)
select c.id, c.season_id, c.tier, c.status, c.first_name || ' ' || c.surname as jazdec, c.age,
       c.inferred_archetype as typ, public.rider_overall_rating(c.attributes) as ovr_f4,
       (c.attributes ->> 'experience')::int as skusenosti, c.source, c.generated_at
from cand c order by c.season_id, c.tier, c.generated_at, c.id;

-- B) KONTROLNÝ SÚČET – tieto dve hodnoty potrebuješ v kroku 02 (počet musí byť 45)
with cand as (
  select m.id from public.market_riders m
  where m.generator_version = 'starter-v1' and m.status = 'available'
    and m.acquired_rider_id is null and m.acquired_by_player_id is null and m.acquired_at is null
    and m.source in ('admin', 'week6')
    and not exists (select 1 from public.rider_swaps s where s.market_rider_id = m.id)
)
select count(*) as pocet, md5(string_agg(id::text, ',' order by id)) as kontrolny_sucet,
       (select min(public.rider_overall_rating(attributes)) from public.market_riders where id in (select id from cand)) as ovr_min,
       (select max(public.rider_overall_rating(attributes)) from public.market_riders where id in (select id from cand)) as ovr_max
from cand;

-- C) PREKÁŽKY: jazdci starého generátora, ktorí NEPÔJDU zmazať (rezervovaní, kúpení, s väzbou na jazdca alebo na výmenu)
select m.id, m.first_name || ' ' || m.surname as jazdec, m.status, m.acquired_rider_id, m.acquired_by_player_id,
       exists (select 1 from public.rider_swaps s where s.market_rider_id = m.id) as ma_vymenu,
       exists (select 1 from public.riders r where r.id = m.acquired_rider_id) as jazdec_existuje
from public.market_riders m
where m.generator_version = 'starter-v1'
  and not (m.status = 'available' and m.acquired_rider_id is null and m.acquired_by_player_id is null and m.acquired_at is null
           and m.source in ('admin', 'week6') and not exists (select 1 from public.rider_swaps s where s.market_rider_id = m.id));

-- D) CELKOVÝ PREHĽAD trhu (nič iné než starter-v1 sa nemaže; ostatné verzie tu uvidíš)
select generator_version, source, tier, status, season_id, count(*) as pocet
from public.market_riders group by 1, 2, 3, 4, 5 order by 1, 2, 3, 4, 5;

-- E) Tvoj aktuálny testovací jazdec (NEDOTKNUTÝ): jazdci priradení hráčom a ich kontrakty
select r.id, r.first_name || ' ' || r.surname as jazdec, r.player_id, r.is_ai, r.on_market,
       (select count(*) from public.rider_contracts c where c.rider_id = r.id) as kontrakty
from public.riders r where r.player_id is not null order by r.created_at;
