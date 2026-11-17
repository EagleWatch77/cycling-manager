# Audit a kalibračné testy OVR a rozvoja jazdcov

Stav: **iba audit + experimentálne simulácie. Produkčný kód, DB ani herné pravidlá sa nezmenili.** Nič z návrhov nie je implementované ani schválené. Audit je robený nad `origin/main` (lokálna kópia je o 27 commitov pozadu). Reprodukcia: `apps/web/src/lib/training/sim/career2/` (`ovr.cli.ts`, `career2.cli.ts [sweep|main|mult]`), seed 20261116, výstupy `docs/audit-ovr-career/*.json`.

Značenie: **PROD** = správanie v kóde/DB, **EXP** = experimentálne pravidlo použité len v simulácii, **ASSUMPTION** = predpoklad bez podkladu v kóde.

## 1. Čo naozaj funguje v kóde (PROD)

| # | Otázka | Zistenie | Zdroj |
|---|---|---|---|
| 1 | Maximá 19 atribútov | Výkon (7) max 200 (`PERFORMANCE_MAX`); ostatných 12 (Taktika 5, Technika 6, Skúsenosti 1) max **160** | `lib/rider/config.ts` (`ATTR_MAX`), SQL `attribute_clamp_max` (schema.sql ~1014) |
| 2 | Zvyšky limitu 160 | Áno: config aj SQL clamp pre taktiku/techniku/skúsenosti; skryté vlastnosti len 4 a v rozsahu 55–95 (validácia ~2728), nie 5 × 1–100 | rovnaké súbory |
| 3 | Rast výkonu | Týždenný plán (ľahký/normálny/ťažký = 1/2/3 tréningy), `raw = 3 × tréningy × trainability × professionalism × vek × zázemie × kondícia × developmentRoom`; akumulátor prah 12, vedľajší atribút 35 %; `developmentRoom = max(0,05, lokálny × potenciál)`, pri 200 nulový | `lib/training/config.ts`, `growth.ts`, `accumulator.ts`, SQL `process_training_plan` (1257) |
| 4 | Rast taktiky | **Neexistuje žiadny mechanizmus** | – |
| 5 | Rast techniky | Len technický plán (1 tréning, +1 bod/plán, strop); bez developmentRoom; prakticky zanedbateľný | `growth.ts` |
| 6 | Rast skúseností | **Neexistuje žiadny mechanizmus** (ani z pretekov) | – |
| 7 | Tour-y a etapy | `MAX_SEASON_TOURS = 3` vo všetkých ligách; viditeľné etapy rookie 3 / amateur 4 / continental,pro,elite 5 (O-026 uvádza 3/4/4/4/5); Elite 4×5 v kóde nie je. Sezóna = 10 týždňov, Tour týždne 2, 5, 7 (9) | `lib/leagues.ts`, `data/tourSchedule.ts`, `lib/calendar/season.ts` |
| 8 | MS | Implementované je len `league_ms_status`, konfig `WORLD_CHAMPIONSHIP.eventWeek` a UI info; **žiadna simulácia MS**. Pravidlo C-015: raz za sezónu, týždeň 6 (zadanie: každú druhú sezónu) | `lib/rankings/config.ts`, DECISIONS C-015 |
| 9 | OVR v simulácii/postupe | OVR = `0,50·priemer7 + 0,25·priemer5 + 0,20·priemer6 + 0,05·skúsenosti`. Používa sa na zobrazenie a v `rider_league_eligible` (limity `league_rider_limits`, všetky NULL = neúčinné). **Nevstupuje do Race Engine ani do postupu** (počty postupu sú null) | `lib/rider/score.ts`, SQL `rider_overall_rating` (~3803), `rider_league_eligible` (~3830) |

Starý simulátor (C-046): +3,39 priemerný rast výkonu / 12 sezón, ≈+24 v trénovanom atribúte, nikto sa nepriblíži k V 190.

## 2. Pravidlá v konflikte s návrhom

1. Strop 160 pre taktiku/techniku/skúsenosti (config + SQL) vs. zadané 200.
2. Skryté vlastnosti: 4 × 55–95 vs. 5 × 1–100.
3. MS každú sezónu (C-015) vs. každú druhú; v kóde nie je implementované.
4. Elite 4 Tour-y × 5 etáp neexistuje (3 Tour-y všade); počty etáp 3/4/5/5/5 vs. 3/4/4/4/5 (O-026).
5. Taktika a skúsenosti nemajú rast, technika prakticky nerastie – ciele zadania sa nedajú splniť bez nových mechanizmov.
6. OVR sa používa v `rider_league_eligible` (dnes bez efektu) – pri zmene vzorca treba rozhodnúť, či to zostane.
7. Štartéri v produkcii 18–22 rokov, simulácia od 17.
8. Produkčná populácia je plochá (~130 vo všetkom), nie špecialisti; nový OVR to nevie ocenať, kým štartovné profily nie sú diferencované.

## 3. OVR: starý vs. nový vzorec (10 000 profilov, ASSUMPTION: syntetická populácia 100–200, 6 typov, špecializácia 12–40 b.)

| Vzorec | medián | p90 | p99 | max | OVR ≥180 / 185 / 190 / 195 |
|---|---|---|---|---|---|
| Starý | 141 | 171 | 186 | 193 | 403 / 142 / 25 / 0 |
| Nový | 148 | 179 | 192 | 198 | 966 / 549 / 206 / 27 |
| V | 150 | 184 | 196 | 200 | V ≥185 / 188 / 190: 924 / 649 / 468 |

Po typoch (nový OVR, medián / p99): Vrchár 148/192, Šprintér 148/191, Časovkár 148/190, Univerzál 143/192, Puncheur 151/193, Rovinár 150/191. OVR ≥190 – Vrchár 42, Šprintér 35, Časovkár 18, Univerzál 48, Puncheur 40, Rovinár 23 (starý vzorec: 2/2/1/15/3/2).

**Penalizuje nový vzorec špecialistov?** Nie – naopak. Pri rovnakom priemere výkonu (±1) má špecialista v novom vzorci o ~4,4–4,6 b. viac než univerzál (starý: −0,4 až −0,6). Top 1 % starého vzorca bolo z 39 % univerzálov, v novom 27 %. Riziko je opačné: vzorec zvýhodňuje špecialistov a posúva celé rozdelenie hore (medián +7), takže prah 190 už nie je „vzácny" (2 % populácie). Kontrolný príklad V190/T170/Te175/S200 → 187 potvrdený.

## 4. Vývoj atribútov (kariéra 17→35, 10 000 jazdcov, štandardná dráha, 3 Tour-y; medián)

Populácia = produkčné štartéri (plochý profil ~130), tréning PROD, všetko ostatné EXP (expK 7, tactK 4, strop 200, MS každú druhú sezónu, kalibrácia nižšie).

| Vek | Výkon ø7 | V | Taktika ø5 / najlepší | Technika ø6 | Skúsenosti | OVR starý | OVR nový |
|---|---|---|---|---|---|---|---|
| 20 | 130,9 | 134,0 | 133,8 / 141 | 130,2 | 147 | 132 | 137 |
| 25 | 131,7 | 135,7 | 141,6 / 151 | 130,2 | 184 | 137 | 145 |
| 28 | 132,3 | 136,5 | 146,0 / 156 | 130,3 | 197 | 139 | 149 |
| 30 | 132,6 | 137,0 | 148,4 / 160 | 130,3 | 199 | 139 | 150 |
| 32 | 132,9 | 137,4 | 151,2 / 163 | 130,5 | 200 | 140 | 151 |
| 35 | 133,0 | 137,8 | 154,0 / 167 | 130,5 | 200 | 141 | 152 |

PROD (bez EXP pravidiel): taktika, technika aj skúsenosti ostanú na 130; OVR starý 132 vo veku 30.

## 5. Kedy jazdci dosiahnu skúsenosti 200 (EXP)

Koeficient skúseností (7 surových bodov na etapu, vyhladenie pri strope) kalibrovaný tak, aby aktívni jazdci dosiahli 200 okolo 30–33 rokov (citlivosť: koef. 6 → medián 33, 8 → medián 30):

| Scenár | Medián veku 200 | Podiel dosiahnutých do 35 | Do 30 / 32 |
|---|---|---|---|
| štandard (3 Tour-y, 5 etáp) | 31 | 100 % | 42 % / 99 % |
| rýchly postup | 30 | 100 % | 87 % / 100 % |
| pomalý postup | 32 | 100 % | 13 % / 81 % |
| O-026 etapy 3/4/4/4/5 | 31 | 100 % | 16 % / 91 % |
| len Rookie (9 etáp/sezónu) | 34 | **28 %** | 0 % / 2 % |

Pozn.: aktivita = ~13,6 etáp/sezónu. Žiadny vekový zákaz; rast len z odjazdených pretekov.

## 6. Koľko dosiahne V 190 a OVR 190

**V ≥ 185: 0, V ≥ 190: 0, OVR nový ≥190: 0** vo všetkých scenároch a vekoch (max V ≈ 155, max OVR nový ≈ 166). Aj keď sa produkčný tréning EXP zvýši ×3, ×5, ×8, ×12, V p99 vo veku 30 dosiahne len 154 / 159 / 163 / 166 (max 169) – V 190 je štrukturálne nedosiahnuteľné: rastie jediný trénovaný atribút (+35 % vedľajší), `developmentRoom` rast brzdí, a štartovný priemer je 130. Starý OVR ≥190: 0.

Dôsledok: „V nad 190 je veľmi vzácne" platí triviálne (je nemožné); na zmysluplnú elitu 180–195 treba (a) vyššie štartovné/talentované profily, (b) rast viacerých atribútov, alebo (c) iný vzorec rozsahu. Taktika sa v simulácii vyvíja podľa typu jazdca (EXP): najlepšia taktika 160 vo veku 30, ø5 = 148, nerovnomerne (nie rovnaký prírastok, nie náhodný dominantný atribút).

Technika: pri existujúcom technickom tréningu (1,7 týždňa/sezónu pri stratégii výkon+technika) rastie 130,2 → 130,5 za 18 rokov – **hráč nevie cielene rozvinúť 1–2 techniky** bez zmeny mechaniky (viď 8).

## 7. Príklady (štandardná dráha, vek 17 → 30 → 35; V / OVR starý / OVR nový)

Medián typu (typ určený podľa dominantného výkonu pri štarte):
- Vrchár: V 134→138→139; OVR nový 134→151→153; skúsenosti 130→199→200; najlepšia taktika 137→161→170.
- Šprintér: V 134→138→139; OVR nový 134→151→153; taktika 137→163→172.
- Univerzál: V 131→136→137; OVR nový 133→149→150.
Top 5 % typu (vek 30): Vrchár V 145 / nový OVR 158 (talent: potenciál 73); Šprintér V 147 / 158; Puncheur V 145 / 158 (najlepšia taktika 181); Univerzál V 148 / 156. Takmer celý rast OVR pochádza z taktiky a skúseností (EXP), nie z výkonu.

## 8. Odporúčané úpravy a dopady (návrh, nič neimplementované)

1. **Rast skúseností** z odjazdených etáp (EXP koef. ≈7/etapu → 200 medzi 30–33). Dopad: OVR +~8 b. aj bez rastu výkonu; hráči len v Rookie dosiahnu 200 až po 34 (28 %).
2. **Rast taktiky** podľa typu/zamerania/situácie (EXP). Dopad: taktika ø +18 do 30 rokov; vyžaduje pravidlá a UI voľby.
3. **Technika:** zvýšiť TECHNICAL_BASE alebo povoliť 2 technické tréningy/týždeň a cielený výber atribútu; bez toho je rast ~0.
4. **Výkon / V 190:** zmeniť developmentRoom alebo rast viacerých atribútov, prípadne diferencované štartovné profily; inak V 190 nikdy nenastane.
5. **Nový vzorec OVR:** zvýhodňuje špecialistov (+4,5 b.) a zvyšuje medián +7; ak má byť 190 „vzácne", posunúť škálu alebo použiť menšiu váhu najlepšej taktiky/techniky.
6. **Strop 160 → 200** (config + SQL), skryté vlastnosti 5 × 1–100 (+ migrácia), MS biennale, Elite 4×5 – čakajú na schválenie; MS nie je implementované, tak sa v simulácii len predpokladá účasť všetkých (EXP).
7. Rozhodnúť osud `rider_league_eligible` (OVR v limitoch).

## Limity simulácie (poctivo)

- Týždenné rozlíšenie, konštantná efektívnosť kondície rho = 0,8 (kalibrácia: staré +3,39, nové +3,37 pri veku 20; pre vek 18 +3,64).
- Dráha medzi ligami, štart v Rookie, počty sezón (std: 2/3/4/4) = ASSUMPTION; OVR nehýbe postupom.
- Zníženie s vekom (variant „decline", −1/−2/−3 od 31/34/37) je EXP; výsledok: výkon vo veku 35 ≈ 133 (bez poklesu 135).
- Silný výskumný záver závisí od plochého štartu (ø130); pri talentovanejších štartoch sa V posunie, ale rastom len +3–6.
- Vyššie hodnoty tréningu (×3–×12) sú len citlivostná skúška, nie návrh.
