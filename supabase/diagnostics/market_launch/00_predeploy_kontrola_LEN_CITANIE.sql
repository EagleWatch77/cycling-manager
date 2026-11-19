-- 00 — KONTROLA PO FÁZACH (iba čítanie, nič nemení, nič nemaže). Pusti ju v Supabase → SQL Editor PRED nasadením a potom po KAŽDOM kroku.
-- Výsledok čítaj zhora nadol. Každá fáza má na konci riadok „VERDIKT FÁZY“:
--   SPLNENÉ  = táto fáza je hotová a v poriadku.
--   ČAKÁ     = táto fáza sa ešte nerobila – to je v poriadku, kým na ňu nepríde rad.
--   CHYBA    = niečo nesedí (nedokončený alebo zlý stav, zlé poradie). STOP, nič ďalej nespúšťaj a pošli mi výsledok.
-- Posledný riadok „ĎALŠÍ KROK“ ti povie, čo robiť. Chýbajúca migrácia A/B/S1+O5 pred ich krokom NIE JE chyba (je to „ČAKÁ“).
-- Stav „kód nasadený“ sa z databázy zistiť nedá: po nasadení kódu skontroluj ručne zelený build vo Verceli a že fungujú /transfers a /admin/market.
-- Je to jeden SELECT bez zápisu; chýbajúce objekty nevyhodia chybu, len sa ukážu v riadku.
with
probe as (
  -- skúšobný jazdec: perf 140/130/120/110/100/90/80, najlepšia taktika 100, najlepšia technika 60, Skúsenosti 50 => F4 = 102
  select $a${"climbing":140,"hills":130,"flat":120,"sprint":110,"timeTrial":100,"endurance":90,"acceleration":80,"positioning":100,"attackTiming":10,"reaction":10,"energyManagement":10,"breakawaySkill":10,"descending":60,"bikeHandling":10,"cornering":10,"packRiding":10,"wetHandling":10,"roughSurface":10,"experience":50}$a$ as attrs
), fn(sig) as (
  values ('public.rider_overall_rating(jsonb)'), ('public.development_model_enabled()'), ('public.apply_development_plan_v2(uuid)'),
         ('public.apply_development_season_start(uuid)'), ('public.save_my_development_plan(int,text)'), ('public.rider_state_enabled()'),
         ('public.rider_state_catch_up_internal(uuid,timestamptz)'), ('public.game_calendar_v2_active()'), ('public.season_id_at(timestamptz)'),
         ('public.process_season_aging()'), ('public.process_my_due_training()'), ('public.complete_rider_swap_internal(uuid,timestamptz)'),
         ('public.reserve_market_rider(uuid)')
), pub(col) as (   -- verejné stĺpce trhu (presne ako v migrácii B); všetko ostatné je skryté
  values ('id'),('season_id'),('tier'),('status'),('first_name'),('surname'),('country_name'),('country_iso2'),('age'),('attributes'),('inferred_archetype'),('potential_stars'),('acquired_rider_id')
), s as (          -- stav databázy, zistený raz
  select
    to_regprocedure('public.potential_to_stars(int)') is not null                                                    as a_fn,
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='market_riders' and column_name='potential_stars') as a_col,
    to_regprocedure('public.admin_market_riders(text)') is not null                                                  as a_admin,
    coalesce((select prosrc like '%potential_to_stars%' from pg_proc where oid = to_regprocedure('public.my_rider_estimates()')), false) as a_est,
    (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name='market_riders' and c.column_name not in (select col from pub))                                                     as hid_total,
    (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name='market_riders' and c.column_name not in (select col from pub) and has_column_privilege('authenticated','public.market_riders',c.column_name,'select')) as hid_open_auth,
    (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name='market_riders' and c.column_name not in (select col from pub) and has_column_privilege('anon','public.market_riders',c.column_name,'select'))          as hid_open_anon,
    (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name='market_riders' and c.column_name in (select col from pub) and not has_column_privilege('authenticated','public.market_riders',c.column_name,'select')) as pub_closed_auth,
    coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.apply_development_plan_v2(uuid)')), '')  as dev_src,
    to_regprocedure('public.dev_phys_room(double precision,double precision,integer)') is not null                  as room_fn,
    to_regprocedure('public.rider_overall_rating(jsonb)') is not null                                                as ovr_fn,
    (select count(*) from public.market_riders where generator_version = 'initial-market-1.0')                      as seed_n,
    (select count(*) from public.market_riders where generator_version = 'starter-v1' and status = 'available' and acquired_rider_id is null) as old_free_n
), r(ord, fz, kind, name, status, detail) as (
  -- ================= FÁZA 0: pripravenosť databázy (musí byť OK ešte pred krokom 1) =================
  select 0 + row_number() over (order by sig), 0, 'state', 'funkcia ' || sig,
         case when to_regprocedure(sig) is not null then 'OK' else 'CHYBA' end, 'musí existovať (staršie migrácie 20261114–20261117)' from fn
  union all
  select 30, 0, 'state', 'OVR F4: skúšobný jazdec dáva 102',
         case when not (select ovr_fn from s) then 'CHYBA'
              when (xpath('/row/v/text()', query_to_xml(format($q$select public.rider_overall_rating(%L::jsonb)::text as v$q$, (select attrs from probe)), false, true, '')))[1]::text = '102' then 'OK'
              else 'CHYBA' end,
         'očakávané 102 (vzorec F4: 0,60 V + 0,15 taktika + 0,10 technika + 0,15 Skúsenosti); iná hodnota = produkcia nemá správny F4'
  union all
  select 31, 0, 'state', 'V2: rozvoj má zdieľaný týždenný rozpočet (migrácia 20261117_04)',
         case when (select dev_src from s) like '%c_sh_main%' then 'OK' else 'CHYBA' end, 'ak CHYBA, chýba migrácia 20261117_04 a S1+O5 by nemalo čo nahradiť'
  union all
  select 32, 0, 'state', 'nastavenie: model rozvoja V2 je zapnutý',
         case when to_regclass('public.development_model_settings') is null then 'CHYBA'
              when (xpath('/row/v/text()', query_to_xml('select enabled::text as v from public.development_model_settings limit 1', false, true, '')))[1]::text = 'true' then 'OK' else 'CHYBA' end,
         'očakávané: zapnutý (enabled = true)'
  union all
  select 33, 0, 'state', 'nastavenie: model stavu jazdca je zapnutý',
         case when to_regclass('public.rider_state_settings') is null then 'CHYBA'
              when (xpath('/row/v/text()', query_to_xml('select enabled::text as v from public.rider_state_settings limit 1', false, true, '')))[1]::text = 'true' then 'OK' else 'CHYBA' end,
         'očakávané: zapnutý (enabled = true)'
  union all
  select 34, 0, 'state', 'jazdci: žiadny Potenciál mimo 1–100',
         case when (select count(*) from public.riders where potential not between 1 and 100) = 0 then 'OK' else 'CHYBA' end,
         (select count(*) from public.riders where potential not between 1 and 100)::text || ' jazdcov mimo škály (očakávané 0)'
  union all
  select 35, 0, 'info', 'prepínač výmeny jazdcov (tento balík ho nemení)', 'INFO',
         case when to_regclass('public.rider_swap_settings') is null then 'tabuľka chýba'
              else 'enabled = ' || coalesce((xpath('/row/v/text()', query_to_xml('select enabled::text as v from public.rider_swap_settings limit 1', false, true, '')))[1]::text, '?') || ' (doteraz false)' end
  union all
  select 36, 0, 'info', 'staré tréningové plány V1 (plan_id je NULL) ešte neaplikované', 'INFO',
         case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='training_plans' and column_name='plan_id')
              then (xpath('/row/v/text()', query_to_xml('select count(*)::text as v from public.training_plans where plan_id is null and applied_at is null', false, true, '')))[1]::text || ' (očakávané 0; len tieto môžu ešte ísť starým modelom V1)'
              else 'stĺpec plan_id chýba' end
  union all
  select 37, 0, 'info', 'Potenciál existujúcich jazdcov (min–max)', 'INFO',
         coalesce((select min(potential)::text || '–' || max(potential)::text from public.riders), '(žiadni)') || ' (štartovní jazdci mali 55–95; dáta sa nemenia)'
  -- ================= FÁZA 1: migrácia A (krok 1) =================
  union all select 101, 1, 'state', 'A: funkcia potential_to_stars()', case when (select a_fn from s) then 'OK' else 'ČAKÁ' end, 'po kroku 1 musí byť OK'
  union all select 102, 1, 'state', 'A: stĺpec market_riders.potential_stars', case when (select a_col from s) then 'OK' else 'ČAKÁ' end, 'po kroku 1 musí byť OK'
  union all select 103, 1, 'state', 'A: admin funkcia admin_market_riders()', case when (select a_admin from s) then 'OK' else 'ČAKÁ' end, 'po kroku 1 musí byť OK'
  union all select 104, 1, 'state', 'A: my_rider_estimates() počíta hviezdičky podľa nových pásiem', case when (select a_est from s) then 'OK' else 'ČAKÁ' end, 'po kroku 1 musí byť OK'
  -- ================= FÁZA 2: kód + migrácia B (kroky 2–3) =================
  union all
  select 201, 2, 'state', 'B: skryté stĺpce trhu sú pre prihlásených hráčov ZATVORENÉ',
         case when (select hid_total from s) = 0 then 'CHYBA' when (select hid_open_auth from s) = 0 then 'OK' when (select hid_open_auth from s) = (select hid_total from s) then 'ČAKÁ' else 'CHYBA' end,
         'pred krokom 3: ČAKÁ (hráči ich zatiaľ čítajú). Po kroku 3: OK. „Čiastočne“ = CHYBA'
  union all
  select 202, 2, 'guard', 'B: skryté stĺpce trhu sú ZATVORENÉ aj pre anonymných',
         case when (select hid_open_anon from s) = 0 then 'OK'
              when (select hid_open_auth from s) = (select hid_total from s) then 'INFO' else 'CHYBA' end,
         'OK = anonymní skryté stĺpce nečítajú. INFO = pred krokom 3 ich ešte čítať môžu (B to zatvorí). Po kroku 3 musí byť OK'
  union all
  select 203, 2, 'guard', 'verejné stĺpce trhu musia ostať čitateľné pre hráča (vždy OK; ak nie, Trh nefunguje)',
         case when (select pub_closed_auth from s) = 0 then 'OK' else 'CHYBA' end,
         case when (select pub_closed_auth from s) = 0 then 'OK' else (select pub_closed_auth from s)::text || ' verejných stĺpcov je zatvorených – Trh je úplne zatvorený (núdzový režim) alebo B je pokazená' end
  union all
  select 204, 2, 'guard', 'poradie: B nesmie byť spustená bez A',
         case when (select hid_open_auth from s) = 0 and (select hid_total from s) > 0 and not (select a_col and a_admin from s) then 'CHYBA' else 'OK' end,
         'B bez A = CHYBA'
  union all
  select 205, 2, 'info', 'kód (Vercel): z databázy sa nedá overiť', 'INFO', 'po kroku 2 over ručne: zelený build vo Verceli, otvoria sa /transfers, /rider a /admin/market'
  -- ================= FÁZA 3: S1+O5 (krok 4) =================
  union all select 301, 3, 'state', 'S1+O5: pomocná funkcia dev_phys_room() existuje', case when (select room_fn from s) then 'OK' else 'ČAKÁ' end, 'po kroku 4 musí byť OK'
  union all select 302, 3, 'state', 'S1+O5: týždenný rozvoj používa pomocnú funkciu', case when (select dev_src from s) like '%dev_phys_room%' then 'OK' else 'ČAKÁ' end, 'po kroku 4 musí byť OK'
  union all select 303, 3, 'state', 'S1+O5: strop 80 + 150·P² (sklon 1,5)',
         case when (select dev_src from s) like '%c_cap_slope constant float8 := 1.5%' then 'OK' when (select dev_src from s) like '%c_cap_slope constant float8 := 1.25%' then 'ČAKÁ' else 'CHYBA' end,
         'pred krokom 4 je sklon 1,25 (ČAKÁ); po kroku 4 musí byť 1,5 (OK)'
  union all
  select 304, 3, 'guard', 'S1+O5: skúška dev_phys_room (vek 19 → 0,30; vek 27 nad stropom → ~0; 200 → 0)',
         case when not (select room_fn from s) then 'INFO'
              when (xpath('/row/v/text()', query_to_xml('select (round(public.dev_phys_room(150,90,19)::numeric,2) = 0.30 and public.dev_phys_room(150,90,27) < 0.001 and public.dev_phys_room(200,90,17) = 0)::text as v', false, true, '')))[1]::text = 'true' then 'OK' else 'CHYBA' end,
         'ak CHYBA, pomocná funkcia počíta zle'
  -- ================= FÁZA 4: 100 nových jazdcov (krok 5) =================
  union all
  select 401, 4, 'state', 'seed: počet nových jazdcov (initial-market-1.0)',
         case when (select seed_n from s) = 100 then 'OK' when (select seed_n from s) = 0 then 'ČAKÁ' else 'CHYBA' end,
         (select seed_n from s)::text || ' (pred krokom 5 očakávané 0, po kroku 5 presne 100)'
  union all
  select 402, 4, 'guard', 'seed: všetci majú OVR 69–75, vek 17–20, Skúsenosti 1–20, tier free, Potenciál 1–100',
         case when (select seed_n from s) = 0 or not (select ovr_fn from s) then 'INFO'
              when (xpath('/row/v/text()', query_to_xml($q$select count(*)::text as v from public.market_riders where generator_version='initial-market-1.0' and not (public.rider_overall_rating(attributes) between 69 and 75 and age between 17 and 20 and (attributes->>'experience')::int between 1 and 20 and tier='free' and potential between 1 and 100)$q$, false, true, '')))[1]::text = '0' then 'OK' else 'CHYBA' end,
         'počet jazdcov mimo pravidiel musí byť 0'
  union all
  select 403, 4, 'guard', 'poradie: nových jazdcov nesmie byť na trhu, kým sú skryté hodnoty otvorené (najprv B)',
         case when (select seed_n from s) > 0 and (select hid_open_auth from s) > 0 then 'CHYBA' else 'OK' end,
         'seed pred krokom 3 = CHYBA (hráči by čítali skutočný Potenciál nových jazdcov)'
  -- ================= FÁZA 5: čistenie 45 starých (kroky 6–7) =================
  union all
  select 501, 5, 'state', 'starí voľní jazdci generátora starter-v1 (bez väzby)',
         case when (select old_free_n from s) = 45 then 'ČAKÁ' when (select old_free_n from s) = 0 then 'OK' else 'CHYBA' end,
         (select old_free_n from s)::text || ' (pred čistením očakávané presne 45, po čistení 0)'
  union all
  select 502, 5, 'guard', 'poradie: starých nemazať skôr, než sú nasadení noví', case when (select old_free_n from s) = 0 and (select seed_n from s) < 100 and (select count(*) from public.market_riders where generator_version = 'starter-v1') = 0 and to_regclass('public.market_riders_backup_20261119') is not null then 'CHYBA' else 'OK' end,
         'čistenie bez seedu by nechalo prázdny Trh'
  union all
  select 503, 5, 'info', 'záloha starých jazdcov (tabuľka market_riders_backup_20261119)', 'INFO',
         case when to_regclass('public.market_riders_backup_20261119') is null then 'neexistuje (kým sa nespustí krok 7)'
              else (xpath('/row/v/text()', query_to_xml('select count(*)::text as v from public.market_riders_backup_20261119', false, true, '')))[1]::text || ' riadkov (po kroku 7 očakávané 45)' end
), v as (   -- verdikt každej fázy
  select fz,
         case when count(*) filter (where status = 'CHYBA') > 0 then 'CHYBA'
              when count(*) filter (where kind = 'state' and status <> 'OK') = 0 then 'SPLNENÉ'
              when count(*) filter (where kind = 'state' and status = 'OK') = 0 then 'ČAKÁ'
              else 'CHYBA' end as verdict,
         count(*) filter (where kind = 'state' and status = 'OK') as ok_n, count(*) filter (where kind = 'state') as st_n
    from r group by fz
), nm(fz, title, hint_done, hint_wait) as (
  values (0, 'FÁZA 0 – pripravenosť databázy (pred nasadením)', 'Databáza je pripravená.', 'Databáza NIE JE pripravená – nič nespúšťaj.'),
         (1, 'FÁZA 1 – migrácia A (krok 1)', 'Migrácia A je vykonaná.', 'Migrácia A ešte nebola – to je v poriadku, kým nepríde krok 1.'),
         (2, 'FÁZA 2 – kód a migrácia B (kroky 2–3)', 'Skryté hodnoty sú zatvorené (migrácia B vykonaná).', 'Migrácia B ešte nebola – v poriadku, kým nepríde krok 3. Skryté hodnoty sú zatiaľ čitateľné.'),
         (3, 'FÁZA 3 – S1+O5 (krok 4)', 'S1+O5 je nasadené.', 'S1+O5 ešte nie je nasadené – v poriadku, kým nepríde krok 4.'),
         (4, 'FÁZA 4 – 100 nových jazdcov (krok 5)', 'Nových 100 jazdcov je na trhu a spĺňa pravidlá.', 'Seed ešte nebol – v poriadku, kým nepríde krok 5.'),
         (5, 'FÁZA 5 – čistenie 45 starých (kroky 6–7)', 'Starí jazdci sú odstránení.', 'Starí jazdci ešte sú (45) – v poriadku, kým nepríde krok 7 (posledný).')
), nxt as (
  select case
    when exists (select 1 from v where verdict = 'CHYBA') then 'STOP – v niektorej fáze je CHYBA. Nič ďalej nespúšťaj, pošli mi celý tento výsledok.'
    when (select verdict from v where fz = 0) <> 'SPLNENÉ' then 'STOP – fáza 0 nie je v poriadku. Nič nespúšťaj, pošli mi výsledok.'
    when (select verdict from v where fz = 1) = 'ČAKÁ' then 'Môžeš pokračovať KROKOM 1: spusti migráciu A (20261119_01). Potom pusti túto kontrolu znova.'
    when (select verdict from v where fz = 2) = 'ČAKÁ' then 'Migrácia A je hotová. KROK 2: nasaď kód (GitHub Desktop), počkaj na ZELENÝ build vo Verceli a over /transfers. Až potom KROK 3: migrácia B (20261119_02). Potom pusti túto kontrolu znova.'
    when (select verdict from v where fz = 3) = 'ČAKÁ' then 'Hotové A aj B. KROK 4: spusti migráciu S1+O5 (20261119_04). Potom pusti túto kontrolu znova.'
    when (select verdict from v where fz = 4) = 'ČAKÁ' then 'KROK 5: spusti seed 100 jazdcov (seeds/20261119_launch_market_100.sql). Potom pusti túto kontrolu znova a pozri Trh.'
    when (select verdict from v where fz = 5) = 'ČAKÁ' then 'KROK 6: spusti 01_stare_trhove_kontrola.sql, potom (posledné) KROK 7: 02_stare_trhove_zaloha_a_zmazanie.sql.'
    else 'Všetko je hotové a v poriadku.' end as txt
)
select fz::text as faza, name as kontrola, status, detail as ocakavane_a_zistene
  from (
    select fz, ord, name, status, detail from r
    union all
    select v.fz, v.fz * 1000 + 900, 'VERDIKT FÁZY: ' || nm.title,
           v.verdict,
           case v.verdict when 'SPLNENÉ' then nm.hint_done when 'ČAKÁ' then nm.hint_wait else 'NESEDÍ – stav je nedokončený alebo v zlom poradí (' || v.ok_n || ' z ' || v.st_n || ' kontrol je OK). STOP.' end
      from v join nm using (fz)
    union all
    select 9, 99999, 'ĎALŠÍ KROK', case when (select txt from nxt) like 'STOP%' then 'CHYBA' else 'OK' end, (select txt from nxt)
  ) x
 order by fz, ord;
