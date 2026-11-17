# Model F2 – oprava metodiky a finálne overenie tréningu (výsledky simulácie na schválenie)

Stav: **iba experimentálna simulácia v izolácii. Produkčný kód, DB, migrácie ani herné pravidlá sa nezmenili. Nič nie je schválené.**
Značenie: **PROD** = produkčný kód, **EXP** = experimentálne pravidlo/predpoklad, **VÝSLEDOK** = reálne spustený beh, **ODPORÚČANIE** = návrh.
Reprodukcia: `apps/web/src/lib/training/sim/career3/` (`modelF2.ts`, `careerF2.cli.ts`), seedy **20261116, 20261117, 20261118 × 10 000 kariér** (Rookie 17 → 35 rokov) pre hlavné varianty; ostatné testy (režimy, stratégie, spravodlivosť plánov, talenty) bežali na seede 20261116 (10 000 kariér). Rozdiely medzi seedmi v mediáne OVR sú ≤ 1 bod, v p90 a p99 ≤ 1 bod. Výstupy: `careerF2_core_*.json`, `careerF2_extra_*.json`, `careerF2_extra2_*.json`, `careerF2_extra3_*.json`.

## 0. Zhrnutie – čo je overené a čo nie

**Overené simuláciou (VÝSLEDOK):**
1. **Štartovná populácia** má pre všetky tri vzorce V OVR v rozsahu 70–80 (min 70, max 80, 100 % v rozsahu) s priemerom 75,06 / 75,06 / 75,03 (V 60/40 / 75/25 / 80/20); populácia sa pre každé V kalibruje zvlášť, takže zmena V nevytvorí silnejších Rookie jazdcov (kap. 5).
2. **Spoločný rozpočet:** s koeficientmi „na plnú kapacitu“ cPhys 1,8 a cTech 6,5 a rozdelením 80/20 sú výsledky F2 prakticky zhodné s modelom F (vek 30: medián 159, p90 172, p99 180; F1-like 159 / 172 / 180), no technika už stojí kapacitu. Tvoje surové koeficienty prenesené na plnú kapacitu bez škálovania (cPhys 1, cTech 1) dávajú medián 139 a p99 156 (nikto 170+): to je presne „tréning nechtiac zoslabne“.
3. **Rozdelenie výkon/technika (75/25, 80/20, 85/15) má na OVR vo veku 30 takmer nulový vplyv** (medián 160 / 159 / 159); mení hlavne výšku techniky (kap. 2). Bez techniky (100/0) je výsledok **horší** (medián 156 vs 160) – technika je pri 10 % váhe OVR stále výhodná; cena v čase fyzického tréningu je reálna len v mladom veku (hlavný atribút vo veku 20: 137 bez techniky vs 128 pri 80/20).
4. **Energia podľa produkčného systému** (Energy, Fatigue, readiness, tabuľka účinnosti): základný režim po Tour-e vráti kondíciu na „výbornú“ (readiness ≥ 80) za 1–3 týždne, plnohodnotný režim ju pri nízkej Regenerácii vôbec nevráti (kap. 3). **Pri produkčnej tabuľke účinnosti je ale plnohodnotný režim takmer vždy rovnako dobrý ako odporúčanie** (OVR vek 30: 159 vs 160), základný je horší o ~4 body. S „prísnejšou“ tabuľkou účinnosti (EXP, vyžaduje zmenu produkčnej tabuľky) je odporúčanie jasne lepšie než oba pevné režimy (kap. 3).
5. **Akumulátor:** produkcia už preskakuje akumuláciu pri fyzickom atribúte 200; model F ju nepreskakoval a po poklese by sa jazdec vrátil okamžite na 200 (deterministický test). Vplyv na rozdelenie OVR je zanedbateľný (identické percentily), ale chyba je reálna (kap. 4). Zistil som aj produkčné riziko u techniky (kap. 4).
6. **Špecialisti vs. univerzáli:** univerzál je pri V 60/40 výrazne znevýhodnený (medián OVR vek 30 154 vs 158–162 u špecialistov, 170+ iba 5,2 % vs 10,9–24,6 %); znevýhodnený je aj Klasikár (kap. 8).
7. **4 Tour za sezónu** zníži vrchol rozdelenia výrazne (vek 30, V 60/40: p90 168 vs 172, 170+ 8,0 % vs 16,7 %); kompenzuje to cPhys 2,0 (kap. 6).

**Stále predpoklady (EXP, nie overené dátami):** väzby plánov na techniku a tretí fyzický atribút, hodnoty záťaže Tour-u (7 energie / 8 únavy na etapu), 2 oddychové dni v týždni Tour-u, regeneračný efekt skrytej Regenerácie, „prísna“ tabuľka účinnosti, rozdelenie skrytých vlastností N(50; 20), štartovné rozdelenie atribútov, kvóty postupu medzi ligami, rast Skúseností a Taktiky z pretekov. Produkčné **Condition/Fitness/Form/Morale** sa pri tréningu nepoužívajú (kap. 3).

## 1. Plány a väzby atribútov

**Dôležité:** dokument design v3 nemám v tejto relácii k dispozícii a v repozitári sa pôvodné väzby plánov nenachádzajú. Ako „naše predtým navrhnuté väzby“ som preto použil **produkčných 7 generačných tvarov** (`lib/rider/config.ts`, `SHAPES`: climber, sprinter, timeTrial, puncheur, classics, rouleur, allrounder) a doplnil len to, čo tvary neurčujú (označené „návrh“). **Prosím potvrď, alebo pošli pôvodné väzby – simulátor ich berie z jednej tabuľky a prepočet trvá ~5 minút.** Názvy plánov podľa zadania: Vrchár, Šprintér, Časovkár, Puncheur, Klasikár, Únikár (= produkčný `rouleur`, „breakaway-specialist archetype“), Univerzál. V modeli F boli plány iné (jeden na každý fyzický atribút, napr. „Rovina“, „Akcelerácia“); F2 ich nahrádza tvojimi siedmimi plánmi.

**Produkčné tvary (PROD):** climber – strong Stúpanie, Kopce, Akcelerácia; weak Rovina, Šprint · sprinter – strong Šprint, Rovina, Akcelerácia; weak Stúpanie, Kopce · timeTrial – strong Rovina, Vytrvalosť, Manažment energie, Časovka; weak Stúpanie, Šprint · puncheur – strong Kopce, Akcelerácia, Načasovanie útoku, Reakcia; weak Rovina, Vytrvalosť · classics – strong Nerovný povrch, Jazda v balíku, Ovládanie bicykla, Pozícia, Jazda v daždi; weak Stúpanie, Šprint · rouleur – strong Rovina, Vytrvalosť, Pozícia, Schopnosť úniku; weak Stúpanie, Kopce · allrounder – strong Vytrvalosť, Pozícia, Skúsenosti.

**Použité väzby plánov (každý plán súčasne trénuje 3 fyzické + 2 technické atribúty; koeficient podľa poradia):**

| Plán | 1. fyzický (1,15) | 2. fyzický (0,95) | 3. fyzický (0,75) | 1. technika (0,85) | 2. technika (0,45) | Pôvod väzby |
|---|---|---|---|---|---|---|
| Vrchár (climber) | Stúpanie | Kopce | Akcelerácia | Zjazd | Zákruty | fyzika = strong shape `climber` (PROD); technika = návrh |
| Šprintér (sprinter) | Šprint | Rovina | Akcelerácia | Jazda v balíku | Ovládanie bicykla | fyzika = strong shape `sprinter` (PROD); technika = návrh |
| Časovkár (timeTrial) | Časovka | Rovina | Vytrvalosť | Ovládanie bicykla | Zákruty | fyzika = strong shape `timeTrial` (PROD); technika = návrh |
| Puncheur (puncheur) | Kopce | Akcelerácia | Stúpanie | Zákruty | Ovládanie bicykla | fyzika = strong hills, acceleration (PROD) + Stúpanie z mapy RELATED (návrh); technika = návrh |
| Klasikár (classics) | Rovina | Kopce | Vytrvalosť | Nerovný povrch | Jazda v balíku | technika = strong shape `classics` (PROD: roughSurface, packRiding, bikeHandling, wetHandling – použité prvé dve); fyzika = návrh (shape nemá silnú fyziku) |
| Únikár (rouleur) | Vytrvalosť | Rovina | Časovka | Zjazd | Ovládanie bicykla | fyzika = strong shape `rouleur` flat, endurance (PROD) + Časovka z RELATED (návrh); technika = návrh |
| Univerzál (allrounder) | Vytrvalosť | Rovina | Stúpanie | Jazda v balíku | Ovládanie bicykla | fyzika = strong `endurance` (PROD) + Rovina, Stúpanie (návrh); technika = návrh |

Ostatné 4 fyzické atribúty dostávajú všeobecný rast `gen` (0,35). Taktika (Pozícia, Načasovanie útoku, Reakcia, Manažment energie, Schopnosť úniku) a Skúsenosti rastú **iba z pretekov**. Technika z pretekov nerastie.

## 2. Spoločný rozpočet tréningovej kapacity

### 2.1 Vzorec (EXP)
Týždeň má kapacitu 1 (plnohodnotný) alebo 0,75 (základný; zvyšných 0,25 je regenerácia). Aktívna kapacita sa delí na výkon `sp` a techniku `1 − sp`:

`výkon_j = coef_j × cPhys × a × sp × eff × G × α(vek) × room_j`
`technika_k = coefT_k × cTech × a × (1 − sp) × eff × G × (1+α)/2 × roomT_k`

- `a` = 1,00 (plnohodnotný) / 0,75 (základný); `coef_j` = 1,15 / 0,95 / 0,75 (hlavné), 0,35 (ostatné); `coefT_k` = 0,85 / 0,45.
- `cPhys`, `cTech` = škála **na plnú kapacitu** (cPhys 1,8; cTech 6,5), takže pri 80/20 sú účinné koeficienty cPhys × 0,8 = 1,44× a cTech × 0,2 = 1,30× tvojich štartovných hodnôt (pred modifikátormi).
- `eff` = účinnosť podľa readiness (kap. 3), `G` = aditívny modifikátor skrytých vlastností (Trénovateľnosť 0,30, Profesionalita 0,15, Potenciál 0,10; pásmo 0,6–1,5), `α(vek)` = produkčný `ageFactor`, `room` = mäkký osobný strop `Cap = 130 + Potenciál` (medzera 0 / 20 / 45 / 15 podľa tvaru).
- Akumulátor: `progress += 12 × body`, atribút `+ floor(progress / 12)` (PROD prah 12); technika max +4/týždeň.

### 2.2 Účinné týždenné prírastky pred modifikátormi (pri eff = G = α = room = 1)
| Rozdelenie | Hlavný fyz. | 2. fyz. | 3. fyz. | Ostatné 4 | 1. technika | 2. technika |
|---|---|---|---|---|---|---|
| 75/25 plnohodnotný | 1,55 | 1,28 | 1,01 | 0,47 | 1,38 | 0,73 |
| 75/25 základný (×0,75) | 1,16 | 0,96 | 0,76 | 0,35 | 1,04 | 0,55 |
| 80/20 plnohodnotný | 1,66 | 1,37 | 1,08 | 0,50 | 1,10 | 0,58 |
| 80/20 základný (×0,75) | 1,24 | 1,03 | 0,81 | 0,38 | 0,83 | 0,44 |
| 85/15 plnohodnotný | 1,76 | 1,45 | 1,15 | 0,54 | 0,83 | 0,44 |
| 85/15 základný (×0,75) | 1,32 | 1,09 | 0,86 | 0,40 | 0,62 | 0,33 |
| tvoj štart (100 % výkon) | 1,15 | 0,95 | 0,75 | 0,35 | 0,85 | 0,45 |

Koeficienty na plnú kapacitu (cPhys 1,8): hlavný/2./3. fyzický 2,07 / 1,71 / 1,35, ostatné 0,63; technika (cTech 6,5) 5,53 / 2,93.

### 2.3 Výsledky (VÝSLEDOK, 3 semená, V 60/40, vek 30 a 33)
| Variant (vek 30) | Medián (3 semená: min–max) | p90 | p99 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Surové (cPhys 1, cTech 1), 80/20 | 139 (139–139) | 149 | 156 | 163 | 9,8 | 0,1 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| cPhys 2,5 / cTech 7,5, 80/20 (pôvodná škála pred prekalibrovaním na produkčnú energiu) | 166 (166–166) | 180 | 186 | 190 | 87,9 | 68,7 | 37,5 | 10,0 | 2,1 | 0,0 | 0,0 |
| Kalibrované 75/25 | 160 (159–160) | 172 | 180 | 186 | 80,3 | 50,3 | 16,7 | 1,2 | 0,0 | 0,0 | 0,0 |
| Kalibrované 80/20 | 159 (159–160) | 172 | 180 | 185 | 79,5 | 49,8 | 16,7 | 1,2 | 0,0 | 0,0 | 0,0 |
| Kalibrované 85/15 | 159 (159–159) | 172 | 179 | 185 | 77,5 | 47,3 | 15,1 | 0,8 | 0,0 | 0,0 | 0,0 |

| Variant (vek 33) | Medián (3 semená: min–max) | p90 | p99 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Surové (cPhys 1, cTech 1), 80/20 | 145 (145–145) | 154 | 162 | 169 | 28,1 | 2,1 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Kalibrované 75/25 | 165 (165–166) | 178 | 184 | 189 | 91,0 | 70,5 | 34,5 | 6,4 | 1,0 | 0,0 | 0,0 |
| Kalibrované 80/20 | 165 (165–165) | 178 | 184 | 189 | 90,3 | 69,6 | 34,3 | 6,6 | 1,0 | 0,0 | 0,0 |
| Kalibrované 85/15 | 164 (164–165) | 177 | 183 | 188 | 88,8 | 66,8 | 31,4 | 5,2 | 0,5 | 0,0 | 0,0 |

**Cena techniky v čase (seed 20261116, rovnaké cPhys 1,8; V 60/40):**

| Rozdelenie | Hlavný fyz. vek 20 / 25 / 30 | 1. technika vek 30 | OVR vek 30: medián / p90 / p99 | 170+ vek 33 (%) |
|---|---|---|---|---|
| 100/0 (bez techniky) | 137 / 173 / 179 | 70 | 156 / 169 / 176 | 19,1 |
| 80/20 | 128 / 166 / 176 | 150 | 160 / 172 / 180 | 34,4 |
| 60/40 | 119 / 153 / 169 | 187 | 157 / 168 / 176 | 23,2 |
| 50/50 | 114 / 144 / 162 | 193 | 153 / 164 / 171 | 8,9 |

**Čítanie:** pri vyššom podiele techniky rastie hlavný fyzický atribút v mladom veku pomalšie (cena v čase je reálna: vek 20 o 9 bodov pri 80/20 oproti 100/0), no do veku 30 sa rozdiel zmenší na ~3 body (176 vs 179), lebo atribúty narážajú na osobný strop. OVR pri vyšších podieloch techniky klesá až od 60/40 (a pri 50/50 výrazne), takže optimum je okolo 80/20 – **rozdiel medzi 75/25 a 85/15 je v OVR nepatrný** (cena aj prínos sa prejavia hlavne v technike a v rýchlosti rastu do 25 rokov). Nepredpokladaj preto, že podiel techniky „vyvažuje“ hru sám; ak má technika stáť viac, treba vzácnejší fyzický rozpočet alebo nižšie stropy.

## 3. Energia, únava a režimy – porovnanie F a produkcie

| Prvok | Produkcia (PROD) | Model F (C-075) | Model F2 |
|---|---|---|---|
| Energy | 0–100, štart 100; týždeň: −náklad + dni regenerácie × 5 × násobič regeneračného centra (1,05–1,20) | neexistuje (jeden stav „únava“) | PROD stav a vzorce |
| Fatigue | 0–100, štart 0; týždeň: +prírastok − dni regenerácie × 4 × násobič | jeden stav F 0–100 | PROD stav a vzorce |
| Readiness | (Energy + (100 − Fatigue)) / 2 → účinnosť 1,00 / 0,95 / 0,85 / 0,70 / 0,50 (pásma 80/60/40/20) | lineárne 1 − 0,02 × (F − 15), min 0,35, ×0,6 nad F = 80 | PROD tabuľka (a „prísna“ EXP tabuľka na porovnanie) |
| Režimy | light / normal / hard (náklady 5/10/15, únava 5/10/18, dni regenerácie 6/5/4) | plnohodnotný / základný ×0,75 s vlastnými konštantami | plnohodnotný = `hard` (15 / 18 / 4 dni), základný = `normal` (10 / 10 / 5 dní) |
| Záťaž pretekov | neexistuje (budúca udalosť „Tour recovery“) | 7 × veľkosť etapy do F | EXP: −7 Energy, +8 Fatigue × veľkosť etapy, 2 dni regenerácie v týždni Tour-u |
| Medzi sezónami | neexistuje | F × 0,25 | EXP: Energy +50, Fatigue −50 |
| Regenerácia (skrytá) | v kóde nepoužitá pri condition | 0,75–1,25 × rýchlosť zotavenia | EXP: rovnaký násobič 0,75–1,25 |
| Condition: Form, Fitness, Morale | štart 50 / 60 / 70, **pri tréningu sa nepoužívajú** | – | nemodelované (odporúčam nezavádzať do tréningu) |

**Dôležité zistenie:** v produkcii samotný tréning Energy ani Fatigue nezaťažuje (hard: Energy +5, Fatigue +2 za týždeň; normal: +15 / −10), takže bez záťaže pretekov je kondícia vždy ≈ výborná. Únava vzniká až zo záťaže Tour-ov, ktorú produkcia ešte nemá – jej hodnoty sú preto moje predpoklady.

**Základný režim po Tour-e (deterministický výpočet s produkčnými konštantami; readiness po 0 až 5 týždňoch tréningu):**

| Stav po Tour-e | Regenerácia | Režim | T0 | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|---|---|---|
| Energy 75, Fatigue 32 | 20 | plnohodnotný | 72 | 70 | 69 | 68 | 67 | 66 |
| Energy 75, Fatigue 32 | 20 | základný | 72 | 81 | 90 | 94 | 98 | 100 |
| Energy 75, Fatigue 32 | 50 | plnohodnotný | 72 | 73 | 74 | 76 | 78 | 79 |
| Energy 75, Fatigue 32 | 50 | základný | 72 | 84 | 94 | 99 | 100 | 100 |
| Energy 75, Fatigue 32 | 90 | plnohodnotný | 72 | 77 | 82 | 86 | 86 | 87 |
| Energy 75, Fatigue 32 | 90 | základný | 72 | 88 | 98 | 100 | 100 | 100 |
| Energy 50, Fatigue 60 | 20 | plnohodnotný | 45 | 44 | 43 | 41 | 40 | 39 |
| Energy 50, Fatigue 60 | 20 | základný | 45 | 54 | 63 | 72 | 82 | 88 |
| Energy 50, Fatigue 60 | 50 | plnohodnotný | 45 | 46 | 48 | 50 | 51 | 52 |
| Energy 50, Fatigue 60 | 50 | základný | 45 | 58 | 70 | 82 | 90 | 95 |
| Energy 50, Fatigue 60 | 90 | plnohodnotný | 45 | 50 | 55 | 60 | 65 | 70 |
| Energy 50, Fatigue 60 | 90 | základný | 45 | 62 | 79 | 91 | 98 | 100 |

**Návrh obnovy po Tour-e (ODPORÚČANIE, PROD konštanty):** základný režim = produkčné `normal` (Energy +15, Fatigue −10 za týždeň pri násobiči 1,0). Z typického stavu po 5-etapovom Tour-e (Energy 75, Fatigue 32; readiness 72) vráti základný režim kondíciu na ≥ 80 za 1 týždeň, zo stavu po dvoch Tour-och za sebou (45) za 3 týždne; plnohodnotný režim ju za 5 týždňov nevráti (pri Regenerácii 20 sa dokonca zhoršuje).

### 3.1 Výsledky režimov (VÝSLEDOK, seed 20261116, vek 30, V 60/40, produkčná tabuľka účinnosti)
| Režim / pravidlo | OVR medián / p90 / p99 / max | 170+ vek 33 (%) | Ø readiness | Ø readiness pred Tour-om | Podiel základných týždňov | Hlavný fyz. vek 25 |
|---|---|---|---|---|---|---|
| Vždy plnohodnotný | 159 / 172 / 179 / 185 | 33,0 | 52 | 65 | 0,00 | 165 |
| Vždy základný | 155 / 168 / 175 / 182 | 20,7 | 85 | 95 | 1,00 | 158 |
| Odporúčanie: základný ak readiness < 40 | 159 / 172 / 180 / 185 | 33,6 | 55 | 68 | 0,11 | 165 |
| Odporúčanie: základný ak < 60 | 160 / 172 / 180 / 185 | 34,4 | 66 | 78 | 0,27 | 166 |
| Odporúčanie: základný ak < 80 | 159 / 172 / 179 / 185 | 32,9 | 79 | 89 | 0,49 | 165 |
| Kalendárne: základný 2 týždne po Tour-e | 158 / 170 / 178 / 183 | 27,8 | 85 | 94 | 0,82 | 162 |
| Náhodný 50 : 50 | 158 / 171 / 179 / 184 | 30,3 | 75 | – | 0,50 | 163 |

**Citlivosť na záťaž Tour-u a Regeneráciu (OVR vek 30, medián / p90; produkčná tabuľka):**

| Scenár | Plnohodnotný | Základný | Odporúčanie (< 60) |
|---|---|---|---|
| Záťaž Tour-u ×0,6 | 162 / 176 | 155 / 169 | 163 / 177 |
| Záťaž ×1,0 (kalibrované) | 159 / 172 | 155 / 168 | 160 / 172 |
| Záťaž ×1,4 | 155 / 166 | 153 / 165 | 155 / 167 |
| Záťaž ×2,0 | 149 / 160 | 148 / 159 | 150 / 161 |
| 4 Tour + záťaž ×1,4 | 153 / 163 | 151 / 160 | 153 / 163 |
| Regenerácia 20 | 157 / 169 | 155 / 167 | 157 / 169 |
| Regenerácia 50 | 159 / 172 | 155 / 168 | 160 / 172 |
| Regenerácia 90 | 162 / 175 | 155 / 168 | 162 / 175 |

**Čítanie:** pri produkčnej tabuľke účinnosti (najnižšia účinnosť 0,50, pri readiness ≥ 60 aspoň 0,95) je plnohodnotný režim o tretinu silnejší (1,00 vs 0,75) a únava ho znižuje len málo, takže ho základný režim nepredbehne ani pri záťaži ×2 (148 vs 149); lepšie je až odporúčanie (150). Odporúčanie je v mediáne rovnaké alebo o 1 bod lepšie než plnohodnotný režim; rozhodnutie preto **nemá veľký herný význam pri produkčnej tabuľke**.

**Návrh pravidla (EXP, vyžaduje schválenie zmeny tabuľky účinnosti):** „prísnejšia“ tabuľka 1,00 / 0,90 / 0,70 / 0,45 / 0,25 pre pásma readiness 80 / 60 / 40 / 20 / < 20.

| Scenár (prísna tabuľka) | Plnohodnotný | Základný | Odporúčanie < 40 | Odporúčanie < 60 | Odporúčanie < 80 | Kalendárne (2 týždne po Tour-e) |
|---|---|---|---|---|---|---|
| Záťaž ×1,0 | 154 / 166 | 154 / 167 | 156 / 168 | 158 / 170 | 158 / 171 | 157 / 169 |
| Záťaž ×1,4 | 145 / 157 | 150 / 161 | 150 / 161 | 151 / 162 | 152 / 163 | 152 / 163 |

S prísnou tabuľkou je pri záťaži ×1,0 odporúčanie (< 60 alebo < 80) o 4 body lepšie než plnohodnotný aj základný režim; pri záťaži ×1,4 je plnohodnotný režim o 5–7 bodov horší než odporúčanie a základný o 1–2 horší. Jednoduché kalendárne pravidlo (2 týždne základného režimu po Tour-e) dosahuje takmer rovnaký výsledok (−1 bod). To je argument pre **odporúčanie typu „po Tour-e základný režim, kým kondícia nie je aspoň dobrá“**, ktoré vie hráč pochopiť z popisu stavu (výborná / dobrá / znížená / slabá / veľmi slabá) bez čísel.

**Pravidlá pre hráča (ODPORÚČANIE):**
- Systém nikdy sám nemení režim; v rozhraní zobrazí iba odporúčanie a dôvod: „Po Tour-e odporúčame základný režim, kondícia je znížená.“
- Odporúčanie = základný režim, ak je kondícia nižšia než „dobrá“ (readiness < 60) alebo pri produkčnej tabuľke < 80 pri vysokej záťaži; inak plnohodnotný. Tieto prahy som overil len v simulácii s manažérom, ktorý odporúčanie vždy dodrží.
- Ak hráč odporúčanie ignoruje (pevný plnohodnotný alebo pevný základný režim), jazdec nehrozí „trestom“ nad rámec nižšej účinnosti; **je to jeho voľba**.
- Fitness/Form/Morale zostávajú mimo tréningu.

## 4. Technické riziká

### 4.1 Akumulátor pri atribúte 200 (VÝSLEDOK, deterministický test)
Atribút na 200 trénovaný W týždňov, potom pokles o 3 body, potom 1 a 4 týždne tréningu s 0,3 bodu/týždeň:

| Týždne na 200 | Chyba (model F) – uložený progress | po 1 týždni | po 4 týždňoch | Oprava (F2) – uložený progress | po 1 týždni | po 4 týždňoch |
|---|---|---|---|---|---|---|
| 0 | 0 | +0 | +1 | 0 | +0 | +1 |
| 5 | 60 | +3 | +3 | 0 | +0 | +1 |
| 20 | 240 | +3 | +3 | 0 | +0 | +1 |
| 60 | 720 | +3 | +3 | 0 | +0 | +1 |

Bez opravy sa jazdec po poklese o 3 body vráti na 200 už po prvom tréningovom týždni (uložený progress rastie lineárne s časom na strope: 60 / 240 / 720 bodov progresu pri 5 / 20 / 60 týždňoch). S opravou (progress sa pri strope zahadzuje) sa vráti len tréningom (po 4 týždňoch +1).

**Populačný vplyv (3 semená, vek 17–35):** v modeli F (F1-like) malo pri poklese uložený progress ≥ 1 bodu 2,4 % jazdcov (Ø 0,07 bodu na jazdca, najvyšší uložený progress 45); v F2 0,0 % (najvyšší uložený progress 12,0, pod prahom 12). **Rozdelenie OVR sa tým nezmenilo** (F1-like a „F1 + oprava akumulátora“ majú rovnaké percentily) – chyba je rizikom v okrajových prípadoch, nie systematickým skreslením.

**Produkcia (čítanie kódu, nie simulácia):** `process_training_plan()` už preskakuje akumuláciu, ak je fyzický atribút ≥ 200 (`v_primary_at_cap`, schema.sql ~r. 1517, 1570). U **techniky** je však `v_primary_at_cap := false` (r. 1559) a technika má strop 160 (`attribute_clamp_max`): po dosiahnutí 160 sa progres ďalej hromadí bez limitu. Ak sa technika má rozvíjať až do 200, pravidlo „pri strope progress zahodiť“ treba doplniť aj tam. Produkcia zatiaľ nemá vekový pokles, takže návrat po poklese sa v hre ešte nedá prejaviť.

### 4.2 Koľko jazdcov dosiahne fyzický atribút 200 a v akom veku (VÝSLEDOK, F2, 3 semená)

Aspoň jeden z 7 fyzických atribútov dosiahne 200 u **14,5 (14,4–14,5) %** jazdcov (model F: 15,4 (15,3–15,4) %), v mediáne vo veku **27 (27–27)** (10 % z nich do 23 (23–24)). Kumulatívne podiely jazdcov s aspoň jedným atribútom 200 do daného veku (%): 22 r. – 0,2; 25 r. – 3,8; 28 r. – 10,3; 30 r. – 13,4; 33 r. – 14,5; 35 r. – 14,5.

Priemerný počet fyzických atribútov na 200 vo veku 30: 0,19, vo veku 35: 0,10. **Poznámka:** 200 je tvrdý strop; zhluk jazdcov na ňom skresľuje horný chvost rozdelenia (OVR 185+ vzniká práve u jazdcov s 2–3 atribútmi na 200). Ak je 14 % príliš veľa, treba znížiť `Cap = 130 + Potenciál` (napr. 120 + Potenciál) alebo zmäkčiť strop pri 190+.

## 5. Štartovná populácia a vzorec V

Populácia: 7 tvarov (produkčný `SHAPES`, rovnaká pravdepodobnosť), skryté vlastnosti N(50; 20), Skúsenosti 15–45, aktivita 50 / 75 / 100 % (15 / 25 / 60 %). Pre každé V sa úroveň μ nájde bisekciou tak, aby Ø štartového OVR bolo 75 a **každý Rookie s OVR mimo 70–80 sa zahodí** (výber zo vzorky kandidátov); navyše sa vyrovná Ø štartové OVR medzi tvarmi (inak by Klasikár a Univerzál štartovali o ~1,5 bodu slabšie).

| V | Seed | Ø OVR | Smerodajná odchýlka | Min | Max | Podiel v 70–80 | Zahodení kandidáti (%) |
|---|---|---|---|---|---|---|---|
| 60/40 | 20261116 | 75,06 | 2,93 | 70 | 80 | 100 % | 25,9 |
| 75/25 | 20261116 | 75,06 | 2,93 | 70 | 80 | 100 % | 27,1 |
| 80/20 | 20261116 | 75,03 | 2,93 | 70 | 80 | 100 % | 27,5 |
| 60/40 | 20261117 | 74,95 | 2,92 | 70 | 80 | 100 % | 25,2 |
| 75/25 | 20261117 | 74,94 | 2,93 | 70 | 80 | 100 % | 26,2 |
| 80/20 | 20261117 | 74,92 | 2,93 | 70 | 80 | 100 % | 26,7 |
| 60/40 | 20261118 | 75,04 | 2,94 | 70 | 80 | 100 % | 25,3 |
| 75/25 | 20261118 | 75,02 | 2,95 | 70 | 80 | 100 % | 26,5 |
| 80/20 | 20261118 | 75,02 | 2,96 | 70 | 80 | 100 % | 26,8 |

Ø štartové OVR podľa tvaru (seed 20261116; Vrchár, Šprintér, Časovkár, Puncheur, Klasikár, Únikár, Univerzál): V 60/40: 75,2 / 75,3 / 75,3 / 75,1 / 74,7 / 75,1 / 74,7; V 75/25: 75,2 / 75,2 / 75,3 / 75,1 / 74,7 / 75,1 / 74,7; V 80/20: 75,2 / 75,2 / 75,3 / 75,1 / 74,7 / 75,1 / 74,6.

**Porovnanie V (F2 kalibrované 80/20 split, 3 Tour; populácia zvlášť pre každé V; vek 30 a 33):**

| V (vek 30) | Medián (3 semená: min–max) | p90 | p99 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 60/40 | 159 (159–160) | 172 | 180 | 185 | 79,5 | 49,8 | 16,7 | 1,2 | 0,0 | 0,0 | 0,0 |
| 75/25 | 162 (162–162) | 175 | 183 | 189 | 83,6 | 57,7 | 24,5 | 3,9 | 0,6 | 0,0 | 0,0 |
| 80/20 | 163 (162–163) | 176 | 185 | 190 | 84,9 | 60,2 | 27,1 | 5,2 | 1,0 | 0,0 | 0,0 |

| V (vek 33) | Medián (3 semená: min–max) | p90 | p99 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 60/40 | 165 (165–165) | 178 | 184 | 189 | 90,3 | 69,6 | 34,3 | 6,6 | 1,0 | 0,0 | 0,0 |
| 75/25 | 168 (168–168) | 181 | 188 | 192 | 92,5 | 75,3 | 43,6 | 12,9 | 4,0 | 0,3 | 0,0 |
| 80/20 | 169 (168–169) | 182 | 189 | 193 | 93,1 | 76,9 | 46,6 | 15,4 | 5,6 | 0,7 | 0,0 |

Kariérne maximum OVR (percento jazdcov, 3 semená):

| V | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 | Max |
|---|---|---|---|---|---|---|
| 60/40 | 37,79 | 8,23 | 1,56 | 0,01 | 0,00 | 190 |
| 75/25 | 47,25 | 15,25 | 5,33 | 0,60 | 0,00 | 193 |
| 80/20 | 50,09 | 18,02 | 7,23 | 1,30 | 0,00 | 194 |

**Čítanie:** bez zmeny štartovej populácie by prechod na 75/25 alebo 80/20 zvýšil štartové OVR (top 3 > priemer 7); tu je Ø štartu pre všetky V 75 ± 0,05. Pri V 75/25 dosiahne 190+ **0,60 %** kariér (60/40: 0,01 %), pri 80/20 1,30 %; vo veku 30 má 170+ 24,5 % (75/25), resp. 27,1 % (80/20) oproti 16,7 % (60/40). Dôležité: zmena V nie je neutrálna pre výber špecialistov a univerzálov (kap. 8).

## 6. F1 vs. F2, 3 vs. 4 Tour, rozdelenie OVR, atribúty, Elite

### 6.1 Model F1 vs. F2 a rozklad rozdielu (vek 30 a 33, V 60/40, 3 semená, rovnaká populácia F2)

| Variant (vek 30) | Medián (3 semená: min–max) | p90 | p99 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1-like (budova zadarmo, energia F, chyba akumulátora) | 159 (159–159) | 172 | 180 | 185 | 78,0 | 47,9 | 15,9 | 1,1 | 0,0 | 0,0 | 0,0 |
| F1 + spoločný rozpočet (80/20, abs. prírastky ako F) | 159 (159–159) | 172 | 180 | 185 | 78,0 | 47,9 | 15,9 | 1,1 | 0,0 | 0,0 | 0,0 |
| F1 + produkčná energia | 166 (166–166) | 180 | 186 | 190 | 87,9 | 68,7 | 37,5 | 10,0 | 2,1 | 0,0 | 0,0 |
| F1 + oprava akumulátora | 159 (159–159) | 172 | 180 | 185 | 78,0 | 47,9 | 15,9 | 1,1 | 0,0 | 0,0 | 0,0 |
| F2 so škálou F1 (cPhys 2,5 / cTech 7,5) | 166 (166–166) | 180 | 186 | 190 | 87,9 | 68,7 | 37,5 | 10,0 | 2,1 | 0,0 | 0,0 |
| **F2 kalibrované (cPhys 1,8 / cTech 6,5)** | 159 (159–160) | 172 | 180 | 185 | 79,5 | 49,8 | 16,7 | 1,2 | 0,0 | 0,0 | 0,0 |

**Čítanie:** (1) „F1 + spoločný rozpočet“ je pri rovnakých absolútnych prírastkoch identické s F1 – spoločný rozpočet nemení výsledok, kým sa nezmení rozdelenie (kap. 2.3); (2) oprava akumulátora nemení percentily; (3) **jediná zmena, ktorá posúva rozdelenie, je produkčná energia** (vek 30: medián +7, p90 +8) – produkčná tabuľka účinnosti je oveľa miernejšia než energetický model F (Ø účinnosť 0,92 vs 0,72), preto treba rast prekalibrovať (cPhys 2,5 → 1,8) – výsledok F2 potom opäť zodpovedá cieľom.

### 6.2 3 vs. 4 Tour za sezónu (4. Tour = týždeň 9, ubudne 1 z ~6 tréningových týždňov)

| Variant (vek 30) | Medián (3 semená: min–max) | p90 | p99 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 Tour, 80/20 | 159 (159–160) | 172 | 180 | 185 | 79,5 | 49,8 | 16,7 | 1,2 | 0,0 | 0,0 | 0,0 |
| 4 Tour, 80/20 | 158 (158–158) | 168 | 177 | 184 | 81,4 | 42,4 | 8,0 | 0,4 | 0,0 | 0,0 | 0,0 |
| 4 Tour, 75/25 | 158 (158–158) | 168 | 177 | 184 | 81,8 | 41,9 | 7,6 | 0,4 | 0,0 | 0,0 | 0,0 |
| 4 Tour, 85/15 | 158 (158–158) | 168 | 177 | 184 | 80,3 | 41,6 | 7,6 | 0,2 | 0,0 | 0,0 | 0,0 |
| V 75/25, 3 Tour | 162 (162–162) | 175 | 183 | 189 | 83,6 | 57,7 | 24,5 | 3,9 | 0,6 | 0,0 | 0,0 |
| V 75/25, 4 Tour | 160 (160–160) | 171 | 181 | 187 | 86,0 | 53,2 | 14,2 | 1,4 | 0,2 | 0,0 | 0,0 |
| V 80/20, 4 Tour | 161 (161–161) | 172 | 182 | 189 | 87,2 | 56,2 | 16,9 | 1,9 | 0,3 | 0,0 | 0,0 |

Kompenzácia vyššou škálou (seed 20261116, vek 30; medián / p90 / p99 / max; 170+ vek 30 / 33; 190+ kariérne max):

| Variant | OVR vek 30 | 170+ vek 30 / 33 (%) | 190+ (%) |
|---|---|---|---|
| 3 Tour, cPhys 1,8 (V 60/40) | 160 / 172 / 180 / 185 | 16,7 / 34,4 | 0,02 |
| 4 Tour, cPhys 1,8 | 158 / 169 / 177 / 184 | 8,1 / 19,7 | 0,00 |
| 4 Tour, **cPhys 2,0** | 160 / 171 / 179 / 186 | 13,7 / 28,1 | 0,03 |
| 4 Tour, cPhys 2,2 | 162 / 173 / 181 / 187 | 21,0 / 35,7 | 0,08 |
| V 75/25, 4 Tour, cPhys 1,8 | 160 / 171 / 181 / 187 | 14,3 / 29,5 | 0,25 |
| V 75/25, 4 Tour, **cPhys 2,0** | 163 / 174 / 183 / 189 | 22,9 / 38,6 | 0,59 |

**Čítanie:** 4. Tour spôsobí pokles p90 o ~3 body a prepolovenie podielu 170+ vo veku 30; vplyv je väčší na vrchol (p90 −3 až −4) než na medián (−1 až −2). Pri 4 Tour-och treba cPhys zvýšiť na ~2,0 (+11 %), čím sa rozdelenie vráti na úroveň 3 Tour-ov. Pri 4 Tour-och je zároveň viac zaťaženia (kap. 3, riadok „4 Tour + záťaž ×1,4“), takže odporúčanie režimu má väčší význam.

### 6.3 Rozdelenie OVR podľa veku (F2 kalibrované 80/20, 3 Tour, V 60/40, priemer 3 semien)

| Vek | Medián (min–max) | p75 | p90 | p99 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 | 100 (99–100) | 103 | 105 | 110 | 115 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| 25 | 135 (135–135) | 141 | 146 | 154 | 164 | 4,0 | 0,1 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| 28 | 151 (151–151) | 158 | 164 | 173 | 181 | 56,1 | 21,4 | 2,9 | 0,0 | 0,0 | 0,0 | 0,0 |
| 30 | 159 (159–160) | 167 | 172 | 180 | 185 | 79,5 | 49,8 | 16,7 | 1,2 | 0,0 | 0,0 | 0,0 |
| 33 | 165 (165–165) | 172 | 178 | 184 | 189 | 90,3 | 69,6 | 34,3 | 6,6 | 1,0 | 0,0 | 0,0 |
| 35 | 166 (166–166) | 173 | 178 | 185 | 190 | 91,7 | 72,0 | 36,5 | 7,9 | 1,5 | 0,0 | 0,0 |

### 6.4 OVR podľa ligy (F2 kalibrované 80/20, 3 Tour, V 60/40, priemer 3 semien; n = Ø počet jazdcov v lige a veku)

*Vek 25*

| Liga | n | Medián | p90 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rookie | 1697 | 125 | 132 | 144 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Amateur | 3032 | 133 | 140 | 151 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Continental | 3074 | 138 | 146 | 157 | 3,4 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Pro | 1714 | 140 | 150 | 161 | 10,8 | 0,3 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Elite | 483 | 144 | 153 | 164 | 22,4 | 1,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |

*Vek 30*

| Liga | n | Medián | p90 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rookie | 965 | 142 | 150 | 159 | 12,1 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Amateur | 2039 | 153 | 160 | 170 | 65,0 | 12,6 | 0,1 | 0,0 | 0,0 | 0,0 | 0,0 |
| Continental | 2854 | 161 | 169 | 178 | 87,6 | 56,4 | 7,6 | 0,0 | 0,0 | 0,0 | 0,0 |
| Pro | 2687 | 165 | 174 | 182 | 95,5 | 69,9 | 29,6 | 0,9 | 0,0 | 0,0 | 0,0 |
| Elite | 1455 | 168 | 178 | 185 | 98,9 | 84,9 | 44,9 | 6,6 | 0,3 | 0,0 | 0,0 |

*Vek 33*

| Liga | n | Medián | p90 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rookie | 742 | 146 | 154 | 165 | 31,8 | 0,8 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Amateur | 1665 | 157 | 164 | 175 | 80,9 | 32,0 | 1,2 | 0,0 | 0,0 | 0,0 | 0,0 |
| Continental | 2625 | 164 | 172 | 181 | 95,9 | 75,1 | 19,4 | 0,2 | 0,0 | 0,0 | 0,0 |
| Pro | 2991 | 169 | 178 | 186 | 98,9 | 85,1 | 50,1 | 5,4 | 0,1 | 0,0 | 0,0 |
| Elite | 1977 | 175 | 183 | 189 | 99,9 | 96,5 | 70,7 | 24,7 | 4,7 | 0,0 | 0,0 |

*Vek 35*

| Liga | n | Medián | p90 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rookie | 686 | 147 | 154 | 163 | 34,7 | 1,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Amateur | 1567 | 156 | 163 | 175 | 82,4 | 29,6 | 0,8 | 0,0 | 0,0 | 0,0 | 0,0 |
| Continental | 2553 | 164 | 171 | 182 | 96,7 | 76,9 | 17,1 | 0,1 | 0,0 | 0,0 | 0,0 |
| Pro | 3065 | 170 | 178 | 187 | 99,3 | 87,4 | 52,2 | 5,0 | 0,2 | 0,0 | 0,0 |
| Elite | 2129 | 176 | 183 | 190 | 100,0 | 97,8 | 75,2 | 29,6 | 6,5 | 0,0 | 0,0 |

*Liga je v simulácii určená kvótami postupu podľa výsledkov etáp (30 / 25 / 20 / 15 % hore, 10 / 10 / 10 / 15 % dole; EXP), nie OVR ani ligovým limitom OVR. Tabuľka ukazuje, ako sa OVR rozdelí medzi ligami, nie pravidlo hry.* Elite s 3 vs 4 Tour-mi (vek 30, V 60/40): 
3 Tour: n 1455, medián 168, p90 178, max 185, 170+ 44,9 %, 180+ 6,6 %; 
4 Tour: n 1455, medián 166, p90 176, max 184, 170+ 34,7 %, 180+ 2,5 %; 

### 6.5 Vývoj atribútov (priemer všetkých jazdcov, F2 kalibrované 80/20, 3 semená)

Hlavný 1/2/3 = 1., 2., 3. fyzický atribút prirodzeného plánu; ostatné = priemer ostatných 4 fyzických; technika 1/2 = dve techniky plánu.

| Vek | Hlavný 1 | Hlavný 2 | Hlavný 3 | Ostatné 4 | ø 7 fyz. | Top 3 | Technika 1 | Technika 2 | Najl. technika | Najl. taktika | Skúsenosti | Atribúty = 200 (ø počet) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 17 | 90 | 90 | 85 | 74 | 80 | 90 | 70 | 70 | 75 | 77 | 30 | 0,00 |
| 20 | 128 | 121 | 110 | 85 | 100 | 120 | 92 | 82 | 92 | 96 | 58 | 0,00 |
| 23 | 155 | 146 | 130 | 95 | 116 | 144 | 112 | 92 | 112 | 119 | 91 | 0,00 |
| 25 | 165 | 157 | 141 | 101 | 124 | 154 | 125 | 99 | 125 | 133 | 115 | 0,02 |
| 28 | 174 | 168 | 153 | 108 | 132 | 165 | 141 | 108 | 141 | 153 | 150 | 0,11 |
| 30 | 176 | 172 | 158 | 112 | 136 | 169 | 150 | 114 | 150 | 164 | 171 | 0,19 |
| 33 | 176 | 172 | 160 | 114 | 138 | 170 | 160 | 121 | 160 | 174 | 187 | 0,16 |
| 35 | 174 | 170 | 159 | 112 | 136 | 168 | 165 | 126 | 165 | 178 | 192 | 0,10 |

Skúsenosti 200 dosiahne medián veku 32 (32–32) (60,1 (59,5–61,1) % jazdcov do 35 rokov).

## 7. Manažérske stratégie (seed 20261116, V 60/40, 3 Tour, vek 30 a 33)

| Stratégia | OVR vek 30: medián / p90 / p99 / max | 170+ vek 30 / 33 (%) | 180+ vek 33 (%) | Hlavný fyz. vek 20 / 25 | 1. technika vek 30 | Ø readiness | Podiel základných týždňov |
|---|---|---|---|---|---|---|---|
| M1 Štandard (80/20, odporúčanie) | 160 / 172 / 180 / 185 | 16,7 / 34,4 | 6,6 | 128 / 166 | 150 | 66 | 0,27 |
| M2 Intenzívny (85/15, vždy 100 %) | 158 / 171 / 179 / 185 | 14,4 / 30,1 | 4,6 | 130 / 167 | 131 | 52 | 0,00 |
| M3 Opatrný (80/20, vždy základný) | 155 / 168 / 175 / 182 | 7,0 / 20,7 | 1,6 | 121 / 158 | 139 | 85 | 1,00 |
| M4 Technik (75/25, odporúčanie) | 160 / 172 / 180 / 186 | 16,8 / 34,7 | 6,3 | 126 / 163 | 164 | 66 | 0,27 |
| M5 Rotujúci plán | 156 / 169 / 177 / 185 | 8,8 / 22,0 | 2,8 | 123 / 155 | 116 | 66 | 0,27 |
| M6 Mladý univerzál (3 sezóny Univerzál) | 158 / 170 / 179 / 186 | 11,7 / 29,3 | 4,8 | 114 / 157 | 137 | 66 | 0,27 |
| M7 Kalendárny režim | 158 / 170 / 178 / 183 | 11,1 / 27,8 | 3,9 | 124 / 162 | 145 | 85 | 0,82 |
| M8 Mladí 75/25, potom 85/15 | 160 / 172 / 180 / 185 | 16,6 / 34,0 | 6,4 | 126 / 164 | 151 | 66 | 0,27 |
| M9 Mladí 85/15, potom 75/25 | 160 / 172 / 180 / 185 | 17,0 / 34,7 | 6,8 | 130 / 167 | 150 | 66 | 0,27 |
| M10 Adaptívny plán | 157 / 170 / 178 / 184 | 11,1 / 25,3 | 3,6 | 128 / 163 | 129 | 66 | 0,27 |
| M11 Náhodný plán a režim | 150 / 161 / 169 / 178 | 0,8 / 6,2 | 0,3 | 109 / 135 | 94 | 75 | 0,50 |

*Hlavný fyz. a technika 1 sú merané na prirodzenom pláne jazdca; pri rotácii plánov sa technika prirodzeného plánu trénuje menej.*

**Čítanie:** rozumné stratégie (M1, M4, M8, M9, M7) sú v OVR vek 30 vzdialené 0–2 body; podstatné rozdiely: **striedanie plánov (M5) −4 a adaptívny plán (M10) −3 v mediáne a výrazne menej 170+ pri vek 33** (rozptyľujú fyzický rozpočet), **mladý univerzál (M6) −2** (prvé tri sezóny tréningu mimo špecializácie sa nedobehnú), vždy plnohodnotný s 85/15 (M2) −2 a vždy základný (M3) −5; náhodný plán a režim (M11) −10. Technika (75/25 M4) rastie vyššie (1. technika 164), bez straty OVR.

## 8. Špecialisti vs. univerzáli

**Výsledky podľa tvaru (3 semená, F2 kalibrované 80/20, vek 30 / 33; V 60/40):**

| Tvar | n (vek 30) | Medián 30 | p90 30 | 170+ (30) % | 180+ (30) % | Ø top 3 | Ø 7 | Medián 33 | 170+ (33) % |
|---|---|---|---|---|---|---|---|---|---|
| Vrchár | 1393 | 161 | 173 | 20,3 | 1,8 | 175 | 138 | 167 | 41,4 |
| Šprintér | 1353 | 162 | 174 | 21,6 | 2,1 | 174 | 137 | 168 | 43,7 |
| Časovkár | 1383 | 162 | 175 | 24,6 | 2,3 | 175 | 138 | 169 | 46,5 |
| Puncheur | 1448 | 161 | 173 | 19,8 | 0,8 | 169 | 136 | 166 | 38,7 |
| Klasikár | 1485 | 158 | 170 | 11,0 | 0,7 | 158 | 133 | 163 | 23,9 |
| Únikár | 1462 | 159 | 172 | 16,0 | 0,6 | 169 | 135 | 165 | 32,7 |
| Univerzál | 1475 | 154 | 166 | 4,6 | 0,1 | 161 | 138 | 159 | 15,2 |

**Spravodlivosť plánov – každému z 10 000 jazdcov vnútený jeden plán (seed 20261116; medián OVR vek 30 podľa tvaru jazdca × plán):**

| Plán (vnútený všetkým) | Celkom medián / p90 | Vrchár | Šprintér | Časovkár | Puncheur | Klasikár | Únikár | Univerzál |
|---|---|---|---|---|---|---|---|---|
| Vrchár | 155 / 168 | 161 | 153 | 153 | 161 | 154 | 150 | 154 |
| Šprintér | 156 / 169 | 152 | 162 | 155 | 156 | 154 | 158 | 154 |
| Časovkár | 156 / 170 | 152 | 158 | 162 | 152 | 158 | 160 | 154 |
| Puncheur | 155 / 169 | 162 | 153 | 154 | 161 | 154 | 151 | 154 |
| Klasikár | 156 / 169 | 154 | 156 | 160 | 153 | 158 | 157 | 154 |
| Únikár | 156 / 170 | 152 | 158 | 163 | 151 | 157 | 160 | 154 |
| Univerzál | 155 / 168 | 155 | 156 | 158 | 151 | 155 | 157 | 154 |
| *vlastný plán každého tvaru (diagonála)* | 160 / 172 | 161 | 162 | 162 | 161 | 158 | 160 | 154 |

Univerzálny plán s dynamickým výberom (Vytrvalosť + dva najslabšie atribúty): celá populácia 151 / 162; pre samotných Univerzálov medián 150 (pevný plán 154).

**Univerzál vs. špecialisti pri iných V (vek 30, medián OVR / 170+ %):**

| V | Univerzál | Najlepší špecialista | Priemer 6 špecialistov |
|---|---|---|---|
| 60/40 | 154,0 / 4,6 % | 162,0 / 24,6 % | 160,5 / 18,9 % |
| 75/25 | 156,0 / 7,6 % | 165,0 / 34,1 % | 163,1 / 27,7 % |
| 80/20 | 157,0 / 9,0 % | 166,0 / 36,8 % | 163,9 / 30,5 % |

**Čítanie:**
- **Univerzál je znevýhodnený:** medián OVR je o 4–8 bodov nižší než u špecialistov a podiel 170+ je 2,5–5× menší. Príčina je vo vzorci V: špecialista koncentruje rast do troch atribútov a V ich váži 60 % (top 3), univerzál rovnaký rozpočet rozloží na priemer 7 (rovnaké Ø 7 ako špecialisti, ale nižší top 3: 161 vs 170–175). Zmena V na 75/25 alebo 80/20 rozdiel **zväčší**.
- **Vnútené plány:** žiadny plán nie je sám osebe „silnejší“ (celková medián 155–156 pri všetkých siedmich), vlastný plán tvaru dáva +3 až +9 bodov oproti cudziemu (okrem Univerzála, ktorému nepomôže žiadny); teda špecialista nezíska výhodu z konštrukcie plánu, ale z tvaru vzorca OVR.
- **Klasikár** je tiež znevýhodnený: jeho sila je technika (roughSurface, packRiding), OVR však berie len najlepšiu techniku s 10 % váhou a fyzický plán Klasikára nemá silné atribúty.
- Dynamický univerzálny plán (dva najslabšie atribúty) **zhoršuje** výsledok (−4 vo vnútenom variante), pretože zníži top 3.
- OVR sa nepoužíva v Race Engine ani v postupe (PROD), takže ide o zobrazený ukazovateľ, nie o skutočnú silu; napriek tomu treba rozhodnúť, či má univerzál dosahovať vysoké OVR (možnosť: vyššia váha priemeru 7 vo V pre všetkých, alebo samostatný bonus „vyrovnanosť“ – oboje v kandidátskom vzorci zatiaľ nie je).

## 9. Priemerný jazdec, dobrý talent, výnimočný talent (seed 20261116, V 60/40)

Skryté vlastnosti pevné pre celú skupinu (Pot/Tr/Pro/Reg/Vit): priemerný 50/50/50/50/50, dobrý talent 75/70/65/60/60, výnimočný 92/85/75/70/70; dobrý manažér (pevný prirodzený plán, 80/20, odporúčanie).

| Skupina | Vek 20 | Vek 25 | Vek 30 | Vek 33 | 170+ vek 33 (%) | 180+ vek 33 (%) | 190+ kariérne max (%) | Hlavný fyz. vek 25 | 1. technika vek 30 |
|---|---|---|---|---|---|---|---|---|---|
| priemerný jazdec | 100 / 104 | 136 / 141 | 161 / 167 | 167 / 171 | 27,1 | 0,0 | 0,0 | 168 | 152 |
| dobrý talent | 105 / 109 | 149 / 154 | 176 / 181 | 182 / 186 | 97,0 | 73,7 | 0,0 | 192 | 166 |
| výnimočný talent | 109 / 113 | 157 / 162 | 182 / 186 | 188 / 189 | 99,3 | 89,7 | 21,1 | 199 | 175 |

(Hodnoty vek = medián / p90.) Skupiny sú moja ľubovoľná definícia; dobrý talent (Pot 75, Tr 70) vychádza už na úroveň „špičkových“, preto ide o ilustráciu rozptylu, nie o cieľ.

## 10. Odporúčanie

**Koeficienty (ODPORÚČANIE, nič neimplementované):**
1. **Rozpočet:** kapacita týždňa 1,0 (plnohodnotný) / 0,75 (základný); aktívna kapacita sa delí 80 % výkon / 20 % technika (manažér môže voliť 75/25–85/15; v OVR to takmer nemení výsledok, mení výšku techniky).
2. **Koeficienty na plnú kapacitu:** hlavný / 2. / 3. fyzický **2,07 / 1,71 / 1,35**, ostatné 4 fyzické **0,63**, hlavná / druhá technika **5,53 / 2,93** (= tvoje štartovné hodnoty × 1,8 pre fyziku a × 6,5 pre techniku; pri 80/20 vychádzajú účinné prírastky 1,66 / 1,37 / 1,08 / 0,50 a 1,10 / 0,59). Pri 4 Tour-och fyziku ×2,0 (hlavný 2,30).
3. **Skryté vlastnosti:** aditívny G (Trénovateľnosť 0,30, Profesionalita 0,15, Potenciál 0,10) + mäkký osobný strop `130 + Potenciál`; Regenerácia = rýchlosť zotavenia, Vitalita = pokles a záťaž.
4. **Akumulátor:** pri atribúte na strope progress zahodiť (aj u techniky); po poklese sa vracia iba tréningom.

**Energetické pravidlá (ODPORÚČANIE):**
1. Plnohodnotný = produkčné `hard`, základný = produkčné `normal` (Energy a Fatigue sa počítajú produkčnými vzorcami a readiness produkčnou funkciou).
2. Záťaž pretekov: −7 Energy a +8 Fatigue na etapu × veľkosť etapy a 2 oddychové dni (+10 Energy, −8 Fatigue) v týždni Tour-u – **tieto hodnoty treba schváliť, produkcia ich nemá.**
3. Účinnosť podľa readiness: s produkčnou tabuľkou je výber režimu málo dôležitý (plnohodnotný ≈ odporúčanie); ak má mať rozhodnutie hráča váhu, treba prísnejšiu tabuľku (1,00 / 0,90 / 0,70 / 0,45 / 0,25) – **vyžaduje tvoje rozhodnutie**.
4. Odporúčanie režimu (iba odporúčanie, nikdy automat): základný režim po Tour-e, kým readiness nie je aspoň 60–80 (kalendárne pravidlo „2 týždne po Tour-e“ dosahuje takmer rovnaký výsledok).

**Výpočet V (ODPORÚČANIE):** 75/25 (60/40 dáva 190+ len u 0,01 %). 80/20 zvyšuje 190+ na ~1,3 % a zväčšuje znevýhodnenie univerzálov. V obidvoch prípadoch treba rozhodnúť o znevýhodnení Univerzála a Klasikára (kap. 8).

## 11. Čo je overené a čo je stále predpoklad

| Téma | Stav |
|---|---|
| Štartové OVR 70–80, Ø 75 pre všetky V | **Overené** (3 semená, tabuľka v kap. 5), ale rozdelenie atribútov a tvarov je EXP |
| Rozpočet 75/25, 80/20, 85/15 → výsledok | **Overené** v tomto modeli; závisí od osobného stropu (nasýtenie ho zmäkčuje) |
| Spoločný rozpočet je „reálna cena“ | **Čiastočne**: reálna v mladom veku, v OVR vek 30 nie |
| Obnova po Tour-e pri základnom režime | **Overené výpočtom s produkčnými konštantami**; záťaž Tour-u je predpoklad |
| Hráč dokáže rozumne vyberať režim | **Overené len s prísnejšou tabuľkou**; pri produkčnej tabuľke je rozdiel ≤ 1 bod |
| Akumulátor pri 200 / po poklese | **Overené** (deterministicky aj v populácii); produkčný kód čítaný, nie spúšťaný |
| 200 vo fyzických atribútoch | **Overené** (podiel a vek v kap. 4.2) |
| Špecialisti vs. univerzáli | **Overené** v modeli; závisí od väzieb plánov (EXP) a od vzorca V |
| 3 vs. 4 Tour | **Overené** (3 semená); predpoklad: 4. Tour v týždni 9 |
| Väzby plánov na techniku, 3. fyzický atribút | **Predpoklad** – prosím potvrď pôvodné väzby |
| Taktika / Skúsenosti z pretekov | **Predpoklad** (expK 14, tactK 12), kalibrované v C-075 |
| Kvóty postupu, Elite | **Predpoklad** |
| Race Engine | **Nesimulované** – OVR sa v ňom nepoužíva |
