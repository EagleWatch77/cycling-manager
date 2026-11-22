# Nasadenie: vedľajší sponzori (migrácia `_06`)

Nič z tohto sa nespúšťa bez tvojho výslovného potvrdenia. `_01`–`_05` už v produkcii bežali — NESPÚŠŤAJ ich znova (aj tak by to odmietli).

1. **Záloha.** Odporúčaná (Supabase FREE ju nemá automaticky). Ak ju preskočíš, je to tvoje rozhodnutie; `_06` nič nemaže a beží v jednej transakcii (pri chybe sa nič nezmení).
2. **Diagnostika pred:** v Supabase SQL Editore spusti `supabase/diagnostics/sponsors_predeploy_check.sql`. Očakávaj: riadky 40–44 OK, riadok 45 „ešte nebežala“, 51–53 OK.
3. **Migrácia:** spusti CELÝ súbor `supabase/migrations/20261122_06_sponsor_secondary.sql` (jedenkrát). Chyba „Run 20261122_01 .. _05 first“ znamená, že chýba predošlá migrácia — nič sa nezmenilo.
4. **Diagnostika po:** riadok 45 = OK (`50+30`), 55 = OK, 56 = počet existujúcich hráčov, ktorí dostanú prvé vedľajšie ponuky pri návšteve, 57 = prípadné príčiny (napr. bez kalendára).
5. **Kód:** GitHub Desktop → commit → push → Vercel. Kód pred migráciou len ukáže prázdny trh vedľajších (bez chyby).
6. **Kontrola na webe:** `/sponsors` (Ctrl+F5): 3 hlavné + 3 vedľajšie ponuky, počítadlo 6 / 6; existujúce hlavné ponuky sa nezmenili.

**Plánovač:** stále nie je napojený. Doplnenie chýbajúcich ponúk sa deje pri prvej návšteve `/sponsors` po nedeli 00:00 (Europe/Bratislava), nie automaticky pre všetkých naraz.

**Návrat späť:** `_06` nič neprepisuje v dátach; vedľajšie ponuky možno ponechať. Ak by bolo treba, `update public.sponsor_generator_settings set generator_enabled = false` zastaví generovanie (nič sa nemaže).
