# Návod na ručné nasadenie — štart Trhu (krok za krokom, pomaly)

Pravidlá: po každom kroku sa zastav, pusti **kontrolu 00** a pokračuj, až keď povie, že môžeš. SQL spúšťaj v Supabase → SQL Editor. Nič z tohto sa nespúšťa samo.
**Pred krokom 1 urob zálohu** (Supabase → Database → Backups alebo ručný dump).

## Kontrola 00 (pusti ju pred krokom 1 a po každom kroku)
Súbor: `supabase/diagnostics/market_launch/00_predeploy_kontrola_LEN_CITANIE.sql` (iba číta, nič nemení). Výsledok je rozdelený na **fázy**. Pri každej fáze je riadok **VERDIKT FÁZY**:

| Verdikt | Význam |
|---|---|
| **SPLNENÉ** | fáza je hotová a v poriadku |
| **ČAKÁ** | fáza sa ešte nerobila — to je v poriadku, kým na ňu nepríde rad |
| **CHYBA** | niečo nesedí (nedokončené, zlé poradie). **STOP**, nič ďalej nespúšťaj, pošli mi celý výsledok |

Posledný riadok **ĎALŠÍ KROK** ti povie presne, čo robiť. Chýbajúca migrácia A, B alebo S1+O5 pred ich krokom **nie je chyba** (je to „ČAKÁ“).

Čo má kontrola ukázať v ktorom okamihu:

| Okamih | F0 pripravenosť | F1 migrácia A | F2 kód + B | F3 S1+O5 | F4 100 jazdcov | F5 čistenie 45 | ĎALŠÍ KROK |
|---|---|---|---|---|---|---|---|
| **Pred nasadením** (teraz) | SPLNENÉ | ČAKÁ | ČAKÁ | ČAKÁ | ČAKÁ | ČAKÁ | Krok 1 |
| Po kroku 1 (A) | SPLNENÉ | SPLNENÉ | ČAKÁ | ČAKÁ | ČAKÁ | ČAKÁ | Krok 2, potom 3 |
| Po krokoch 2–3 (kód + B) | SPLNENÉ | SPLNENÉ | SPLNENÉ | ČAKÁ | ČAKÁ | ČAKÁ | Krok 4 |
| Po kroku 4 (S1+O5) | SPLNENÉ | SPLNENÉ | SPLNENÉ | SPLNENÉ | ČAKÁ | ČAKÁ | Krok 5 |
| Po kroku 5 (100 jazdcov) | SPLNENÉ | SPLNENÉ | SPLNENÉ | SPLNENÉ | SPLNENÉ | ČAKÁ | Kroky 6–7 |
| Po kroku 7 (čistenie) | všetko SPLNENÉ | | | | | | Hotovo |

Ak vidíš akýkoľvek **CHYBA** alebo inú kombináciu, **zastav sa**. Stav „kód nasadený“ databáza nevie; po kroku 2 ho over ručne (zelený build vo Verceli, otvoria sa `/transfers`, `/rider`, `/admin/market`).

## Kroky
| # | Čo | Čo to urobí | Po kroku skontroluj |
|---|---|---|---|
| 0 | Kontrola 00 | nič nemení | F0 = SPLNENÉ, ostatné ČAKÁ, ĎALŠÍ KROK = krok 1 |
| 1 | Spusti `supabase/migrations/20261119_01_market_hidden_columns_A.sql` | pridá funkciu hviezdičiek, stĺpec a admin funkciu. Nič nemaže, nič neodoberá | Kontrola 00: F1 = SPLNENÉ. Hra funguje po starom |
| 2 | Commit + push cez GitHub Desktop (text v `docs/COMMIT_trh_start.txt`), Vercel zostaví | nový kód: radar 1–200, trvalý Trh, čítanie len verejných stĺpcov, staré admin generovanie vypnuté, presný počet pri resete | **Zelený build vo Verceli**; otvoria sa `/transfers`, `/rider`, `/admin/market` |
| 3 | Spusti `…_02_market_hidden_columns_B.sql` (**len po zelenom builde z kroku 2**) | hráči už nemôžu čítať skryté hodnoty trhu | Kontrola 00: F2 = SPLNENÉ; `/transfers` stále ukazuje jazdcov; `/admin/market` ukazuje skryté hodnoty |
| 4 | Spusti `…_04_dev_cap_s1_youth_floor_o5.sql` (pracovný model S1+O5) | tréning používa nový strop a mladícky floor od najbližšie spracovaného týždňa. Uložené dáta sa nemenia | Kontrola 00: F3 = SPLNENÉ; stránka tréningu sa otvorí a plán sa dá uložiť |
| 5 | Spusti `supabase/seeds/20261119_launch_market_100.sql` | vloží presne 100 nových voľných jazdcov (správa „launch market OK: 100 riders“) | Kontrola 00: F4 = SPLNENÉ; Trh ukazuje nových jazdcov (OVR 69–75, vek 17–20) |
| 6 | Spusti `…/market_launch/01_stare_trhove_kontrola.sql` | iba číta | očakávaný počet 45, kontrolný súčet f8830b1336a1a3a025dccac1619b5d13 |
| 7 | **Naposledy:** `…/02_stare_trhove_zaloha_a_zmazanie.sql` | zálohuje a potom zmaže presne 45 starých `starter-v1` jazdcov v jednej transakcii; pri nezhode sa zastaví | Kontrola 00: F5 = SPLNENÉ, všetko SPLNENÉ |

Poznámky: kroky 2 a 4 patria k sebe (kód a SQL musia mať ten istý model) — krok 4 urob hneď po kroku 3. Existujúci jazdci a ich história sa žiadnym krokom nemenia. S1+O5 je len pracovné vyváženie.

## Čo robiť pri probléme (ochrana skrytých údajov má prednosť)
**Zásada: pri probléme s B sa skryté hodnoty NIKDY neodomykajú automaticky.** Skripty na núdzové prípady sú zámerne **mimo** priečinka migrácií, v `supabase/diagnostics/market_launch/manual_rollbacks/`, takže ich žiadne automatické spúšťanie migrácií nenájde.

1. **Migrácia B pri spustení zlyhá s chybou** — vďaka poistke sa nič nezmenilo (skryté hodnoty ostávajú v pôvodnom stave). Pošli mi text chyby; najčastejšie chýba krok 1.
2. **Po kroku 3 `/transfers` hlási chybu „permission denied“ alebo nefunguje** — najčastejšia príčina je **starý kód vo Verceli** (build nie je zelený alebo sa nenasadil). **Nerob rollback.** Hráči pritom nič skryté nevidia, len je Trh dočasne nedostupný. Oprav/nasaď správny build (krok 2) a over `/transfers`.
3. **Nie som si istý stavom (napr. kontrola 00 hlási CHYBA vo fáze 2, alebo sa niečo správa čudne)** — pusti **bezpečný núdzový skript** `manual_rollbacks/SAFE_B_nudzove_zatvorenie_trhu.sql`. Úplne zatvorí tabuľku trhu pre hráčov (verejné aj skryté stĺpce), takže **nič neuniká**. Nákup (`reserve_market_rider`) a admin čítanie fungujú ďalej. Trh je pre hráčov dočasne prázdny/nedostupný. Potom oprav kód, nasaď ho, znova spusti migráciu B a pusti kontrolu 00 (F2 musí byť SPLNENÉ).
4. **`manual_rollbacks/ROLLBACK_B_ODOMKNE_SKRYTE_HODNOTY.sql` je NEBEZPEČNÝ**: vráti hráčom čítanie skrytého Potenciálu, Trainability, Professionalism a Recovery všetkých jazdcov na trhu. Má poistku — bez ručnej úpravy v súbore sa nevykoná. **Nepoužívaj ho pri chybe.** Len ak by som ti ja alebo ty výslovne rozhodli, že dočasne treba skryté hodnoty odhaliť.
5. **Problém so S1+O5 (krok 4)** — `manual_rollbacks/ROLLBACK_S1O5_rozvoj.sql` (malý, jedna funkcia, nemení dáta; už získané body ostanú) a vráť commit s kódom, aby TypeScript sedel so SQL.
6. **Problém po kroku 5 (seed)** — jazdci sú obyčajné voľné riadky; nič nerob, pošli mi výsledok kontroly 00. **Po kroku 7** sa starí obnovia skriptom `03_obnovenie_zo_zalohy_AK_TREBA.sql`.

Po každom probléme pusti kontrolu 00 a pošli mi výsledok.

## Čo sa v admin časti zmenilo
Tlačidlo „Vygenerovať market pool“ je trvalo neaktívne (staré generovanie je vypnuté, kým neschválime nový generátor). Tlačidlo resetu je aktívne len ak je v sezóne čo bezpečne zmazať a ukazuje presný počet; vrátených, rezervovaných a vlastnených jazdcov nikdy nemaže. Nových 100 jazdcov sa počíta ako „nikdy nevlastnení“, kým ich niekto nekúpi.
