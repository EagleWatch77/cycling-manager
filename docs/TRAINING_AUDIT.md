# Audit tréningu V1 (2026-11-15) — iba čítanie, nič sa nezmenilo

Značky: **[IMPL]** reálne implementované (kód/SQL), **[DOC]** iba zdokumentované, **[CHÝBA]** neexistuje, **[UI]** iba zobrazenie, **[NEOVERENÉ]** vyplýva z kódu, nespustené na živej DB.
Zdroje: `lib/training/*`, `supabase/schema.sql` (`process_training_plan`, RLS), `lib/facilities/config.ts`, `lib/calendar/season.ts`, `lib/gameState.ts`, `GAME_DESIGN.md §3–4`, `DECISIONS C-005/C-006/O-006/O-008`.

## 1. Pravidlá tréningu

| Pravidlo | Stav | Poznámka |
|---|---|---|
| Typy: Performance, Technical (1 plán/jazdec/týždeň) | IMPL | C-006, `config.ts`, SQL kontroluje pár typ↔zameranie |
| Trénovateľné: 7 Performance (climbing, hills, flat, sprint, timeTrial, endurance, acceleration) a 6 Technique | IMPL | Tactics a Skúsenosti sa netrénujú (Tactics má rásť cez budúce preteky — CHÝBA) |
| Intenzita (iba Performance): ľahká 1 / normálna 2 / ťažká 3 tréningy | IMPL | je to počet jednotiek v násobku rastu |
| Technical: vždy 1 jednotka, bez voľby intenzity, max +1 bod / plán | IMPL | zvyšok progresu sa prenáša |
| Dni tréningu: ľahká Ut, normálna Ut+Št, ťažká Ut+Št+So, technical Ut | UI | iba vizuálny pás; SQL spracuje celý týždeň naraz, dni nemajú žiadny efekt |
| Rast Performance = 3 × session × trainability(0,5+t/200) × professionalism(0,8+p/500) × vek × zázemie × readiness × developmentRoomFactor | IMPL | SQL aj TS zrkadlo (`growth.ts`), ručne zosúladené |
| Rast Technical = 2,0 × trainability × professionalism × vek × readiness | IMPL | bez zázemia a bez potenciálu |
| Sekundárny atribút 35 % (iba Performance, pevná mapa) | IMPL | |
| Akumulátor: prah 12, celé body, zvyšok sa prenáša (`rider_training_progress`) | IMPL | |
| Vek: 17–19 ×1,30 … 35+ ×0,30 | IMPL | použitý vek v čase spracovania |
| Potenciál: iba cez `development_room_factor(hodnota, overallPerformance, potential)`, strop atribútu 200 | IMPL | |
| Trénovateľnosť, profesionalita | IMPL | faktory vyššie |
| Atribút Regenerácia jazdca (`riders.recovery`) | **CHÝBA** | SQL ho nečíta; tréning/regenerácia ho nepoužívajú, zobrazuje sa len v Rozvoji |
| Energia/únava: cena tréningu raz za týždeň (ľahká 5/5, normálna 10/10, ťažká 15/18, technical 5/5) | IMPL | |
| Pasívna regenerácia: počet voľných dní (6/5/4, technical 6) × 5 energie, × 4 únavy, × násobok Regeneračného centra | IMPL | zaokrúhli sa a ohraničí 0–100 |
| Pripravenosť = (energia + 100 − únava)/2 → násobok účinnosti 1,0/0,95/0,85/0,70/0,50 | IMPL | zo stavu PRED týmto týždňom; hráč vidí len slovný štítok |
| Forma, kondícia, morálka | **CHÝBA** | iba štartovacie hodnoty (50/60/70), tréning ich nemení, nič iné tiež |
| Regenerácia bez plánu (týždeň bez tréningu) | **CHÝBA** | stav sa mení iba v `process_training_plan`, nečinný týždeň = žiadna regenerácia |
| Zázemie: Training Center (veková pásma 17–23/24–27/28–31/32+, +15/10/5/3 %, iba Performance) | IMPL | čísla `[PLACEHOLDER]`; efektívna úroveň = min(úroveň, strop ligy, strop Team Center); admin strop 5 |
| Zázemie: Recovery Center ×1,00–1,20 | IMPL | `[PLACEHOLDER]` |
| Tréner, fyzioterapeut | **CHÝBA** | neexistuje tabuľka personálu (`app/staff` je UI shell, O-002) |
| Technical Center | iná vec | riziko bicykla, netýka sa tréningu |
| Level zázemia sa berie z času spracovania, nie z času tréningového týždňa | IMPL (správanie) | otázka D9 |

## 2. Skutočný priebeh

1. **Uloženie plánu:** `saveTrainingAction` → `saveTrainingPlan` (server): povolí iba „aktuálny týždeň + 1“ (strop týždeň 10), overí pár typ/zameranie, `upsert` do `training_plans` (UNIQUE rider+sezóna+týždeň), odmietne ak už `applied_at`. Viazané na `season_id` (`season-N`) a `week_number`. IMPL.
2. **Spustenie:** výhradne lenivo pri načítaní stránky **Jazdec → Tréning** (`processCompletedTrainings`). **Nie je** v `ensureGameStateProcessed` (ten rieši iba starnutie sezóny), **neexistuje cron** (O-006). Plán sa spracuje, keď `plan.seasonId !== aktuálna sezóna` alebo `weekNumber < currentWeek`.
3. **Bez prihlásenia hráča:** neprebehne. RPC `process_training_plan` vyžaduje `auth.uid()` = vlastník, takže serverový plánovač bez session by nič nespravil. Neprihlásený hráč má jazdca „zamrznutého“ do prvej návštevy Tréningu. AI jazdci netrénujú vôbec.
4. **Zmeškané dni/týždne:** po návrate sa spracujú všetky nespracované plány v poradí `week_number` (**bez ohľadu na sezónu** — chyba poradia pri plánoch z viacerých sezón). Každý používa aktuálny stav/zázemie/vek v čase spracovania. Týždne bez plánu sa nespracujú vôbec (žiadna regenerácia ani prepadnutie).
5. **Dvojité spracovanie:** brání mu zámok riadku plánu (`for update`) a kontrola `applied_at` v RPC. Funguje pre normálny tok; pozri bezpečnosť (priamy zásah klienta ho obíde).
6. **História:** `applied_at`, `primary/secondary_attr`, `primary/secondary_gain` sa zapisujú do `training_plans`. IMPL. Zobrazenie: posledné 3 podľa `applied_at`, bez sezóny. Zmena kondície sa ukladá ako `condition_previous` (jediný záznam, nie história).

## 3. Globálna sezóna a príčina „Týždeň 4/5 Prebehol“
- Tréning používa spoločný kalendár `getCurrentSeasonInfo()` (kotva 2026-08-17, 10 týždňov = 70 dní, `season-N`) a SQL zrkadlo `season_id_at()`. Sezóny rozlišuje cez `season_id`. IMPL.
- **Príčina (zo kódu, NEOVERENÉ v dátach):** „Posledné tréningy“ = 3 najnovšie riadky s `applied_at` zoradené podľa `applied_at`, **bez filtra sezóny a bez zobrazenia sezóny**. Týždne 5 a 4 sú takmer iste plány zo Sezóny 1, ktoré sa spracovali až pri prvej návšteve Tréningu po prechode do Sezóny 2, a preto majú najnovšie `applied_at`. Alternatíva: riadky vložené priamo cez API (pozri 4) — to sa dá odlíšiť dopytom:
  `select season_id, week_number, created_at, applied_at from training_plans order by applied_at desc limit 10;`
  (`season-1` ⇒ staré tréningy; iný/čudný `season_id` ⇒ priamy zásah.)
- Okrajové javy kalendára: (a) týždeň 1 každej sezóny sa **nedá nikdy naplánovať** (v týždni 10 sa plánuje týždeň 10, nie 1. týždeň ďalšej sezóny); (b) v týždni 10 je „plánovateľný“ týždeň rovnaký ako aktuálny; (c) spracovanie plánu je kedykoľvek po skončení jeho týždňa.
- **Tour/pretekové týždne:** žiadne prepojenie. Tréning sa plánuje a spracuje bez ohľadu na preteky (zámerne, komentár v kóde). Preteky neznižujú energiu ani nemenia kondíciu. Konflikt pravidlá: CHÝBA (otázka D5).

## 4. Bezpečnosť (nadväzuje na O-008) — NEOVERENÉ na živej DB, vyplýva z RLS/grantov
- `training_plans`: politiky `insert`/`update` kontrolujú len vlastníctvo jazdca, **nie týždeň, sezónu ani stĺpce** (`update` nemá `with check`). Hráč cez Supabase API môže: vložiť plán na ľubovoľnú sezónu/týždeň (obíde „iba týždeň +1“), zmeniť zameranie/intenzitu potvrdeného plánu (obíde „plán je trvalý“), zmazať a vložiť nový, **nastaviť `applied_at = null` na spracovanom pláne** (znovu spracovanie) alebo priamo prepísať `primary_gain`/`applied_at`.
- `process_training_plan(uuid)` má `grant execute … to authenticated` a **nekontroluje, či týždeň plánu už skončil**. Hráč môže plán spracovať okamžite a navyše vloženým plánom s cudzím `season_id` (isWeekOver ho vždy berie ako „skončený“) pokryť neobmedzený počet spracovaní ⇒ neobmedzený rast atribútov.
- `riders`: `grant update` + politika `update` bez obmedzenia stĺpcov ⇒ hráč môže priamo zapísať `attributes`, `condition`, `potential`, `trainability`, `age`. Tréningové pravidlá teda nie sú autoritatívne, kým tento zápis existuje.
- `riders_select_own` dovoľuje čítať aj AI jazdcov vrátane skrytých hodnôt (Potenciál atď.) — samostatné zistenie, ešte nezapísané ako otvorené.
- Dobre navrhnuté (IMPL): `player_facilities` (zápis iba cez `upgrade_facility`), `rider_training_progress` (iba select), `profiles` (O-007 oprava v migrácii 03), výpočet rastu/kondície len v SQL, žiadny parameter okrem id plánu.

### Návrh bezpečného riešenia (nič nenaimplementované)
1. **`save_my_training_plan(week_type, focus, intensity)`** — security definer: sezónu a týždeň odvodí zo SQL času (`current_season_id()` + nová SQL funkcia týždňa), validuje pár typ/zameranie/intenzita, zapíše jediným upsertom, odmietne prepis spracovaného a (podľa D11) aj potvrdeného plánu. Klient neposiela sezónu ani týždeň.
2. **Odobrať priame zápisy** do `training_plans` (insert/update/delete) a obmedziť `riders` update (stĺpcové granty alebo trigger ako pri `profiles`; najprv zistiť, ktoré stĺpce app legitímne mení).
3. **Interná `apply_training_plan(plan_id)`** bez `auth.uid()` a bez prístupu pre `authenticated`; spracuje iba plán, ktorého týždeň už skončil (podľa SQL kalendára), s `applied_at` ako atomickým „claim“ (už je) a deterministickým poradím (sezóna, týždeň).
4. **Spustenie nezávislé od klienta:** `process_due_training()` volaná z `pg_cron` (Supabase) pre všetkých jazdcov, plus lenivé spustenie pri návšteve ako záloha. Projekt nemá service-role kľúč, `pg_cron` ho nepotrebuje — rozhodnutie O-006/D8.
5. Migrácia podľa vzoru `supabase/migrations/2026…_0N` (idempotentná, ručne v SQL editore, SQL pred kódom).

## 5. Dokončenie V1

### 5.1 Čo funguje
Ukladanie plánu so serverovou validáciou, kalendár a rozlíšenie sezón, rastový vzorec a akumulátor (SQL = TS zrkadlo), kondícia a pripravenosť, zázemie (Training/Recovery), história prírastkov, UI.

### 5.2 Čo treba opraviť
1. Priame zápisy (training_plans, riders) a spustiteľný `process_training_plan` klientom (kritické, O-008).
2. Spracovanie len pri návšteve Tréningu; nič pre neprihlásených.
3. Poradie spracovania podľa `week_number` bez sezóny.
4. História bez sezóny a zoradená podľa `applied_at`.
5. Týždeň 1 sezóny sa nedá plánovať; týždeň 10 plánuje „sám seba“.

### 5.3 Chýbajúce mechaniky
Regenerácia bez plánu · vplyv na formu/kondíciu/morálku · použitie atribútu Regenerácia · tréner/fyzioterapeut (personál) · tréning AI jazdcov · vplyv pretekov/Tourov na energiu a tréning · rast Taktiky a Skúseností · spracovanie nezávislé od prihlásenia · história kondície (len `condition_previous`) · SQL/integračné testy (existujú iba TS testy zrkadiel a statická `engineSecurity`).

### 5.4 Etapy (každá malá, samostatne nasaditeľná)
- **E1 Hardening (SQL):** `save_my_training_plan`, odobrať priame zápisy, obmedziť `riders` update, zakázať priame `process_training_plan`, kontrola konca týždňa; test exploitov.
- **E2 Autoritatívne spracovanie:** `apply_training_plan`/`process_due_training`, poradie sezóna+týždeň, idempotencia; lenivé volanie z `ensureGameStateProcessed` ako záloha.
- **E3 Plánovač:** `pg_cron` (po schválení D8), spracovanie neprihlásených.
- **E4 Kalendárne okraje:** týždeň 1, týždeň 10, história so sezónou (po schválení D3/D10).
- **E5 Pravidlá po schválení:** regenerácia bez plánu, forma/kondícia/morálka, atribút Regenerácia (D1, D4, D6).
- **E6 Personál a preteky:** tréner/fyzio, konflikt s Tourom (D5, D7) — samostatné zadania.

### 5.5 Herné rozhodnutia na schválenie (zatiaľ NIE sú schválené)
- **D1 — Regenerácia v týždni bez plánu.** Má jazdec regenerovať energiu/únavu aj v týždni, keď hráč nenaplánoval tréning? Ak áno, akým pravidlom (napr. rovnako ako pasívna regenerácia pri ľahkom tréningu, alebo inak)?
- **D2 — Chýbajúci plán.** Ak hráč na týždeň nenaplánuje tréning, nestane sa nič, alebo sa použije predvolený plán?
- **D3 — Čo znamená „týždeň N“.** Kedy sa tréning plánovaný na týždeň N reálne „odohrá“ (po skončení týždňa N?) a ako riešiť, že týždeň 1 sezóny sa nedá naplánovať a v týždni 10 sa plánuje týždeň 10?
- **D4 — Forma, kondícia, morálka.** Majú ich meniť tréning, preteky alebo iné udalosti? Aktuálne ich nič nemení.
- **D5 — Preteky/Toury vs. tréning.** Ako registrovaný Tour alebo pretekový týždeň ovplyvní tréning a energiu (blokuje, znižuje účinnosť, spotrebúva energiu)? Aktuálne žiadne prepojenie.
- **D6 — Atribút Regenerácia jazdca.** Má ovplyvňovať pasívnu regeneráciu a ako? Aktuálne sa nepoužíva.
- **D7 — Tréner a fyzioterapeut.** Aké efekty majú na tréning/regeneráciu? (Personál zatiaľ neexistuje.)
- **D8 — Spúšťanie na pozadí.** Plánovač cez `pg_cron` v Supabase (spracuje aj neprihlásených), alebo ostať pri lenivom spracovaní pri návšteve?
- **D9 — Zázemie a vek pri spracovaní.** Použiť úroveň zázemia a vek z času spracovania (dnešné správanie), alebo zo začiatku/konca tréningového týždňa?
- **D10 — História tréningov.** Zobrazovať sezónu pri každom zázname, zoradiť podľa sezóny a týždňa a koľko záznamov ukázať?
- **D11 — Zmena potvrdeného plánu.** Smie hráč nespracovaný plán zmeniť/zrušiť? UI hovorí „trvalý“, ale databáza (aj po E1) dovoľuje prepis do spracovania.
- **D12 — Rast Skúseností a Taktiky.** Ako majú tieto atribúty rásť (netrénujú sa)?
- **D13 — AI jazdci.** Majú trénovať a ako sa ich tréning spracuje bez prihlásenia?
- **D14 — Skúsenosti na stránke Tréning.** Zobrazovať ich ako číselný riadok (ako na Prehľade) mimo Rozvoja namiesto úrovne 3/5? (Rozvoj by ostal iba pre skryté atribúty.)

### 5.6 Návrh testov (DB, s pevným „teraz“)
1. Kompletný týždeň: uložiť plán → posunúť čas za koniec týždňa → spracovať → atribúty, `condition_previous`, história sedia s TS zrkadlom (ľahká/normálna/ťažká, technical cap +1).
2. Neprihlásený hráč: posun o 3 týždne bez návštevy → plánovač spracuje v poradí; stav = súčet postupných spracovaní.
3. Prechod sezóny: plán z týždňa 10 + starnutie `+1 vek` → pravidlo D9; plány dvoch sezón sa spracujú v správnom poradí.
4. Opakované spracovanie: dvakrát/paralelne → jedna zmena; `applied_at = null` cez klienta zlyhá.
5. Exploity: klientsky insert na cudzí týždeň/sezónu, update plánu, update `riders.attributes`, priame RPC → všetko odmietnuté.
6. Týždeň bez plánu, týždeň 1, týždeň 10, týždeň s Tourom (po D1/D3/D5).
7. Idempotentný re-run migrácie a SQL = TS zrkadlo na vzorke vstupov (drift test).

## 6. Otvorené otázky
Presná príčina riadkov „Týždeň 4/5“ závisí od dát (dopyt vyššie). Či sa hráč v praxi dostane k priamym zápisom, je z politík jasné, ale nepokúšal som sa o to na živej DB. Ktoré stĺpce `riders` aplikácia legitímne mení (trh, premenovanie…) treba zistiť pred obmedzením `update`.

## 7. Stav po etape E1 (2026-11-15) — zabezpečenie

Migrácia `supabase/migrations/20261115_01_training_security.sql` (rovnaký text je na konci `schema.sql`). Rastový vzorec, prah 12, intenzity ani dizajn sa nezmenili: telo starej `process_training_plan` je presunuté doslovne do internej funkcie.

| Zistenie z §4 | Stav po E1 |
|---|---|
| Priame INSERT/UPDATE/DELETE do `training_plans` | **Opravené** — klient má len SELECT; zápis iba `save_my_training_plan()` (hráč z auth, sezóna a týždeň zo SQL kalendára, validácia typ/zameranie/intenzita) |
| Vynútenie okamžitého spracovania cudzím `season_id` | **Opravené** — `training_plan_is_due()` v SQL, spracovanie iba skončeného týždňa; neplatné/cudzie/budúce `season_id` nikdy nie je „due“ |
| `process_training_plan` volateľná klientom | **Opravené** — funkcia zrušená; `apply_training_plan_internal` nemá žiadny klientsky grant; verejné je iba `process_my_due_training()` (bez parametrov, len vlastný jazdec) |
| Opakované/súbežné spracovanie, `applied_at = null` cez klienta | **Opravené a otestované** (8 súbežných volaní = 1 spracovanie; UPDATE zamietnutý) |
| Priamy zápis do `riders` (atribúty, kondícia, potenciál, vek, vlastník) | **Opravené** — žiadny klientsky INSERT/UPDATE/DELETE; štartovací jazdec cez `create_my_starter_rider()`, AI cez admin-only `admin_generate_ai_riders()` |
| Skryté hodnoty (potenciál, trénovateľnosť, profesionalita, regenerácia) čitateľné cez API | **Opravené** — klient číta iba verejné stĺpce; hráč dostane 1–5 odhady z `my_rider_estimates()`. Vlastné aj AI jazdci. `rider_training_progress` zatvorená |
| `anon` rola | Odobrané všetky práva na dotknuté tabuľky |

Zostáva (pozri aj DECISIONS O-008, O-010, O-011): `market_riders` ukazuje skryté hodnoty dostupných jazdcov; `bike_condition` a `tour_registrations` majú stále priame zápisy vlastníka; štartovací jazdec sa generuje v aplikácii (DB overuje len rozsahy); spracovanie je stále lenivé (cron = etapa E3); nespracovaný plán sa dá prepísať (D11).

## 8. Stav po schválení pravidiel (2026-11-15, migrácia 20261115_02)

Rozhodnutia z §5.5, ktoré majiteľ medzitým zodpovedal: **D2** (bez plánu žiadne prírastky), **D3** (plánuje sa na nasledujúci týždeň, 1. týždeň prípravný, v 10. sa neplánuje), **D5** (v týždni Touru sa netrénuje, konflikt kontrolovaný v oboch smeroch), **D11** (potvrdený plán je konečný), **D6** (Regenerácia je vrodená, nemenná, netrénuje sa; koeficienty neschválené). **D1** čiastočne (nová regenerácia príde v ďalšom bloku). Ostatné (D4, D7, D8 mechanizmus pozadia, D9, D10, D12, D13, D14) zostávajú **neschválené**. Denný tréning bez prihlásenia (schválený návrh) vyžaduje serverový plánovač — voľba mechanizmu (D8) ešte čaká.

Implementované: pravidlá 1–5 a 6–11 z C-039 v databáze + UI (zamknutý plán, vysvetlenie v 10. týždni a pri konflikte s Tour). Nové: tabuľka `tour_schedule` (zrkadlo `data/tourSchedule.ts`), `training_plannable_week()`, spoločný zámok jazdca pre plán a registráciu na Tour. Historické plány sa nemenia ani nespracúvajú spätne; plány z minulosti mimo nových pravidiel (napr. v týždni Touru) ostávajú, ako boli.
