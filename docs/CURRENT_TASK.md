# CURRENT_TASK (2026-11-22)

Hotová fáza: stránka **Sponzori** (`/sponsors`), bez peňazí (C-106, O-031). Nič nenasadené, nič nespustené v produkcii.

## Čo je v ZIP-e
Pravidlá `lib/sponsors/*`, komponenty `components/sponsors/*`, stránka + akcia `app/sponsors/*`, menu pod Financie, preklady (7 jazykov), migrácia `20261122_01_sponsors_foundation.sql` (NESPUSTENÁ), testy, Biblia, DECISIONS (C-106, O-031).

## Čaká na Mirka
Sumy (príjem, bonusy), generovanie ponúk a názvy fiktívnych firiem, plánovač nedeľňajšej aktualizácie, finančná história. Až potom: podpis, predčasné ukončenie, výplaty.

## Poznámky
`ODSTRAN.txt` doplnený: 3 staré súbory v `supabase/migrations/` treba zmazať ručne (zastaraný koncept líg a dva ROLLBACK súbory).
Overiť: migrácia sponzorov pred/po kóde je bezpečná (bez nej stránka ukáže prázdny stav).
