-- 00 — Kontrola PRED nasadením (iba čítanie, nič nemení, nič nemaže). Spusti v Supabase → SQL Editor na produkcii a pošli mi výsledok.
-- Overuje: správna verzia OVR F4, staršie funkcie modelu V2 (migrácie 20261117_01..04), stav migrácií A/B a S1+O5, nastavenia, počty.
-- Stĺpec status: OK = v poriadku, CHYBA = nasadenie ešte nespúšťaj, INFO = len informácia (pri každom riadku je v detail, čo sa očakáva).
-- Zámerne je to jeden SELECT bez zápisu. Chýbajúce objekty nevyhodia chybu, ale zobrazia sa ako CHYBA.
with probe as (
  -- skúšobný jazdec: perf 140/130/120/110/100/90/80, najlepšia taktika 100, najlepšia technika 60, Skúsenosti 50 => F4 = 102
  select $a${"climbing":140,"hills":130,"flat":120,"sprint":110,"timeTrial":100,"endurance":90,"acceleration":80,"positioning":100,"attackTiming":10,"reaction":10,"energyManagement":10,"breakawaySkill":10,"descending":60,"bikeHandling":10,"cornering":10,"packRiding":10,"wetHandling":10,"roughSurface":10,"experience":50}$a$ as attrs
), fn(sig) as (
  values ('public.rider_overall_rating(jsonb)'), ('public.development_model_enabled()'), ('public.apply_development_plan_v2(uuid)'),
         ('public.apply_development_season_start(uuid)'), ('public.save_my_development_plan(int,text)'), ('public.rider_state_enabled()'),
         ('public.rider_state_catch_up_internal(uuid,timestamptz)'), ('public.game_calendar_v2_active()'), ('public.season_id_at(timestamptz)'),
         ('public.process_season_aging()'), ('public.process_my_due_training()'), ('public.complete_rider_swap_internal(uuid,timestamptz)'),
         ('public.reserve_market_rider(uuid)')
), c(ord, name, status, detail) as (
  select 10 + row_number() over (order by sig), 'funkcia ' || sig,
         case when to_regprocedure(sig) is not null then 'OK' else 'CHYBA' end, 'musí existovať' from fn
  union all
  select 30, 'OVR F4: skúšobný jazdec dáva 102',
         case when to_regprocedure('public.rider_overall_rating(jsonb)') is null then 'CHYBA'
              when (xpath('/row/v/text()', query_to_xml(format($q$select public.rider_overall_rating(%L::jsonb)::text as v$q$, (select attrs from probe)), false, true, '')))[1]::text = '102' then 'OK'
              else 'CHYBA' end,
         'očakávané 102 (vzorec F4: 0,60 V + 0,15 taktika + 0,10 technika + 0,15 Skúsenosti); iná hodnota = produkcia nemá F4'
  union all
  select 31, 'V2: apply_development_plan_v2 má zdieľaný rozpočet (migrácia 20261117_04)',
         case when to_regprocedure('public.apply_development_plan_v2(uuid)') is null then 'CHYBA'
              when (select prosrc from pg_proc where oid = to_regprocedure('public.apply_development_plan_v2(uuid)')) like '%c_sh_main%' then 'OK' else 'CHYBA' end,
         'ak CHYBA, chýba migrácia 20261117_04 a migrácia S1+O5 by nemala čo nahradiť'
  union all
  select 32, 'S1+O5: verzia funkcie rozvoja',
         case when to_regprocedure('public.apply_development_plan_v2(uuid)') is null then 'CHYBA'
              else 'INFO' end,
         case when to_regprocedure('public.apply_development_plan_v2(uuid)') is null then 'funkcia chýba'
              when (select prosrc from pg_proc where oid = to_regprocedure('public.apply_development_plan_v2(uuid)')) like '%dev_phys_room%' then 'S1+O5 JE nasadené (strop 1,5 + mladícky floor)'
              when (select prosrc from pg_proc where oid = to_regprocedure('public.apply_development_plan_v2(uuid)')) like '%c_cap_slope constant float8 := 1.25%' then 'pôvodný model (strop 1,25) – S1+O5 ešte nenasadené (očakávané pred krokom 4)'
              else 'neznáma verzia – pošli mi to' end
  union all
  select 40, 'nastavenie: model rozvoja V2 zapnutý (development_model_settings.enabled)',
         case when to_regclass('public.development_model_settings') is null then 'CHYBA' else 'INFO' end,
         case when to_regclass('public.development_model_settings') is null then 'tabuľka chýba'
              else 'enabled = ' || coalesce((xpath('/row/v/text()', query_to_xml('select enabled::text as v from public.development_model_settings limit 1', false, true, '')))[1]::text, '(prázdne)') || ' (očakávané true)' end
  union all
  select 41, 'nastavenie: model stavu jazdca zapnutý (rider_state_settings.enabled)',
         case when to_regclass('public.rider_state_settings') is null then 'CHYBA' else 'INFO' end,
         case when to_regclass('public.rider_state_settings') is null then 'tabuľka chýba'
              else 'enabled = ' || coalesce((xpath('/row/v/text()', query_to_xml('select enabled::text as v from public.rider_state_settings limit 1', false, true, '')))[1]::text, '(prázdne)') || ' (očakávané true)' end
  union all
  select 42, 'nastavenie: prepínač výmeny jazdcov (rider_swap_settings.enabled)',
         case when to_regclass('public.rider_swap_settings') is null then 'CHYBA' else 'INFO' end,
         case when to_regclass('public.rider_swap_settings') is null then 'tabuľka chýba'
              else 'enabled = ' || coalesce((xpath('/row/v/text()', query_to_xml('select enabled::text as v from public.rider_swap_settings limit 1', false, true, '')))[1]::text, '(prázdne)') || ' (očakávané false – tento balík ho nemení)' end
  union all
  select 43, 'kalendár v2 aktívny', case when to_regprocedure('public.game_calendar_v2_active()') is null then 'CHYBA' else 'INFO' end,
         case when to_regprocedure('public.game_calendar_v2_active()') is null then 'funkcia chýba'
              else 'active = ' || (xpath('/row/v/text()', query_to_xml('select public.game_calendar_v2_active()::text as v', false, true, '')))[1]::text || ' (očakávané true)' end
  union all
  select 50, 'migrácia A: potential_to_stars() a stĺpec potential_stars',
         'INFO',
         case when to_regprocedure('public.potential_to_stars(int)') is not null
                   and exists (select 1 from information_schema.columns where table_schema='public' and table_name='market_riders' and column_name='potential_stars')
              then 'A je spustená' else 'A ešte nie je spustená (očakávané pred krokom 1)' end
  union all
  select 51, 'migrácia A: admin_market_riders()', 'INFO',
         case when to_regprocedure('public.admin_market_riders(text)') is not null then 'existuje' else 'chýba (A nespustená)' end
  union all
  select 52, 'migrácia B: môže hráč čítať skryté stĺpce trhu?', 'INFO',
         case when has_column_privilege('authenticated', 'public.market_riders', 'potential', 'select')
              then 'ÁNO – B ešte NIE JE spustená (skryté hodnoty sú čitateľné)' else 'NIE – B JE spustená (skryté hodnoty sú zatvorené)' end
  union all
  select 60, 'trh: počty riadkov', 'INFO',
         (select count(*) from public.market_riders)::text || ' celkom, ' ||
         (select count(*) from public.market_riders where status = 'available')::text || ' dostupných, ' ||
         case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='market_riders' and column_name='acquired_rider_id')
              then (xpath('/row/v/text()', query_to_xml('select count(*)::text as v from public.market_riders where acquired_rider_id is not null', false, true, '')))[1]::text else '?' end || ' prepojených na jazdca (história)'
  union all
  select 61, 'trh: starí jazdci generátora starter-v1', 'INFO',
         (select count(*) from public.market_riders where generator_version = 'starter-v1')::text || ' (pred čistením očakávané 45; po čistení 0)'
  union all
  select 62, 'trh: nový štart (seed 100 jazdcov)', 'INFO',
         (select count(*) from public.market_riders where generator_version = 'initial-market-1.0')::text || ' (pred seedom 0; po seede 100)'
  union all
  select 70, 'jazdci: Potenciál mimo 1–100', case when (select count(*) from public.riders where potential not between 1 and 100) = 0 then 'OK' else 'CHYBA' end,
         (select count(*) from public.riders where potential not between 1 and 100)::text || ' jazdcov (očakávané 0)'
  union all
  select 71, 'jazdci: Potenciál existujúcich jazdcov (min–max)', 'INFO',
         coalesce((select min(potential)::text || '–' || max(potential)::text from public.riders), '(žiadni)') || ' (štartovní jazdci mali 55–95)'
  union all
  select 72, 'staré tréningové plány V1 (plan_id je NULL) ešte neaplikované',
         case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='training_plans' and column_name='plan_id') then 'INFO' else 'CHYBA' end,
         case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='training_plans' and column_name='plan_id')
              then (xpath('/row/v/text()', query_to_xml('select count(*)::text as v from public.training_plans where plan_id is null and applied_at is null', false, true, '')))[1]::text
                   || ' (len tieto môžu ešte ísť starým modelom V1 s Potenciálom 55–95; očakávané 0)'
              else 'stĺpec plan_id chýba – chýba migrácia 20261117_01' end
)
select name as kontrola, status, detail from c order by ord;
