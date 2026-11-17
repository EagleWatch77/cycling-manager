# Známy problém: 2 zlyhávajúce testy `training_security.test.sh`

Zistené 2026-11-17. Zlyháva rovnako na GitHube pred zmenami V2/F4/V2g (commit 944e467), nejde o novú chybu.
Výsledok: 147 prešlo, 2 zlyhali.

1. `Tour registration (policy reads riders) still works` – chyba `training_conflict`
   z `tour_registration_training_guard()` (riadok 16, RAISE).
2. `registration list can read rider names (public columns)` – vrátilo 0, očakávané 1.

Pravdepodobne súvisia (druhý test číta registráciu, ktorú prvý nevie vytvoriť). Príčina zatiaľ neskúmaná.
**Musí sa vyriešiť pred produkčným nasadením migrácií.**

## Aktualizácia 2026-11-17
Obe zlyhávajúce kontroly boli opravené (test závisel od dátumu, nie od chyby v kóde): `training_security.test.sh` = 149/149. Kontrola `tour_schedule == data/tourSchedule.ts` sa teraz robí v kópii databázy po migrácii 20261117_04.
