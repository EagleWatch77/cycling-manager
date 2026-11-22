# CURRENT_TASK (prepísané 2026-11-22)

**Hotovo (kód, migrácia, testy, diagnostika; NIČ nenasadené ani nespustené v produkcii):** 50 vedľajších sponzorov a generátor 3 hlavné + 3 vedľajšie (C-111).
- Migrácia `20261122_06` (po `_05`; `_01`–`_05` sa NESPÚŠŤAJÚ znova): katalóg 50, generátor, kalendár 5 týždňov, jednorazové doplnenie existujúcich hráčov, log príčin.
- Web `/sponsors`: filter Všetky/Hlavní/Vedľajší, 3 + 3 ponuky, počítadlo x / 6, demo so 6 ponukami; preklady v 7 jazykoch.
- Postup: `docs/NASADENIE_VEDLAJSI_SPONZORI.md`; diagnostika `supabase/diagnostics/sponsors_predeploy_check.sql` (riadky 45, 55–57).

**Čaká na majiteľa:** výslovné potvrdenie nasadenia (diagnostika → `_06` → diagnostika → push → Vercel); schválenie súm (O-031); napojenie plánovača nedeľného updatu (stále NIE JE).
