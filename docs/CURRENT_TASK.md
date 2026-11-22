# CURRENT_TASK (prepísané 2026-11-22)

**Hotovo (kód + migrácia pripravené, NIČ nenasadené ani nespustené v produkcii):** generátor osobných ponúk hlavných sponzorov a cieľov (C-108).
- DB: `supabase/migrations/20261122_03_sponsor_offer_generator.sql` (po `_01` a `_02`).
- Web: `/sponsors` → Trh sponzorov ukazuje iba 3 osobné hlavné ponuky (názov, typ, dĺžka, 2 ciele, platnosť do + zostávajúci čas, sumy „Zatiaľ neurčené"). Verejný katalóg 30 firiem odstránený (zostáva v DB ako zdroj generátora, a v DEMO).
- Testy: SQL generátor 91, foundation 81, catalog 36, migrations_active_set 9; TS generator 26, cards 22, catalog 19, rules 57, BikeCard 20; typecheck, i18n:check (907 kľúčov), engine 139.

**Čaká na majiteľa:** (1) schváliť O-032 (rebrík cieľov, okná podľa ligy, prahy výsledkov); (2) peniaze/podpis/výplaty/ukončenie (O-031); (3) rozhodnúť o plánovači (pg_cron) — zatiaľ NIE JE napojený, funguje lenivé doplnenie pri návšteve `/sponsors`; (4) nasadenie: záloha → `_01` → `_02` → `_03` → push kódu.
**Ďalší krok po schválení:** zapisovanie výsledkov do `race_results` (bez neho je forma hráča vždy „base").
