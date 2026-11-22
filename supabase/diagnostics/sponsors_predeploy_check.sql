-- ============================================================================
-- Sponzori — DIAGNOSTIKA PRED NASADENÍM (len čítanie). Spusti v Supabase SQL Editore PRED migráciami aj PO nich.
-- Je to JEDEN príkaz SELECT: nič nemení, nič nezapisuje, nevolá žiadnu funkciu so zápisom. Bezpečný na produkcii.
-- Výsledok: tabuľka riadkov (check, status, detail). Status: OK / INFO / WARN / FAIL.
--   FAIL  = pred nasadením (alebo pred spustením generátora) treba opraviť.
--   WARN  = pozri detail, nasadenie to nemusí blokovať.
-- Funguje aj keď migrácie ešte nebežali (chýbajúce veci ukáže ako INFO/FAIL, nezhodí sa).
-- Záloha sa z SQL overiť NEDÁ: spusti 02_over_zalohu.ps1 (viď docs/PREDNASADZOVACI_ZOZNAM_SPONZORI.md).
-- ============================================================================
with
q as (select
  to_regclass('public.tour_schedule') is not null as has_ts,
  to_regclass('public.sponsor_offers') is not null as has_offers,
  to_regclass('public.sponsor_contracts') is not null as has_contracts,
  to_regclass('public.sponsor_companies') is not null as has_companies,
  to_regclass('public.sponsor_player_state') is not null as has_state,
  to_regclass('public.race_results') is not null as has_results,
  to_regclass('public.game_calendar_settings') is not null as has_gcs,
  to_regprocedure('public.game_season_one_start()') is not null as has_start_fn,
  to_regprocedure('public.sponsor_reachable_tours(timestamptz, integer)') is not null as has_reach_fn,
  to_regprocedure('public.sponsor_duplicate_report()') is not null as has_dup_fn,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='sponsor_companies' and column_name='catalog_no') as has_catalog_no,
  exists (select 1 from pg_trigger where tgname='sponsor_offers_company_guard_trg' and not tgisinternal) as has_t4,
  exists (select 1 from pg_trigger where tgname='sponsor_offers_company_guard_upd_trg' and not tgisinternal) as has_t5,
  to_regclass('public.profiles') is not null as has_profiles,
  to_regprocedure('public.sponsor_reachable_tours_min(timestamptz, integer)') is not null as has_t6
),
-- migration _06: secondary catalogue and per-player counts (read-only; only evaluated when _06 is in place)
sec as (select
  (xpath('/row/v/text()', query_to_xml(case when (select has_t6 from q) then $$select (select count(*) from public.sponsor_companies where kind='secondary' and catalog_no between 1 and 50 and active)::text || '+' || (select count(*) from public.sponsor_companies where kind='main' and catalog_no between 1 and 30 and active)::text as v$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as cat,
  (xpath('/row/v/text()', query_to_xml(case when (select has_t6 from q) then $$select count(*)::text as v from (select player_id from public.sponsor_offers where status='open' and kind='secondary' group by player_id having count(*) > 3) z$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as over3,
  (xpath('/row/v/text()', query_to_xml(case when (select has_t6 from q) then $$select count(*)::text as v from public.sponsor_player_state where secondary_fill_week_key is null$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as no_sec,
  (xpath('/row/v/text()', query_to_xml(case when (select has_t6 from q) then $$select coalesce(string_agg(kind || ':' || reason || '=' || n, ', '), '') as v from (select kind, reason, count(*) n from public.sponsor_generator_log group by 1, 2) z$$ else $$select ''::text as v$$ end, false, true, '')))[1]::text as logs
),
-- scalar helper: runs a read-only SELECT given as text, only when its guard is true
st as (select coalesce(
    (xpath('/row/v/text()', query_to_xml(case when (select has_start_fn from q) then 'select public.game_season_one_start()::text as v' else 'select null::text as v' end, false, true, '')))[1]::text::date,
    date '2026-08-17') as start_date,
    (select has_start_fn from q) as from_db),
ts_rows as (select (xpath('/row/v/text()', query_to_xml(case when (select has_ts from q) then
    $$select coalesce(string_agg(tour_id || '=' || week_number, ', ' order by week_number, tour_id), '') as v from public.tour_schedule$$ else $$select ''::text as v$$ end, false, true, '')))[1]::text as list),
ts_n as (select (xpath('/row/v/text()', query_to_xml(case when (select has_ts from q) then
    $$select count(*)::text as v from public.tour_schedule$$ else $$select '0'::text as v$$ end, false, true, '')))[1]::text::int as n),
ts_weeks as (select (xpath('/row/v/text()', query_to_xml(case when (select has_ts from q) then
    $$select coalesce(string_agg(week_number::text, ',' order by week_number, tour_id), '') as v from public.tour_schedule$$ else $$select ''::text as v$$ end, false, true, '')))[1]::text as w),
ts_ids as (select (xpath('/row/v/text()', query_to_xml(case when (select has_ts from q) then
    $$select coalesce(string_agg(tour_id, ',' order by tour_id), '') as v from public.tour_schedule$$ else $$select ''::text as v$$ end, false, true, '')))[1]::text as ids),
v2flag as (select (xpath('/row/v/text()', query_to_xml(case when (select has_gcs from q) and exists (select 1 from information_schema.columns where table_schema='public' and table_name='game_calendar_settings' and column_name='calendar_v2_active') then
    $$select coalesce((select calendar_v2_active::text from public.game_calendar_settings where id), 'none') as v$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as f),
-- independent re-count of guaranteed race weeks for a contract of W weeks signed on date d (same arithmetic as sponsor_reachable_tours, written out here)
scan as (select (xpath('/row/v/text()', query_to_xml(case when (select has_ts from q) then format(
    $$select coalesce(string_agg(d::text || '=' || r10::text, ', ' order by d), '') as v from (
        select d, (select count(*) from generate_series((greatest(0, (d + 21) - %1$L::date) / 7) + 1, (greatest(0, d - %1$L::date) / 7) + 10 - 1) k
                    where exists (select 1 from public.tour_schedule t where t.week_number = (k %% 10) + 1)) as r10
        from (select ((now() at time zone 'utc')::date + g * 7) as d from generate_series(0, 13) g) x) y$$,
    (select start_date from st)) else $$select ''::text as v$$ end, false, true, '')))[1]::text as s),
scan_min as (select (xpath('/row/v/text()', query_to_xml(case when (select has_ts from q) then format(
    $$select coalesce(min(r10), 0)::text as v from (
        select (select count(*) from generate_series((greatest(0, (d + 21) - %1$L::date) / 7) + 1, (greatest(0, d - %1$L::date) / 7) + 10 - 1) k
                    where exists (select 1 from public.tour_schedule t where t.week_number = (k %% 10) + 1)) as r10
        from (select ((now() at time zone 'utc')::date + g * 7) as d from generate_series(0, 51) g) x) y$$,
    (select start_date from st)) else $$select '0'::text as v$$ end, false, true, '')))[1]::text::int as m),
reach_now as (select (xpath('/row/v/text()', query_to_xml(case when (select has_reach_fn from q) then
    $$select public.sponsor_reachable_tours(now(), 10)::text || '/' || public.sponsor_reachable_tours(now(), 20)::text as v$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as r),
reach_inline as (select (xpath('/row/v/text()', query_to_xml(case when (select has_ts from q) then format(
    $$select ((select count(*) from generate_series((greatest(0, ((now() at time zone 'utc')::date + 21) - %1$L::date) / 7) + 1, (greatest(0, (now() at time zone 'utc')::date - %1$L::date) / 7) + 10 - 1) k
                where exists (select 1 from public.tour_schedule t where t.week_number = (k %% 10) + 1)))::text || '/' ||
              ((select count(*) from generate_series((greatest(0, ((now() at time zone 'utc')::date + 21) - %1$L::date) / 7) + 1, (greatest(0, (now() at time zone 'utc')::date - %1$L::date) / 7) + 20 - 1) k
                where exists (select 1 from public.tour_schedule t where t.week_number = (k %% 10) + 1)))::text as v$$,
    (select start_date from st)) else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as r),
cnt as (select
  (xpath('/row/v/text()', query_to_xml(case when (select has_offers from q) then $$select count(*)::text as v from public.sponsor_offers$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as offers,
  (xpath('/row/v/text()', query_to_xml(case when (select has_contracts from q) then $$select count(*)::text as v from public.sponsor_contracts$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as contracts,
  (xpath('/row/v/text()', query_to_xml(case when (select has_companies from q) and (select has_catalog_no from q) then $$select count(*)::text as v from public.sponsor_companies where kind = 'main' and active and catalog_no between 1 and 30$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as main30,
  (xpath('/row/v/text()', query_to_xml(case when (select has_offers from q) and (select has_contracts from q) then
     $$select (select count(*) from public.sponsor_offers o join public.sponsor_contracts k on k.player_id = o.player_id and k.company_id = o.company_id and k.status = 'active' where o.status = 'open')::text as v$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as dup_offer_contract,
  (xpath('/row/v/text()', query_to_xml(case when (select has_contracts from q) then
     $$select (select count(*) from (select 1 from public.sponsor_contracts where status = 'active' group by player_id, company_id having count(*) > 1) z)::text as v$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as dup_contracts,
  (xpath('/row/v/text()', query_to_xml(case when (select has_offers from q) then
     $$select (select count(*) from (select 1 from public.sponsor_offers where kind = 'main' and status = 'open' group by player_id having count(*) > 3) z)::text as v$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as over3,
  (xpath('/row/v/text()', query_to_xml(case when (select has_results from q) then $$select count(*)::text as v from public.race_results$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as results,
  (xpath('/row/v/text()', query_to_xml(case when (select has_state from q) then
     $$select (select count(*) from public.profiles p where not exists (select 1 from public.sponsor_player_state s where s.player_id = p.id))::text as v$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as no_state,
  (xpath('/row/v/text()', query_to_xml(case when (select has_profiles from q) then $$select count(*)::text as v from public.profiles$$ else $$select 'n/a'::text as v$$ end, false, true, '')))[1]::text as profiles),
checks(ord, name, status, detail) as (
  select 10, 'Tabuľka kalendára tour_schedule existuje', case when has_ts then 'OK' else 'FAIL' end, case when has_ts then 'áno' else 'CHÝBA: generátor nevytvorí žiadne ponuky, migrácia _04 sa odmietne' end from q
  union all select 11, 'Pretekové týždne v tour_schedule', case when (select n from ts_n) = 0 then 'FAIL' else 'INFO' end, coalesce(nullif((select list from ts_rows), ''), '(prázdne) — bez kalendára sa nič negeneruje')
  union all select 12, 'Počet Tour = 5 a každý týždeň 1–10',
      case when (select n from ts_n) = 5 and (select ids from ts_ids) = 'coastal-tour,danube-tour,highlands-tour,northern-crown-tour,silver-horizon-tour' and not exists (select 1 from unnest(string_to_array((select w from ts_weeks), ',')) x where x <> '' and (x::int < 1 or x::int > 10)) then 'OK'
           when (select n from ts_n) = 0 then 'FAIL' else 'WARN' end,
      'počet=' || (select n from ts_n) || '; známe Tour: highlands, danube, coastal, northern-crown, silver-horizon (ak je tu iné id, generátor ho zahrnie do kalendára, ale web ho nepozná)'
  union all select 13, 'Ktorý kalendár je aktívny',
      case when (select w from ts_weeks) = '2,4,6,8,10' then 'OK' when (select w from ts_weeks) = '2,5,5,7,9' then 'INFO' when (select n from ts_n) = 0 then 'FAIL' else 'WARN' end,
      case when (select w from ts_weeks) = '2,4,6,8,10' then 'KALENDÁR 2 (týždne 2/4/6/8/10) — jednotný kalendár' when (select w from ts_weeks) = '2,5,5,7,9' then 'KALENDÁR 1 (týždne 2/5/5/7/9; Danube a Coastal zdieľajú týždeň 5) — platný, kým sa nespustí activate_game_calendar_v2(); generátor počíta týždeň 5 raz' when (select n from ts_n) = 0 then 'kalendár chýba (tabuľka je prázdna alebo neexistuje)' else 'iné týždne než kalendár 1 aj 2: skontroluj ručne' end
        || '; calendar_v2_active=' || (select f from v2flag)
  union all select 14, 'Zhoda príznaku calendar_v2_active s týždňami',
      case when (select f from v2flag) in ('n/a','none') then 'INFO'
           when ((select f from v2flag) = 'true') = ((select w from ts_weeks) = '2,4,6,8,10') then 'OK' else 'WARN' end,
      'príznak=' || (select f from v2flag) || ', týždne=' || coalesce(nullif((select w from ts_weeks), ''), '-')
  union all select 20, 'Začiatok sezóny', case when extract(isodow from (select start_date from st)) = 1 then 'OK' else 'FAIL' end,
      (select start_date::text from st) || case when (select from_db from st) then ' (z game_season_one_start())' else ' (konštanta projektu 2026-08-17; funkcia game_season_one_start() v DB neexistuje)' end || '; musí byť pondelok'
  union all select 21, 'Aktuálna sezóna a týždeň', 'INFO',
      'season-' || (greatest(0, (((now() at time zone 'utc')::date - (select start_date from st)))) / 70 + 1) || ', týždeň ' || (((greatest(0, ((now() at time zone 'utc')::date - (select start_date from st))) % 70) / 7) + 1) || ' z 10'
  union all select 30, 'Garantované pretekové týždne v zmluve (10 / 20 týždňov) teraz — funkcia generátora',
      case when (select has_reach_fn from q) then case when split_part((select r from reach_now), '/', 1)::int >= 1 then 'OK' else 'FAIL' end else 'INFO' end,
      case when (select has_reach_fn from q) then (select r from reach_now) else 'funkcia ešte neexistuje (migrácia _04 nebežala)' end
  union all select 31, 'Rovnaký výpočet napísaný nezávisle (kontrola funkcie)',
      case when (select has_reach_fn from q) then case when (select r from reach_now) = (select r from reach_inline) then 'OK' else 'FAIL' end else 'INFO' end,
      'nezávislý výpočet=' || coalesce((select r from reach_inline), 'n/a') || case when (select has_reach_fn from q) then ', funkcia=' || (select r from reach_now) else '' end
  union all select 32, 'Najbližších 52 týždňov: nikdy 0 pretekov v 10-týždňovej zmluve',
      case when not (select has_ts from q) then 'FAIL' when (select m from scan_min) >= 1 then 'OK' else 'FAIL' end,
      'minimum za rok=' || (select m from scan_min) || ' (0 = v niektorom týždni by novému hráčovi neprišla žiadna ponuka)'
  union all select 33, 'Prvých 14 týždňov: dátum=počet pretekových týždňov v 10-týždňovej zmluve', 'INFO', coalesce(nullif((select s from scan), ''), 'n/a')
  union all select 40, 'Migrácia _01 (základ) — tabuľky ponúk a zmlúv', case when (select has_offers from q) and (select has_contracts from q) then 'OK' else 'INFO' end, case when (select has_offers from q) then 'použitá' else 'ešte nebežala' end from q
  union all select 41, 'Migrácia _02 (katalóg 30 firiem)', case when (select main30 from cnt) = '30' then 'OK' when (select main30 from cnt) = 'n/a' then 'INFO' else 'FAIL' end, 'aktívnych hlavných firiem s číslom 1–30: ' || (select main30 from cnt)
  union all select 42, 'Migrácia _03 (generátor)', case when (select has_state from q) then 'OK' else 'INFO' end, case when (select has_state from q) then 'použitá' else 'ešte nebežala' end
  union all select 43, 'Migrácia _04 (opravy, kalendár)', case when (select has_reach_fn from q) and (select has_t4 from q) then 'OK' else 'INFO' end, case when (select has_reach_fn from q) then 'použitá' else 'ešte nebežala' end
  union all select 44, 'Migrácia _05 (stráže pri UPDATE)', case when (select has_t5 from q) then 'OK' else 'INFO' end, case when (select has_t5 from q) then 'použitá' else 'ešte nebežala' end
  union all select 45, 'Migrácia _06 (50 vedľajších sponzorov, generátor 3+3)', case when (select has_t6 from q) and (select cat from sec) = '50+30' then 'OK' when (select has_t6 from q) then 'FAIL' else 'INFO' end, case when (select has_t6 from q) then 'vedľajších+hlavných firiem: ' || (select cat from sec) || ' (čaká sa 50+30)' else 'ešte nebežala' end
  union all select 55, 'Hráč s viac než 3 otvorenými vedľajšími ponukami', case when (select over3 from sec) in ('0','n/a') then 'OK' else 'FAIL' end, 'počet=' || (select over3 from sec)
  union all select 56, 'Hráči, ktorým ešte nebolo doplnených prvých 6 ponúk (vedľajší kľúč chýba)', 'INFO', (select no_sec from sec) || ' — doplnia sa pri prvej návšteve /sponsors'
  union all select 57, 'Záznamy generátora o príčine, prečo ponuka nevznikla', 'INFO', coalesce(nullif((select logs from sec), ''), 'žiadne')
  union all select 50, 'Existujúce sponzorské údaje', 'INFO', 'ponuky=' || (select offers from cnt) || ', zmluvy=' || (select contracts from cnt) || ', hráčov(profiles)=' || (select profiles from cnt)
  union all select 51, 'Duplicita: otvorená ponuka + aktívna zmluva rovnakej firmy u hráča', case when (select dup_offer_contract from cnt) in ('0','n/a') then 'OK' else 'FAIL' end, 'počet=' || (select dup_offer_contract from cnt) || ' (po _04 pozri: select * from public.sponsor_duplicate_report();)'
  union all select 52, 'Duplicita: dve aktívne zmluvy rovnakej firmy u hráča', case when (select dup_contracts from cnt) in ('0','n/a') then 'OK' else 'FAIL' end, 'počet=' || (select dup_contracts from cnt) || ' (unikátny index sa pri duplicite nevytvorí; riešiš ručne, nič sa nemaže)'
  union all select 53, 'Hráč s viac než 3 otvorenými hlavnými ponukami', case when (select over3 from cnt) in ('0','n/a') then 'OK' else 'FAIL' end, 'počet=' || (select over3 from cnt)
  union all select 54, 'Hráči bez stavu generátora (dostanú ponuky pri prvej návšteve /sponsors)', 'INFO', (select no_state from cnt)
  union all select 60, 'Výsledky pretekov (race_results)', 'INFO', 'riadkov=' || (select results from cnt) || ' — kým je 0, forma hráča je vždy „základná“ (ciele sa neposúvajú podľa výsledkov)'
  union all select 70, 'Plánovač nedeľného updatu', 'WARN', 'NIE JE napojený. Ponuky sa dopĺňajú pri prvej návšteve /sponsors po nedeli 00:00 (Europe/Bratislava), nie automaticky pre všetkých naraz.'
  union all select 80, 'Záloha databázy', 'WARN', 'z SQL sa nedá overiť. Pred novou migráciou spusti 02_over_zalohu.ps1 a počkaj na „ÚPLNÁ A OVERENÁ“.'
)
select ord as "#", name as "kontrola", status as "stav", detail as "detail" from checks
union all select 0, 'SÚHRN', case when exists (select 1 from checks where status = 'FAIL') then 'FAIL' when exists (select 1 from checks where status = 'WARN') then 'WARN' else 'OK' end,
  'FAIL=' || (select count(*) from checks where status = 'FAIL') || ', WARN=' || (select count(*) from checks where status = 'WARN') || ' (WARN riadky 70 a 80 sú trvalé upozornenia)'
order by 1;
