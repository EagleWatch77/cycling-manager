# CURRENT_TASK (prepísané 2026-11-22)

**Hotovo (kód + migrácie pripravené, NIČ nenasadené ani nespustené v produkcii):** oprava generátora sponzorov (C-109) — migrácia `20261122_04`.
- Jedna firma na hráča (platná ponuka / aktívna zmluva / posledná podpísaná), stráže v DB + zámok na hráča, bez náhrady hneď po odmietnutí.
- Ciele podľa skutočného kalendára (`tour_schedule` + začiatok sezóny); bez kalendára sa nič negeneruje.
- Report/oprava starých duplicít bez mazania (`sponsor_duplicate_report`, `sponsor_fix_duplicate_offers`).
- Migrácie `_01`–`_04` v jednej transakcii.

**Čaká na majiteľa:** (1) potvrdiť nasadenie: záloha → `_01` → `_02` → `_03` → `_04` → push kódu; po `_04` pustiť `select * from public.sponsor_duplicate_report();`; (2) schváliť O-032; (3) peniaze/podpis/výplaty (O-031); (4) plánovač (nie je napojený).
