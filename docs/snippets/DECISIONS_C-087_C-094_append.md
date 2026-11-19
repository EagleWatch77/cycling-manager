## C-087 – Princíp individuality jazdcov – SCHVÁLENÉ (majiteľ 2026-11-19)
- Každý jazdec je jedinečný kombináciou vlastností, ale niektorí si môžu byť veľmi podobní.
- Regenerácia = vrodená Regenerácia (1–100, základná rýchlosť) × jemný individuálny koeficient 0,90–1,10 (C-084). Nepridávajú sa nové vrodené vlastnosti ani nové koeficienty okrem koeficientu rastu Skúseností (C-092).

## C-088 – Hráč, kontrakt, aktivita – SCHVÁLENÉ pravidlá (2026-11-19), detaily otvorené
- Jeden hráč ovláda jedného jazdca. Kontrakt s jazdcom trvá najviac jednu sezónu; po jeho skončení jazdec odchádza. Hráč, ktorý sa vráti po viacerých sezónach, si najprv kúpi nového jazdca (pôvodný mu nezostáva).
- Hráč, ktorý sa prihlási aspoň raz počas sezóny a má platný kontrakt, sa môže automaticky zúčastňovať Tour sezóny. Bez prihlásenia dokončí jazdec aktuálnu sezónu, ďalšiu bez nového kontraktu nepreteká. Hráč bez jazdca zostáva v tabuľke bez pretekových bodov.
- Vo vyšších ligách môže neaktívny hráč postupne zostupovať (až do Rookie) podľa pravidiel zostupu, ktoré ešte NEEXISTUJÚ (C-025). Rookie je základná liga. Po sezóne sa Rookie skupiny prerozdeľujú podľa aktívnych hráčov; presné pravidlá kapacity a návratu neaktívnych sú otvorené.
- Otvorené: či automatická účasť nahrádza ručný výber Tour (C-026), definícia aktívneho hráča (P-005), rozsah prerozdeľovania mimo Rookie.

## C-089 – Stratégia na Tour – SCHVÁLENÉ pravidlá, NEIMPLEMENTOVANÉ
- Hráč nastaví stratégiu na celú Tour pred uzávierkou; po nej sa nemení. Bez nastavenia platí neutrálna predvolená stratégia (~50 %, 5/10). Jazdec reaguje automaticky na profil etapy, energiu, únavu a situáciu. Morálka za splnenie cieľov sa vyhodnotí až po celej Tour.
- Otvorené: stupnice taktiky, ciele (vrchárska, bodovacia, celkové poradie, mladí), vzťah cieľov a taktiky, zmeny morálky, správanie predvolenej stratégie.

## C-090 – Kontrakty a prestupy – SCHVÁLENÝ KONCEPT, NEIMPLEMENTOVANÉ (nahrádza dĺžku 10 týždňov z C-050/C-052 a prednostné právo z C-040)
- Dĺžka 2–10 herných týždňov, volí hráč pri kúpe, môže prechádzať cez sezónu. Kratší kontrakt = exponenciálne vyšší týždenný plat (2 týždne veľmi drahé); dlhší = nižší plat a vyššie výkonnostné prémie (výsledky, ligové body, vrchárska a bodovacia súťaž). Presný vzorec NIE JE schválený.
- Predĺženie: min. +15 % týždenného platu. Pod 170/200 Skúseností má súčasný manažér garantované predĺženie pri splnení podmienok; od 170/200 môžu pred koncom kontraktu ponúkať aj iní manažéri (nesmú prerušiť platný kontrakt). Hodnotenie ponúk: plat 60 %, očakávané prémie 15 % (podľa reálnej dosiahnuteľnosti), dĺžka 15 %, prestíž ligy 10 %. Pri rovnosti vyhráva súčasný manažér. Jeden hráč = jeden aktívny jazdec.
- Otvorené: výpočet prémií, termín ponúk, predaj počas kontraktu, finančné krytie, kto stráca jazdca pri víťaznej ponuke.

## C-091 – Skúsenosti – SCHVÁLENÉ (2026-11-19)
- Škála 1–200. Jazdci 17–20 rokov začínajú najviac s 20/200. Skúsenosti rastú výhradne pretekaním (nie vekom ani tréningom); cieľ: veľmi aktívni jazdci ~200/200 okolo tridsiatky. Každý jazdec má trvalý skrytý koeficient rastu Skúseností (malé rozdiely, zostáva pri prestupe, hráč ho nevidí, admin ho vidí v Supabase). Prírastky a kariérna krivka starších jazdcov NIE SÚ schválené.

## C-092 – Trh a odchod jazdcov z trhu – SCHVÁLENÉ (2026-11-19)
- Voľní jazdci sú na trhu stále. Hráč bez jazdca môže kúpiť nového. Do už začatej Tour sa jazdec spätne nepridáva.
- A) Jazdec, ktorého nikdy nevlastnil manažér: zostáva na trhu, kým ho niekto nekúpi; ak dosiahne 21 rokov nekúpený, ukončí kariéru.
- B) Jazdec, ktorý už mal manažéra a vrátil sa na trh: najviac 4 sezóny (40 herných týždňov od návratu); ak ho niekto kúpi, pokračuje, inak ukončí kariéru (platí aj pre starších, napr. 25-ročného po predaji).
- Automatické odchody do dôchodku zatiaľ NEIMPLEMENTOVANÉ (existuje len neaktívna `purge_unsold_young_market_riders`, C-050).

## C-093 – Nový štart trhu a škála 1–200 – SCHVÁLENÉ (2026-11-19)
- Škála atribútov je 1–200 (nie 100–160). OVR F4 sa nemení. Odstráni sa pôvodných 45 testovacích jazdcov z trhu (staré OVR ~130, generátor `starter-v1`) bezpečným skriptom po presnej identifikácii; nemažú sa vlastnení, rezervovaní ani prepojení jazdci.
- Vytvorí sa presne 100 nových voľných jazdcov (vrstva `free`): vek 17–20, Skúsenosti 1–20, skutočné OVR F4 69–75 (nie prepísané), sedem špecializácií, rozmanité atribúty, potenciál a skryté vlastnosti, opakovateľný skript bez duplicít. Nový štartovný generátor pre manažérov musí byť zlučiteľný s Rookie limitom OVR 75.
- Radar: Skúsenosti a všetky atribúty zobrazujú celý rozsah 1–200 (20/200 ≈ 10 % osi, 100/200 ≈ polovica, 200/200 maximum).
- Potenciál (rozhodnutie majiteľa 2026-11-19): škála 1–100, pásma 1–39 = 35 %, 40–59 = 45 %, 60–74 = 14 %, 75–87 = 4,5 %, 88–94 = 1,2 %, 95–100 = 0,3 %; generovanie je pravdepodobnostné (žiadne povinné počty; vzácny talent sa medzi prvými 100 nemusí objaviť). Hviezdičky Potenciálu sa prispôsobujú pásmam: 1–39 = 1★, 40–59 = 2★, 60–74 = 3★, 75–87 = 4★, 88–100 = 5★ (SQL `potential_to_stars`, TS `potentialStarsOf`). Ostatné skryté vlastnosti zostávajú N(50;20) na 1–100. Kontrola oproti cieľom C-053 (sim `careerBands.cli.ts`, 10 000 kariér, dobrý manažér, strop 80+125·(Pot/100)²): kariérne maximum OVR ≥160 dosiahne 5,2 % (cieľ ~10 %; pri N(50;20) je to 10,1 %), ≥180 0,1 %, ≥200 0 %. KONFLIKT, riešenie čaká na schválenie (percentá sa nemenia): strop 80+150·(Pot/100)² (kandidát C: 9,5 % ≥160, 0,7 % ≥180) – zmena konštanty `c_cap_slope` v SQL V2 a `capSlope` v TS.

## C-094 – Skryté hodnoty trhu (O-011) – SCHVÁLENÝ PRINCÍP, migrácia pripravená
- Hráčom sa sprístupnia len verejné stĺpce trhu a hviezdičky potenciálu (`potential_stars`); skryté hodnoty a koeficienty nie. Admin ich vidí v Supabase a cez kontrolovanú funkciu. Nasadenie rozdelené na časť A (pridanie stĺpca + admin funkcia), nasadenie kódu, časť B (odobratie čítania skrytých stĺpcov).

- Kandidát stropu rozvoja (výber majiteľa 2026-11-19, NASADENIE NESCHVÁLENÉ): `80 + 150 × (Potenciál/100)²`. Overené (`softcap200.test.ts`, `careerBands.cli.ts`): tvrdé maximum atribútu 200 platí aj pri strope > 200 (Pot ≥ 90); mäkký strop pod 200 funguje ako doteraz (mierny presah ~+15 po celej kariére); jazdec začínajúci nad svojím stropom neklesá, len prestane rásť. Kariéra (3 seedy × 10 000, dobrý manažér, rast Skúseností/Taktiky ×1,5): max-OVR ≥160 9,4–9,5 %, ≥170 3,1–3,3 %, ≥180 0,7–0,8 %, ≥190 0,00–0,03 %, ≥200 0 % (najvyššie 191). Pri rýchlosti rastu ×1,0 (neschválené parametre): ≥160 7,3–7,4 %.
- ZASTARANÉ: cieľ C-053 „~1 % jazdcov nad OVR 200“ (maximum OVR je 200, nad 200 sa nedá; model ho nikdy nesplnil). Návrh nového cieľa pre špičku (NESCHVÁLENÉ): kariérne maximum OVR ≥180 u ~0,5–1 % jazdcov, ≥190 u ~0,02–0,05 % (rádovo 1 z 2 000–5 000), OVR 200 len ako teoretický strop (všetky atribúty 200), nie ako cieľ.
- Trvalý Trh (SCHVÁLENÉ 2026-11-19): hráčsky Trh zobrazuje všetkých `available` jazdcov bez ohľadu na `season_id` (zostáva ako história); tier, RLS, rezervácie, nákupy a výmeny nezmenené; admin vidí celý trh (`admin_market_riders(season default null)`); reset zostáva obmedzený na jednu sezónu a nikdy nezmaže získaných/rezervovaných; automatický odchod do dôchodku NIE JE implementovaný (C-092 zostáva len pravidlo).
- Nízky Potenciál (analýza, NASADENIE NESCHVÁLENÉ): pri strope 80+150·P² a pásmach má 68 % výkonnostných atribútov jazdcov s P 1–39 štart nad stropom; V (priemer 7 výkonnostných atribútov) slabého jazdca rastie 80 → 83 (21 r.) → 85 (30 r.). Odporúčaná najmenšia úprava (O5): „mladícka podlaha rastu“ – fyzický priestor `room = max(room, 0,30)` do 21 r., lineárne na 0 do 26 r.; slabý 80 → 88 → 93, priemerný/dobrý/elitný prakticky nezmenení, podiel max-OVR ≥160 nezmenený (7,3 % pri ×1,0; 9,5 % pri ×1,5). Výsledky pri ×1,0 a ×1,5 sa uvádzajú oddelene, ×1,5 je neschválený predpoklad. Sim: `careerOptions.cli.ts`.


## C-095 — Working model S1 + O5 for rider development (owner 2026-11-19; WORKING balance, not final)
- S1: soft cap of performance attributes = `80 + 150 × (Potenciál/100)²` (was `80 + 125 × …`). O5: youth floor of the PHYSICAL room factor = 0.30 up to age 21, linearly to 0 at age 26; a rider with naturally more room uses his normal value; hard maximum of every attribute stays 200; technique rooms untouched. O5b rejected.
- Potential bands stay 35 / 45 / 14 / 4,5 / 1,2 / 0,3 %. The ×1,5 growth of Experience/Tactics stays EXPERIMENTAL and UNAPPROVED. "~10 % of riders reach OVR 160+" stays orientational; goals for 180+/190+ remain proposals.
- Implementation: TypeScript `development/config.ts` + `core.ts` (`youthRoomFloor`, `roomPhys(…, age)`); SQL `20261119_04_dev_cap_s1_youth_floor_o5.sql` (`dev_phys_room`). Parity: `supabase/tests/development_v2.test.sh` (end-to-end weeks + 594-point room grid), tests `youthRoom.test.ts`, `softcap200.test.ts`.

## C-096 — Meaning of `market_riders.season_id` and safety of the admin reset (verified 2026-11-19)
- `season_id` = the season in which the row was LAST placed on / refreshed on the market. It is NOT the creation season: when a rider returns to the market (swap) or at the season change, a linked row is updated to the current season. The original creation time stays in `generated_at`.
- Admin reset (`resetAvailableMarketPool(season)`) deletes only rows with `season_id = X`, `status = 'available'` and `acquired_rider_id is null` (never-owned). Returned riders (linked, `acquired_rider_id` set), reserved and acquired rows are never matched; the trigger `market_riders_link_guard` and the FK `rider_swaps.market_rider_id … restrict` are the database backstop. Test: `supabase/tests/market_reset_safety.test.sh` (49 checks).
- Consequence for the owner: the reset of the CURRENT season also removes never-owned riders placed in that season (e.g. the 100 launch riders) — use it only on purpose.


## C-097 — Old Potential range 55–95 (POTENTIAL_MIN/MAX): audit 2026-11-19, NO mechanics changed
Used by (all verified by grep):
- LIVE, new riders: `lib/rider/generate.ts` (starter rider of a manager; SQL `create_my_starter_rider` validates potential 55..95) and `generateAi.ts` (AI fillers). Such riders get Potential 55–95, i.e. never the 1–54 half of the new scale. Effect: managers' starter riders are not "weak" under S1 (cap 126–211). Belongs to the SEPARATE starter-generator task (Rookie OVR 75).
- LEGACY training model V1 (`lib/rider/score.ts` overallPotentialFactor/developmentRoomFactor, `lib/training/growth.ts`, SQL `overall_potential_factor`/`development_room_factor` with 55/40 hard-coded, called from `apply_training_plan_internal`). With the development model V2 switch ON, new plans are V2 only (`legacy_planning_closed`); V1 can still run ONLY for old unapplied plans with `plan_id is null` (check row 72 of `00_predeploy_kontrola_LEN_CITANIE.sql`; expected 0). For such a plan Potential < 55 is treated as 55 (no extra effect), so existing riders are not harmed; nothing is applied to already finished weeks.
- `lib/rider/radar.ts` `clampRange/devScale`: dead path — `getDevelopmentEstimates()` returns NO estimates, the radar shows the 1–5 stars from the database. No live effect.
- `lib/facilities/scouting.ts` already works on 1–100. Trainability/Professionalism/Recovery stars (`rider_score_to_level`, 55–95) are a separate mismatch with N(50;20) 1–100, not touched.
- Fixed now: only a warning comment on the constants (no behaviour change). Everything else is a separate approved task: (1) starter/AI generator on the new scale and `create_my_starter_rider` bounds, (2) retire or re-scale V1 and `development_room_factor`, (3) trait stars for Trainability/Professionalism/Recovery.

## C-098 — Old admin market generator switched off (owner 2026-11-19)
`generateMarketPool()` no longer reads or writes anything and returns `generator-disabled` (the old generator made ~OVR 130 riders). The admin button is permanently disabled. The reset confirmation and button use the exact count of rows the reset can delete (`resettableInSeason`: available, never owned, in the season). A new generator and any week-6 automatic generation need a separate approval.

## C-099 — Rollbacky mimo migrácií; kontrola po fázach; bezpečný postup pri probléme s B (owner 2026-11-19)
- `supabase/migrations/` obsahuje len migrácie, ktoré sa majú aplikovať. Manuálne rollbacky sú v `supabase/diagnostics/market_launch/manual_rollbacks/` (`SAFE_B_nudzove_zatvorenie_trhu.sql`, `ROLLBACK_B_ODOMKNE_SKRYTE_HODNOTY.sql` s poistkou, `ROLLBACK_S1O5_rozvoj.sql`). Test `predeploy_check.test.sh` a `market_launch.test.sh` strážia, že v migráciách nie je rollback súbor.
- Pri probléme s B sa skryté hodnoty neodomykajú: najprv oprava kódu/buildu, pri neistote `SAFE_B…` (úplné zatvorenie), potom B znova. Odomknutie je len vedomé rozhodnutie majiteľa (ručná úprava poistky).
- `00_predeploy_kontrola_LEN_CITANIE.sql` rozlišuje fázy 0–5 (pripravenosť, A, kód+B, S1+O5, 100 jazdcov, čistenie 45) so stavmi SPLNENÉ/ČAKÁ/CHYBA a riadkom ĎALŠÍ KROK.
