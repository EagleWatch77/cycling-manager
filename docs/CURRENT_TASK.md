# CURRENT_TASK (prepísané 2026-11-22)

**Hotovo (kód, migrácie, diagnostika a zoznam pripravené; NIČ nenasadené ani nespustené v produkcii):** finálna kontrola Sponzorov (C-110).
- Migrácia `20261122_05`: ochrana „jedna firma na hráča“ aj pri UPDATE; `_01`–`_04` majú ORDER GUARD.
- Read-only diagnostika kalendára a duplicít: `supabase/diagnostics/sponsors_predeploy_check.sql`; zhoda SQL kalendára s TS (fixture).
- Postup: `docs/PREDNASADZOVACI_ZOZNAM_SPONZORI.md`; `ODSTRAN.txt` (A nevyhnutné / B nesúvisiace).

**Čaká na majiteľa:** výslovné potvrdenie nasadenia (záloha → diagnostika → `_01`…`_05` → diagnostika → push → Vercel); schválenie súm (O-031) a O-032; rozhodnutie o plánovači (NIE JE napojený; dopĺňanie len pri návšteve `/sponsors`).
