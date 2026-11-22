# BIBLIA PROJEKTU — Cycling Manager

**Posledná aktualizácia:** 2026-11-22 (Sponzori + katalóg 30 sponzorov). Toto je JEDEN hlavný dokument projektu. Ak začínaš novú konverzáciu s Claudom, nahraj/ukáž mu najprv tento súbor.
**Autor stavu:** zostavené čítaním kódu, migrácií, testov a dokumentácie v repozitári (nič sa nespúšťalo na produkcii). Čo som nevedel potvrdiť, je označené **NEOVERENÉ**.

## Ako čítať túto Bibliu

| Štítok | Význam |
|---|---|
| **HOTOVÉ** | je v kóde a (kde je to uvedené) otestované |
| **ČIASTOČNE** | časť existuje, časť chýba alebo je vypnutá |
| **PLÁNOVANÉ** | schválený návrh/koncept, v kóde nie je |
| **NEOVERENÉ** | neviem potvrdiť (najmä čo beží v produkčnej databáze) |

Dôležité rozlíšenie, ktoré drží celá Biblia: **SCHVÁLENÝ NÁVRH** (čo sme sa dohodli) ≠ **ČO ROBÍ KÓD** (čo v skutočnosti beží). Kde sa líšia, je to napísané výslovne.

**Pravidlo o databáze:** existencia SQL súboru v repozitári **nie je dôkaz**, že bol spustený v produkcii. Stav produkcie poznám iba z toho, čo mi Mirko povedal (kap. 6).

**Kde je detail:** `docs/DECISIONS.md` (rozhodnutia C-xxx, otvorené O-xxx), `docs/snippets/DECISIONS_C-087_C-094_append.md` (C-087…C-098, zatiaľ nezlúčené), `docs/DECISIONS_C-076…C-086_append.md` (nezlúčené), `docs/GAME_DESIGN.md` (staršie mechaniky; **časti sú zastarané**, pozri kap. 2), `docs/DESIGN_SYSTEM.md` (UI), `docs/DEPLOY_trh_start.md` (nasadenie), `packages/race-engine/docs/DESIGN_GAPS.md` (pretekový engine), `supabase/migrations/README.md` (migrácie), `docs/CURRENT_TASK.md` (čo sa robí práve teraz).

---

## 1. Aktuálny stav hry

| Oblasť | Stav | Poznámka |
|---|---|---|
| Registrácia, prihlásenie, nastavenia, profil manažéra | HOTOVÉ | stránky /login /register /forgot-password /settings |
| Ligy a podligy (5 líg, max 50 hráčov v podlige) | HOTOVÉ (kód) | migrácia `20261114_02`; produkcia NEOVERENÉ |
| Rebríčky = tabuľka manažérov v lige | ČIASTOČNE | migrácia `20261116_04` pripravená; bez nej len vlastný manažér |
| Jazdec: profil, radar, Silné stránky, Rozvoj | HOTOVÉ (UI) | /rider, /rider/training, /rider/history, /rider/contract |
| OVR F4 (celkové hodnotenie) | HOTOVÉ (kód + SQL) | produkčná SQL funkcia NEOVERENÉ |
| Tréning (7 plánov, kalendár v2, model rozvoja V2) | ČIASTOČNE | všetko za vypínačmi, štandardne VYPNUTÉ; produkcia NEOVERENÉ |
| Stav jazdca (energia, únava, forma) | ČIASTOČNE | model je v kóde/SQL, vypínač VYPNUTÝ |
| Trh jazdcov (zoznam, detail, filter, zoradenie) | HOTOVÉ (kód) | nasadený kód; 100 jazdcov seed **NEOVERENÉ** |
| Nákup z trhu (rezervácia + týždenná výmena) | ČIASTOČNE | kód + SQL hotové, **vypínač VYPNUTÝ** |
| Kontrakty V1 (10 herných týždňov) | ČIASTOČNE | vypínač VYPNUTÝ; plat/bonusy neexistujú |
| Preteky/Toury (zobrazenie, výber Tourov na sezónu) | ČIASTOČNE | výber Tourov funguje; **simulácia výsledkov nie je napojená** (O-004 NEOVERENÉ) |
| Kalendár, sezóny, spracovanie prechodu sezóny | HOTOVÉ (kód) | lenivé, idempotentné spracovanie (C-008) |
| Bicykel (opotrebovanie, obrázky) | ČIASTOČNE | len zobrazenie; pravidlá C-055 neimplementované |
| Zázemie (Facilities) | ČIASTOČNE | konfigurácia v `lib/facilities/config.ts`; ceny/čísla sú `BALANCE_PLACEHOLDER` |
| Financie | ČIASTOČNE | len kostra UI, **žiadna tabuľka transakcií**, všade „—" |
| Sponzori (`/sponsors`) | ČIASTOČNE | stránka, pravidlá, DB poistky a odmietnutie ponuky sú HOTOVÉ (kód); **bez peňazí**: podpis, predčasné ukončenie, výplaty, generovanie ponúk PLÁNOVANÉ (čakajú na sumy); migrácie `20261122_01` a `_02` NESPUSTENÉ — pozri kap. 5a |
| Personál (/staff), Tím (/team), Scouting (/scouting) | ČIASTOČNE | stránky existujú, v kóde prevažne prázdne stavy/kostra (podľa veľkosti a komentárov; detailná logika NEOVERENÁ) |
| Admin (/admin/market, /admin/riders, test-peloton) | HOTOVÉ (kód) | admin práva čítané zo servera (C-009) |
| Premium | ČIASTOČNE | `premium_entitlements`; Premium radenie/filtre trhu v kóde |
| Majstrovstvá sveta | PLÁNOVANÉ | schválený koncept, bez implementácie (C-015…C-021) |
| Vyvažovanie podlíg, postup/zostup | PLÁNOVANÉ | koncept C-027; bez algoritmu |
| Pretekový engine (`packages/race-engine`) | HOTOVÉ ako samostatný balík (139 testov podľa README) | napojenie na web **NEOVERENÉ** (O-004) |

**Čo je rozpracované a nenasadené (stav 2026-11-19, neodoslané na GitHub):** zoradenie trhu podľa OVR, nový vzhľad trhu + detail jazdca, „Rozvoj" na detaile (migrácia `20261119_06` pripravená, **nespustená**).

---

## 2. Jazdci a vlastnosti

### 2.1 Atribúty (19 verejných, škála 1–200 — C-093)
Zdroj: `apps/web/src/lib/rider/config.ts`.
- **Výkon (7):** climbing (Do kopca), hills (Kopce), flat (Rovina), sprint, timeTrial (Skúška času), endurance (Vytrvalosť), acceleration (Zrýchlenie).
- **Taktika (5):** positioning, attackTiming, reaction, energyManagement, breakawaySkill.
- **Technika (6):** descending, bikeHandling, cornering, packRiding, wetHandling, roughSurface.
- **Skúsenosti (1):** experience (samostatne, nepatrí do skupín).
- (7+5+6+1 = 19.) `breakawaySkill` ≠ pretekový `BreakawayEffort` (C-011).
- Napojenie `breakawaySkill` a `wetHandling` do výpočtu enginu: nevyriešené (O-005).

### 2.2 Celkové hodnotenie OVR — model F4 (C-083, nahrádza C-032) — HOTOVÉ
- `V = 0,60 × priemer(3 najlepšie zo 7 Výkonov) + 0,40 × priemer(všetkých 7 Výkonov)`
- `OVR = 0,60·V + 0,15·najlepšia Taktika + 0,10·najlepšia Technika + 0,15·Skúsenosti`, zaokrúhlené, rozsah 1–200.
- Celočíselný tvar: `700·OVR = 84·top3 + 24·súčet7 + 105·bestTaktika + 70·bestTechnika + 105·Skúsenosti`.
- Kód: `lib/rider/score.ts` (`overallRating`), SQL `rider_overall_rating()` (migrácia `20261117_02`). Testy: `supabase/tests/ovr_f4.test.sh` + TS testy.
- **Pozor:** `GAME_DESIGN.md` a C-032 ešte uvádzajú starý vzorec (0,50/0,25/0,20/0,05) — je **zastaraný**; platí F4.

### 2.3 Skúsenosti (C-092)
Štart najviac 20/200 (pri nových trhových jazdcoch 1–20). **Rastú iba pretekaním**, nie tréningom. Do OVR vstupujú váhou 15 %. Rast cez preteky: **neimplementované v živej hre** (preteky nie sú napojené) — PLÁNOVANÉ.

### 2.4 Skryté vlastnosti (1–100, vrodené, nemenné)
- **Potenciál** — hviezdičky podľa schválených pásiem: 1–39 = 1★, 40–59 = 2★, 60–74 = 3★, 75–87 = 4★, 88–100 = 5★ (`potential_to_stars`, stĺpec `potential_stars`; C-094/O-029 pásma ešte čakajú na finálne potvrdenie).
- **Trénovateľnosť, Profesionalita, Regenerácia, Vitalita** — ďalšie štyri skryté hodnoty.
- Vitalita je nová (C-094); jej vplyv na hru je **zatiaľ popísaný len v dizajne/odhade**, nie overený v živom výpočte.
- Hráč skryté čísla nikdy nevidí presne, iba odhady 1–5 (kap. 4).

### 2.5 Vek, rozvoj, tréning, starnutie, limity
- **Model rozvoja V2** (C-079/C-080): rast = základ tréningu × trénovateľnosť × profesionalita × vek × zázemie × rezerva do stropu × pripravenosť × počet tréningov. Kód `lib/training/development/core.ts`, SQL `apply_development_plan_v2`. **Vypínač (`development_model_settings`) štandardne VYPNUTÝ.** Hlavička migrácie S1+O5 tvrdí, že V2 je v produkcii zapnutý — **NEOVERENÉ** (vypínače je nutné pozrieť v DB).
- **Mäkký strop:** `80 + 150·(Potenciál/100)²` (pracovný model **S1**, C-095; predtým 125). Pevné maximum 200.
- **Mladícka podlaha (O5):** fyzický faktor rezervy aspoň 0,30 do 21 rokov, lineárne na 0 do 26 rokov (C-095). **Oboje je len pracovné vyváženie, nie finálne potvrdenie kariérnej mechaniky.** Migrácia `20261119_04` — Mirko hlásil, že prešla (kap. 6).
- **Starnutie:** kód existuje (`lib/calendar/seasonAging.ts`, spracovanie pri prechode sezóny); presné pravidlá v tejto Biblii **NEOVERENÉ** — pozri C-053/O-022 (maximá 250/180/185/160 a pod. sú návrhy, nie schválené čísla).
- **Veková štruktúra nových jazdcov:** trhoví 17–20 rokov; starter generátor 18–22 (O-014 rozpor).

### 2.6 Stav jazdca (C-084) — ČIASTOČNE
Energia, Únava, Kondícia/Forma, história stavu, rozhranie „záťaž z preteku" pre engine; regenerácia sa dopočítava spojito v čase. Kód `lib/training/state/*`, SQL `20261117_03`. **Vypínač `rider_state_settings` štandardne VYPNUTÝ.** Prenáša sa pri výmene jazdca.

### 2.7 Typ jazdca / špecializácia — **OTVORENÉ ROZHODNUTIE O-027**
Mirkova otázka: používa hra pravidlo **10 %** alebo staré **+2 body**?

**Zistený skutočný stav (zo kódu):**
1. **Pravidlo „10 %" sa v kóde ani dokumentácii nenašlo.**
2. Existuje jediná funkcia na odvodenie typu: `inferArchetype()` v `apps/web/src/lib/rider/generate.ts`. Typ = ten tvar (z 7), ktorého silné atribúty prevyšujú vlastný priemer jazdca o **viac než 2,0 bodu**; inak „allrounder/Univerzál". To zodpovedá starému pravidlu „+2 body" (platí na starterov; pozor, škála sa medzičasom zmenila na 1–200, takže 2 body sú dnes veľmi málo).
3. **Pri 100 nových trhových jazdcoch sa typ nevypočítava** — generátor (`training/development/initialMarket.ts`) typ **priamo pridelí** (jeden zo 7 plánov/tvarov, rozdiel silné–slabé z konfigurácie `typeDelta…`) a uloží ho do `inferred_archetype`.
4. Sedem typov v dátach: allrounder, rouleur, climber, puncheur, sprinter, timeTrial, classics (`SHAPE_OF_PLAN`).

**Čo treba rozhodnúť (nič som nemenil):** má sa „špecializácia" počítať z atribútov (a akým prahom, napr. 10 % nad priemerom), alebo ostane pridelená generátorom? Čo ukazovať, keď žiadny typ nevyhovuje („Bez špecializácie")?

---

## 3. Trh jazdcov

- **Free/Premium:** Free vidí základné zoznamy; Premium (z DB `premium_entitlements`, nie z klienta) má navyše vybrané zoradenia/filtre. HOTOVÉ (kód).
- **Spustenie trhu (rozhodnutie owner 2026-11-19):** presne **100 nových voľných jazdcov**, vek 17–20, **OVR 69–75** (podľa skutočnej F4), Skúsenosti 1–20/200, Potenciál podľa pásiem. Generátor `training/development/launchMarket.ts`; seed `supabase/seeds/20261119_launch_market_100.sql` (pevné ID, sám si overí a pri nezhode vráti všetko). Starý generátor je vypnutý (C-098), tlačidlo „Vygenerovať market pool" trvalo neaktívne.
- **Odstránenie 45 starých jazdcov** (`starter-v1`): skript `supabase/diagnostics/market_launch/02_…` zálohuje a zmaže presne 45 ks, len ak je na trhu už presne 100 platných nových. **NESPUSTENÉ** (podľa Mirka).
- **Zoradenie (C-102, kód hotový, neodoslaný):** predvolene OVR zostupne; remízy stabilne premiešané kľúčom z ID (nie abecedne ani podľa krajiny); platí pre celý trh pred stránkovaním. Bez DB zmeny.
- **Vlajky, typ, detail, radar, karty (C-103, kód hotový, neodoslaný):** zoznam bez stĺpca Potenciál, s vlajkou krajiny a OVR odznakom; detail `/transfers/[id]` so sekciami A–H. **Vzhľad nebol nikdy overený v prehliadači** (v prostredí nie je) — treba pozrieť očami.
- **Nákup + bezpečnosť:** nákup = rezervácia (`reserve_market_rider`), týždenná výmena v pondelok 00:00 UTC (`rider_swaps`, C-052). Klient nemôže písať do `riders`/`market_riders`; verejné stĺpce cez column-level GRANT. Migrácia B (`20261119_02`) uzatvára skryté stĺpce trhu (**prešla podľa Mirka**). **Vypínač nákupu je VYPNUTÝ** (`rider_swap_settings.enabled`).
- **Viditeľné vs skryté:** verejne vek, krajina, 19 atribútov, OVR, typ, `potential_stars`; skryté Potenciál (číslo), Trénovateľnosť, Profesionalita, Regenerácia, Vitalita — hráč ich cez API nedostane (admin ich vidí v `/admin/market`).

---

## 4. Odhady rozvoja a scouting

**Schválené (owner 2026-11-19, možnosť A, C-104):**
- Detail jazdca na trhu ukazuje 5 hodnôt: Potenciál, Trénovateľnosť, Profesionalita, Regenerácia, Vitalita ako úroveň 1–5 (päť malých čiarok, rovnaký vzhľad); Skúsenosti sú presné číslo.
- **Potenciál:** 5 stupňov podľa schválených pásiem, **bez šumu**.
- **Ostatné štyri:** hrubý odhad = skutočná hodnota ±10 stabilného šumu (stabilný = pri obnovení stránky sa nemení), úroveň `ceil(v/20)`; šum vychádza z tajnej soli držanej **iba v databáze** (`private.market_estimate_secret`, nikdy v kóde/GitHube).
- Hráč nikdy nedostane presné skryté hodnoty; radar je konzistentný s odhadmi.
- Ak chýbajú dáta, nezobrazujú sa vymyslené čiarky.

**Implementácia:** funkcia `market_rider_estimates(uuid)` v migrácii `20261119_06` — **PRIPRAVENÁ, NESPUSTENÁ**. Kým sa nespustí, detail ukáže „odhad nedostupný" (kód to ošetruje). Testy: `supabase/tests/market_rider_estimates.test.sh` (37 kontrol) + TS testy `lib/market/estimates.test.ts`.

**Otvorené O-030 (nevyriešené, zámerne nemenené):** odhady **vlastného** jazdca (`my_rider_estimates()`) používajú starú škálu 55–95 (`rider_score_to_level`), preto po nákupe sa úrovne môžu líšiť od úrovní, ktoré hráč videl na trhu. Treba rozhodnúť, či sa zjednotí s trhovou logikou.

**Scouting zázemie:** `lib/facilities/scouting.ts` (`estimatePotentialStars`, okno chyby {1:18,2:14,3:10,4:6,5:3}) existuje, **nepoužíva sa** (PLÁNOVANÉ prepojenie).

---

## 5. Ostatné systémy, ktoré naozaj existujú

- **Kalendár a sezóny (C-039, C-085/C-086):** sezóna 10 týždňov; kalendár v2: nepárne týždne tréning, párne pretekové, Tour týždne 2/4/6/8/10; týždeň 1 príprava, týždeň 10 uzavretý; plán sa dá robiť na nasledujúci týždeň (okno pondelok 18:00 UTC). Kód `lib/calendar/*`, `data/tourSchedule.ts` (V1/V2). Prechod sezóny spracúva `AppShell` lenivo a idempotentne.
- **Tréningové plány:** 7 plánov (Climber, Sprinter, TimeTrial, Puncheur, Classics, Rouleur, Allrounder) s jedným spoločným rozpočtom rastu (migrácia `20261117_04`); tréningové sedenia: Plný Ut/Št/So, Základný Ut/Pi 12:00. Stránka /training je 11-riadkový obal. Za vypínačmi (štandardne VYPNUTÉ).
- **Preteky a Toury:** Toury v dátach (`data/tours.ts`: danube, coastal, highlands, northern-crown, …), registrácia v sezóne (`tour_registrations.season_id`, C-026), body/odmeny v `data/scoring.ts` a `data/rewards.ts` sú **len zobrazenie** (nič nevyplácajú). Počet etáp podľa ligy: 3/4/4/4/5 (O-026: kód vs stav 3/4/5/5/5 — rozpor).
- **Ligy (C-022…C-028):** Rookie, Amateur, Continental, Pro, Elite; nový hráč začína v Rookie; server rozhoduje o lige (profil zamknutý — migrácia `20261114_03`).
- **Zázemie:** Training Center (len Výkonový tréning, C-005), Recovery Center, Scouting; kód + testy v `lib/facilities`; ceny `BALANCE_PLACEHOLDER`.
- **Bicykel:** `bike_condition` (rám, kolesá — migrácia `20261116_03`), stránka /bike, home karta. Pravidlá nákupu/opotrebenia C-055 **neimplementované**.
- **Rebríčky:** /rankings (+ achievements, division, nations, preview, riders); manažérska tabuľka cez `league_points` (migrácia `20261116_04`).
- **Účty/Admin:** `admin_users`, admin stránky; Premium cez DB.
- **Financie, Personál, Tím, Scouting stránky:** kostry (kap. 1).
- **Rozloženie UI:** AppShell, home dashboard (C-056…C-061), jednotný font Manrope (C-064); pravidlá `docs/DESIGN_SYSTEM.md`. i18n: 7 jazykov (sk, en, cs, de, es, fr, pl), kontrola `npm -w @cycling/web run i18n:check`.

---

## 5a. Sponzori (schválené pravidlá 2026-11-22; C-106, O-031)

**Kde:** stránka `/sponsors` (menu pod Financie; záložky Aktívne zmluvy / Trh sponzorov (trh = iba 3 osobné hlavné ponuky hráča, žiadny verejný katalóg ani filter); `?demo=1` = ukážka dizajnu označená DEMO). Kód: `apps/web/src/lib/sponsors/` (rules, repository, demo), `components/sponsors/`, `app/sponsors/`; DB: `supabase/migrations/20261122_01_sponsors_foundation.sql`; testy: `lib/sponsors/rules.test.ts`, `components/sponsors/SponsorCards.test.tsx`, `supabase/tests/sponsors_foundation.test.sh`.

| Pravidlo | Stav |
|---|---|
| Limity hlavní/vedľajší: Rookie 1/1, Amateur 1/2, Continental 1/2, Pro 1/3, Elite 2/2 | HOTOVÉ (kód + DB poistka, testované) |
| Dĺžka zmluvy: hlavný Rookie–Pro 10 týždňov, Elite 10 alebo 20; vedľajší 5 | HOTOVÉ (kód + DB, testované) |
| Vlastný koniec zmluvy, prechod cez sezóny, postup/zostup zmluvu nemení | HOTOVÉ (v DB nie je stĺpec ligy na zmluve; test) |
| Osobný trh, max 3 hlavné + 3 vedľajšie ponuky, platnosť 3 herné týždne | HOTOVÉ (DB poistka 3+3; platnosť = `expires_at`); *generovanie ponúk* PLÁNOVANÉ |
| Odmietnutie ponuky (zmizne hneď) | HOTOVÉ (`reject_my_sponsor_offer`, testované) |
| Ponuky pri obsadených miestach: vidno, nedá sa podpísať | HOTOVÉ (UI + `signBlock`) |
| Rovnaký sponzor nie dvakrát po sebe | HOTOVÉ (DB trigger; výklad: posledná podpísaná zmluva hráča) |
| Dva nepovinné ciele (základný + náročnejší), 12 typov, Elite bez postupu, MS ciele podľa líg | HOTOVÉ (štruktúra, DB kontrola); *vyhodnocovanie* PLÁNOVANÉ (preteky nie sú napojené, nič sa nevyhodnocuje z vymyslených dát) |
| Opakovateľné ciele sa platia opakovane, bonusy sa sčítavajú, jednorazové raz | HOTOVÉ ako dátový model (`sponsor_payouts` s jedinečným kľúčom); výplata NEIMPLEMENTOVANÁ |
| Týždenný update nedeľa 00:00 Europe/Bratislava | ČIASTOČNE: kľúč týždňa hotový a testovaný (`sponsor_week_key`), **plánovač/beh update PLÁNOVANÝ** |
| Predčasné ukončenie, odstupné 30 % zostávajúceho príjmu | ČIASTOČNE: výpočet hotový (1000×4 → 1200, testované), tlačidlo **zamknuté**, funkcia v DB neexistuje |
| Podpis zmluvy | PLÁNOVANÉ: tlačidlo Prijať zamknuté; DB nemá funkciu na podpis; zmluva bez kladných súm sa do DB nedá uložiť |
| Katalóg 30 hlavných sponzorov (`kind` main, `catalog_no` 1–30), schválené názvy, jedna firma môže sponzorovať neobmedzene hráčov | HOTOVÉ v kóde a migrácii `_02` (NESPUSTENÁ); stránka ho číta z databázy (Trh sponzorov → „Katalóg hlavných sponzorov"); katalóg vedľajších sponzorov PLÁNOVANÝ (stĺpec `kind` ho umožňuje) |
| Platnosť ponuky presne 21 dní | HOTOVÉ (DB CHECK, test) |
| Všetky sumy (príjem, bonusy) a vzorce ponúk | **NESCHVÁLENÉ**, v hre sa zobrazuje „Zatiaľ neurčené", nič nie je vymyslené |
| Úvodné ponuky pre nového hráča (3+3 bez vyjednávania) | PLÁNOVANÉ (potrebuje názvy firiem a vzorce) |

Schválené názvy (v tomto poradí): 1 Veltaro Cycling, 2 Kadrin Wheels, 3 Aerovex, 4 Torvello Bikes, 5 Rydexa, 6 Solvanta Energy, 7 Noryx Power, 8 Voltaris Group, 9 Eltrava Energy, 10 Energonix, 11 Veltrion Motors, 12 Arvexa Automotive, 13 Nordaris Mobility, 14 Motravia, 15 Axeron Motors, 16 Datrix Systems, 17 Quantelis, 18 Nexoria Tech, 19 Syntrava, 20 Corevanta, 21 Monvera Capital, 22 Asteriq Finance, 23 Valtrix Bank, 24 Norvella Insurance, 25 Fintravo, 26 Altivex Logistics, 27 Montaris Group, 28 Avendra Global, 29 Trinex Industries, 30 Orvanta Holdings (C-107; zatiaľ sa nemenia).

**Generátor ponúk (C-108, O-032):** migrácia `20261122_03`. Server-side; každý hráč max 3 osobné hlavné ponuky z katalógu 30 firiem (bez opakovania v sade, nie firma posledného podpísaného kontraktu), 2 rôzne ciele (ľahší/ťažší) z 7 reálne vyhodnotiteľných (nie Worlds, postup, výhra sezóny), platnosť presne 21 dní, bez peňazí. Nový hráč dostane ponuky hneď (trigger) alebo pri prvej návšteve `/sponsors`; doplnenie po odmietnutí/expirácii pri najbližšej nedeli 00:00 Bratislava. **Plánovač nie je napojený** (funguje lenivé doplnenie; voliteľný pg_cron je popísaný v migrácii a nie je zapnutý). Hodnoty rebríčka cieľov sú návrh na schválenie (O-032). Testy: `supabase/tests/sponsors_generator.test.sh` (91), `lib/sponsors/generator.test.ts` (26).

**Oprava generátora (C-109):** migrácia `20261122_04`. Hráč nikdy nedostane ponuku od firmy, s ktorou má platnú ponuku alebo aktívnu zmluvu (hlavnú/vedľajšiu), ani od firmy poslednej podpísanej zmluvy; chráni to databáza (triggre + unikátny index + zámok na hráča), nielen generátor. Po odmietnutí sa náhrada nevytvára hneď. Ciele sa vyberajú podľa skutočného kalendára (`tour_schedule` + začiatok sezóny): ponúkne sa len cieľ, na ktorý je v zmluve garantovane dosť pretekových týždňov; bez kalendára sa nič negeneruje. Staré duplicity: `sponsor_duplicate_report()` / `sponsor_fix_duplicate_offers()` (štandardne suchý beh, nič sa nemaže). Testy: `supabase/tests/sponsors_fixes.test.sh` (61), `sponsors_generator.test.sh` (91; s `WITH_04=1` 93), `generator.test.ts` (42).

**Finálna kontrola (C-110):** migrácia `20261122_05` uzatvára ochranu „jedna firma na hráča“ aj pre UPDATE (zmena firmy, hráča, stavu ponuky/zmluvy), s rovnakým zámkom na hráča ako INSERT. Migrácie `_01`–`_04` majú ORDER GUARD (starší súbor po novšom sa odmietne). Kalendár: SQL výpočet je overený voči TypeScript kalendáru spoločným fixture a pred nasadením ho kontroluje read-only skript `supabase/diagnostics/sponsors_predeploy_check.sql`. **Plánovač nedeľného updatu NIE JE napojený** — ponuky sa dopĺňajú pri prvej návšteve `/sponsors` po nedeli 00:00, nie automaticky pre všetkých. Postup nasadenia: `docs/PREDNASADZOVACI_ZOZNAM_SPONZORI.md`. Testy: `sponsors_fixes.test.sh` (113), `generator.test.ts` (53), `reach.test.ts` (9).

**Poradie nasadenia Sponzorov:** záloha → diagnostika → `20261122_01` → `_02` → `_03` → `_04` → `_05` → diagnostika (každá v jednej transakcii; starší súbor po novšom sa odmietne); kód môže ísť pred aj po migráciách (bez nich ukáže prázdne stavy).

Poistky: hráč zo stránky nemôže nič zapisovať (iba čítať vlastné riadky a odmietnuť vlastnú ponuku); `sponsor_settings.economy_enabled` = false.

## 6. Databáza a nasadenie

### 6.1 Tabuľky (v `supabase/schema.sql`)
admin_users, bike_condition, league_divisions, league_memberships, league_rider_limits, market_riders, player_facilities, premium_entitlements, profiles, race_results, rider_acquisitions, rider_attribute_history, rider_career_events, rider_contracts, rider_swap_settings, rider_swaps, rider_training_progress, riders, season_transition_processing, tour_registrations, tour_schedule, training_plans (+ pomocné nastavenia modelov). RLS: klient nepíše do `riders`/`training_plans`/`market_riders`; zápisy cez SECURITY DEFINER funkcie. (Podrobnosti: `supabase/schema.sql`, testy v `supabase/tests/`.)

### 6.2 Migrácie a stav v produkcii

| Migrácia | Účel | Stav v produkcii |
|---|---|---|
| 20261114_01/02/03 | sezóna Tour registrácie, ligy/podligy, zámok profilu | NEOVERENÉ |
| 20261115_01 | training_security (zamknutie riders/plans) | **prešla** (C-044) |
| 20261115_02 | pravidlá plánovania tréningu | **prešla** (C-044) |
| 20261115_03 | sledovanie vývoja jazdca | NEOVERENÉ |
| 20261116_01/02 | kontrakty V1, nákup + výmena (vypínač OFF) | NEOVERENÉ |
| 20261116_03/04 | bicykel rám/kolesá; ligová tabuľka | NEOVERENÉ |
| 20261117_01–04 | model V2, OVR F4, stav jazdca, kalendár+plány | NEOVERENÉ (OVR F4 funkcia musí existovať, ak seed prešiel) |
| 20261119_01 (A) | `potential_to_stars`, `potential_stars` | **prešla** (podľa Mirka) |
| 20261119_02 (B) | zatvorenie skrytých stĺpcov trhu | **prešla** (podľa Mirka) |
| 20261119_04 | S1+O5 strop a mladícka podlaha | **prešla** (podľa Mirka) |
| 20261119_06 | `market_rider_estimates` | **NESPUSTENÁ, pripravená** |
| 20261122_01 | Sponzori — základ (tabuľky, poistky, bez peňazí) | **NESPUSTENÁ, pripravená** |
| 20261122_02 | Katalóg 30 hlavných sponzorov (spúšťať PO `_01`) | **NESPUSTENÁ, pripravená** |
| 20261122_03 | Generátor ponúk a cieľov (spúšťať PO `_01` a `_02`) | **NESPUSTENÁ, pripravená** |
| 20261122_04 | Oprava generátora: jedna firma na hráča, DB stráže, kalendár cieľov (PO `_01`–`_03`) | **NESPUSTENÁ, pripravená** |
| 20261122_05 | Stráže pri UPDATE (PO `_01`–`_04`) | **NESPUSTENÁ, pripravená** |
| seed 100 jazdcov | nový trh | **NEOVERENÉ** (Mirko nevedel povedať) |
| zmazanie 45 starých | čistenie | **NESPUSTENÉ** |

Zdroj stavu: Mirkova správa 2026-11-19 18:41 (záloha vytvorená a overená — 66/66 tabuliek; migrácie A, B, S1+O5 prešli; nový kód trhu nasadený, Vercel Ready). Nikdy som sa nepripájal k produkcii. **Overiť:** pustiť `supabase/diagnostics/market_launch/00_predeploy_kontrola_LEN_CITANIE.sql` (iba číta) — povie, ktoré fázy sú SPLNENÉ.

### 6.3 Záloha (Supabase FREE plán)
Žiadne automatické zálohy ani Restore. Záloha sa robí ručne cez `pg_dump` balíkom `zaloha-supabase-windows` (Windows PowerShell; skripty `01_zaloha`, `02_over_zalohu`, `03_skusobna_obnova`, návod `NAVOD_zaloha_Windows.md`) — **mimo repozitára**. Skripty boli testované len na Linuxe/PowerShell 7 s falošnou DB, **na reálnom Windows ich ešte nik neskúsil (NEOVERENÉ)**; Mirko ale zálohu úspešne spravil (66/66 tabuliek). Záloha neobsahuje Storage, Vault, Edge Functions, secrets. Heslo/connection string nikdy do chatu.

### 6.4 Bezpečné nasadenie
1. Záloha → kontrola 00. 2. SQL migrácia (ručne v SQL Editore, po jednej, celý súbor). 3. Kód: GitHub Desktop commit + push → Vercel zostaví automaticky; skontrolovať zelený build. 4. Po každom kroku kontrola 00. Poradie trhu: **A → kód → B → S1+O5 → seed → kontrola → zmazanie 45**. Pri probléme sa skryté hodnoty **nikdy** neodomykajú automaticky; núdzový postup `manual_rollbacks/SAFE_B_nudzove_zatvorenie_trhu.sql`; S1+O5 vrátenie podľa `docs/S1O5_rollback_postup.md`. Env premenné žijú na Verceli, nie v gite. Podrobne: `docs/DEPLOY_trh_start.md`.
Prostredie na vývoj: `web:build` v sandboxe padá na sťahovaní Google Fonts (nie chyba kódu); typecheck a testy prechádzajú.

---

## 7. Schválené herné rozhodnutia (kľúčové; úplný zoznam v DECISIONS.md)

| ID | Rozhodnutie | Kde v kóde | Testované |
|---|---|---|---|
| C-083 | OVR F4 | `lib/rider/score.ts`, SQL `rider_overall_rating` | áno (`ovr_f4.test.sh`, TS) |
| C-093 | škála atribútov 1–200 | `lib/rider/config.ts` | áno |
| C-092 | Skúsenosti 1–200, štart ≤20, rastú len pretekmi | generátor | štart áno; rast pretekmi NEIMPLEMENTOVANÝ |
| C-094 | pásma Potenciálu + skryté hodnoty | `potential_to_stars`, `config.ts` | áno (`market_launch`, estimates) |
| C-095 | S1+O5 (pracovný model) | `development/config.ts`, SQL `20261119_04` | áno (`dev_s1o5_rollback`, `dev_room_parity`) |
| C-079/080 | model rozvoja V2 | `development/core.ts`, SQL | áno (`development_v2`) |
| C-084 | model stavu jazdca | `training/state/*` | áno (`rider_state`) |
| C-085/086 | 7 plánov + kalendár v2 | `training/*`, SQL | áno (`training_plans_calendar`) |
| C-050/052 | kontrakty V1, nákup + výmena | `lib/contract/*`, SQL | áno (`rider_contracts`, `rider_swaps`) |
| C-090 | kontrakty — koncept 2–10 týždňov | — | **neimplementované** |
| C-098 | starý generátor vypnutý | admin UI | áno (`market_launch`) |
| C-096/097 | význam `season_id`, audit starej škály 55–95 | docs | — |
| C-107 | Katalóg 30 hlavných sponzorov (zdroj generátora, verejne sa nezobrazuje od C-108) | `lib/sponsors/catalog.ts`, SQL `20261122_02` | áno (20 + 19 + 36); vzhľad overený snímkami (mobil/tablet/desktop) |
| C-108 | Generátor osobných ponúk hlavných sponzorov a cieľov | SQL `20261122_03`, `lib/sponsors/repository.ts`, `app/sponsors/page.tsx` | áno (91 + 26 + 22); vzhľad overený snímkami (mobil/desktop) |
| C-109 | Oprava generátora: duplicitná firma, súbežnosť, ciele podľa kalendára | SQL `20261122_04` | áno (61 + 93 + 42) |
| C-110 | Finálna kontrola Sponzorov: UPDATE stráže, order guard, diagnostika kalendára, zoznam pred nasadením | SQL `20261122_05`, `supabase/diagnostics/sponsors_predeploy_check.sql`, `docs/PREDNASADZOVACI_ZOZNAM_SPONZORI.md` | áno (113 + 53 + 9) |
| C-106 | Sponzori (bez peňazí) | `lib/sponsors/*`, `app/sponsors`, SQL `20261122_01` | áno (57 + 19 + 81); vzhľad overený snímkami v headless Chrome (mobil + desktop), nie v živej hre |
| C-102 | zoradenie trhu podľa OVR | `lib/market/marketSort.ts` | áno |
| C-103 | vzhľad trhu + detail | `components/market/*`, `transfers/[id]` | komponenty áno; vzhľad v prehliadači nie |
| C-104 | Rozvoj na detaile (možnosť A) | `market_rider_estimates`, `estimates.ts` | áno; SQL nespustené v produkcii |
| C-038 | bezpečnosť tréningu | SQL `20261115_01` | áno (`training_security` 149/149) |
| C-039 | pravidlá plánovania | SQL `20261115_02` | áno |
| C-022…C-028 | ligy a podligy | SQL `20261114_*` | áno (`league_divisions`) |

**Poznámka o číslovaní:** v tejto relácii som pôvodne použil ID C-099/C-100/C-101, ktoré kolidovali s `docs/snippets/DECISIONS_C-087_C-094_append.md` (tam C-099 = zálohy mimo migrácií, C-100 = tri opravy ZIP v3). Moje boli **premenované na C-102 (zoradenie), C-103 (vzhľad/detail), C-104 (Rozvoj)**. Snippet súbory ešte treba zlúčiť do `DECISIONS.md`.

---

## 8. Otvorené úlohy a budúce nápady

### 8.1 Chyby / nezrovnalosti
- O-030: staré odhady vlastného jazdca (škála 55–95) ≠ trhové odhady.
- O-026: počet etáp podľa líg (3/4/4/4/5 vs 3/4/5/5/5).
- O-014: vek trhových jazdcov 17–20 vs generátor starterov 18–22.
- Duplicitné/nezlúčené súbory rozhodnutí (kap. 7 poznámka); `docs/CURRENT_TASK_new.md` pravdepodobne zvyšok (nepoužité, treba potvrdiť).
- `ODSTRAN.txt`: súbory na ručné vymazanie (EquipmentCard.tsx, BikeCard.test.ts, lib/races/recentResults.ts) a **3 súbory v `supabase/migrations/`** (zastaraný `20261114_league_divisions.sql` a dva `…ROLLBACK.sql`) — na GitHube sú stále; test `migrations_active_set` kvôli nim zlyháva.
- GAME_DESIGN.md obsahuje zastarané časti (starý OVR vzorec).

### 8.2 Rozhodnutia čakajúce na schválenie Mirkom
- **O-027** špecializácia: 10 % vs +2 vs pridelenie generátorom (kap. 2.7).
- **O-028** ponuka kontraktu: či hra vôbec má plat a bonusy, jednotky, backend.
- **O-029** finálne pásma Potenciálu.
- **O-030** zjednotenie odhadov vlastného jazdca.
- **C-090** detaily kontraktov (2–10 týždňov, plat exponenciálne rastie).
- S1+O5: sklon stropu 1,5 a mladícka podlaha 0,30 sú len pracovné.
- O-013…O-022: nákup/výmena/kontrakty (zrušenie rezervácie, limity líg, aktivácia vypínačov).
- O-022: maximá atribútov a „správny manažment" v dlhodobom rozvoji.

### 8.3 Plánované funkcie (schválený koncept)
Majstrovstvá sveta (C-015…C-021), vyvažovanie podlíg (C-027), bicykel a komponenty (C-055, O-023/O-025), rast Skúseností pretekmi, napojenie pretekového enginu na hru, finančný denník, scouting odhady zo zázemia.

### 8.3b Sponzori — čaká na sumy
Pozri kap. 5a a O-031: sumy, vzorce ponúk, názvy firiem, plánovač nedeľňajšieho updatu, finančná história, potom podpis/ukončenie/výplaty.

### 8.4 Budúci systém kontraktov (NIE JE implementovaný)
Plat jazdca, bonusy, dĺžka zmluvy (koncept 2–10 týždňov), ponuky jazdcovi, generátor **základného platu** podľa OVR. V DB neexistujú stĺpce platu/bonusov. Súčasný V1 = pevných 10 herných týždňov, vypínač VYPNUTÝ.

### 8.5 Nápady (nezáväzné)
Zdroje v simulačných správach `OVR_MODEL_*`, `TRAINING_*` (návrhy, nie rozhodnutia).

---

## 9. Ďalšie priority (len návrh, nezačaté)

1. **Dokončiť štart trhu:** overiť kontrolou 00 stav produkcie, nasadiť kód trhu (zoradenie + vzhľad + detail), spustiť `20261119_06`, seed 100 jazdcov, potom (po kontrole) zmazať 45 starých.
2. **Rozhodnúť O-027 a O-030** (špecializácia a odhady vlastného jazdca) — bez nich sa nedá bezpečne ladiť trh a rozvoj.
3. **Napojiť preteky/výsledky** (O-004: overiť stav enginu vo webe) — zatiaľ nič nezískava Skúsenosti ani body.

---

## Dodatok: pravidlá spolupráce (z CLAUDE.md)
Slovensky, stručne, jednoducho. Malé úlohy; zásah do viac súborov = najprv plán. Nemeniť fungujúci kód, mechaniky ani UI bez súhlasu. Žiadne nové farby mimo tokenov. Nový text = i18n kľúče vo všetkých 7 jazykoch. Pri zmene kódu: ZIP + hotový commit pre GitHub Desktop (jednoriadkový Summary + krátky Description). Na konci práce prepísať `docs/CURRENT_TASK.md` a nové rozhodnutia zapísať do `docs/DECISIONS.md`. Nič sa nepushuje ani nenasadzuje bez Mirkovho súhlasu.
