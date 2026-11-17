# Nová kariérna simulácia od OVR 75 (Rookie → Elite, vek 17 → 35)

Stav: **iba izolovaná experimentálna simulácia a návrh. Produkčný kód, DB, migrácie ani herné pravidlá sa nezmenili.** Nič z toho nie je schválené.

Značenie: **PROD** = správanie v produkčnom kóde (`origin/main`), **EXP** = experimentálne pravidlo použité len v simulácii, **VÝSLEDOK** = číslo z reálne spusteného behu, **ODPORÚČANIE** = návrh na rozhodnutie.
Reprodukcia: `apps/web/src/lib/training/sim/career3/` (`career3.cli.ts`, `extra3.cli.ts`), seed 20261116, 10 000 kariér na variant; výstupy `docs/audit-ovr-career/career3_results.json`, `career3_extra.json`, graf `ovr75_graf.png`.

## 0. Najdôležitejšie zistenia (skrátene)

1. **Z OVR 75 sa v žiadnom z variantov A–D nedostane nikto na OVR 170.** Najvyššie OVR vo veku 30: A 128, B 137, C 135, D 147. Priebežné maximum celej kariéry: A 130, B 140, C 137, D 150.
2. **Rast OVR v produkčnom modeli tvorí takmer výlučne Skúsenosti a Taktika (EXP rast), nie výkon.** Do 30 rokov A: priemerný rast OVR +30,8, z toho Skúsenosti +21,2 (69 %), Taktika +5,8 (19 %), Výkon (V) +3,8 (12 %), Technika 0,0.
3. **Technika v produkcii prakticky nerastie** (najlepšia technika +0,4 za 13 sezón), preto OVR nemôže ísť nad ≈180, aj keby bol výkon 200: štartovný medián najlepšej techniky aj taktiky je 77, technika zostane ≈77 a taktika dorastie na ≈115–125, čo pri V 200 a S 200 dáva OVR ≈177 (pozorované maximum 181 pri ×60).
4. **Potenciál nemá v produkcii žiaden efekt na týchto úrovniach** (`overallPotentialFactor` začína pôsobiť až od priemeru výkonu 140): v A–C je medián OVR vo veku 30 pre nízky/stredný/vysoký Potenciál 106/107/106.
5. **Citlivosť na silu tréningu je veľmi prudká:** podiel jazdcov s V ≥ 190 vo veku 30 je pri ×25 1,4 %, pri ×40 22,8 %, pri ×60 36,6 % (var. B). Cieľ „V nad 190 veľmi vzácne“ je preto veľmi úzke okno, nie plynulé nastavenie.
6. **Žiadny test nevytvoril OVR 185+ ani 190+** (ani pri ×60: max 181).

## 1. Čo som overil v kóde (PROD) a kde sa líši od dizajnu v3

| Téma | PROD (`origin/main`) | Dizajn v3 / zadanie | Dopad na simuláciu |
|---|---|---|---|
| Vek | Jedna sezóna = +1 rok: `process_season_aging()` (schema.sql), `lib/calendar/seasonAging.ts`. Sezóna = 10 týždňov, kariéra 17→35 = 18 sezón = 180 herných týždňov | „Over, ako sa počíta vek“ | Vek v simulácii = sezóna + 17 |
| Fyzický pokles | Neexistuje (len +1 rok) | Pokles od ~32+, Vitalita mení krivku | **EXP** pokles (nižšie) |
| Skryté vlastnosti | 4 vlastnosti, 55–95 (`generate.ts`, `rider/config.ts`) | 5 vlastností, 1–100 vrátane Vitality | **EXP** 1–100, namapované na 55–95 do produkčných vzorcov (`mapHidden`) |
| Strop taktika/technika/skúsenosti | 160 (config + SQL) | 200 | **EXP** strop 200 |
| Rast taktiky / skúseností | Neexistuje | Iba z pretekov | **EXP** rast z odjazdených etáp |
| Rast techniky | Technický plán: `TECHNICAL_BASE` 2,0, max +1 bod/týždeň | Cielený tréning 1–2 atribútov | PROD pravidlá (A–D) |
| Fyzický rast | `performanceWeekRaw`: BASE 3 × tréningy × trainability × professionalism × `ageFactor` × `developmentRoomFactor`; prah akumulátora 12; vedľajší atribút 35 % | Rovnaké v duchu | PROD (A), násobok v B–D |
| `developmentRoomFactor` | Pod priemerom výkonu 140 je faktor Potenciálu 1,0, lokálny faktor 1,0 do 140 | Potenciál mení kariérny strop | Pozri 0.4 |
| Kalendár | 3 Tour-y vo všetkých ligách (`maxSeasonTours`), etapy 3/4/5/5/5; Elite 4×5 nie je v kóde | Rookie 3×3, Elite 4×5 (pracovný návrh) | Použité: Rookie 3×3, Amateur 3×4, Continental 3×5, Pro 3×5, Elite 4×5 (**EXP** pre Elite) |
| Majstrovstvá sveta | Nie sú implementované (len konfig týždeň 6) | Každú druhú sezónu | **EXP** MS každú druhú sezónu, štartujú len Continental+ |
| Postup | Počty postupu/zostupu `null` (`ZONE_RULES`) | Podľa športových výsledkov, nie OVR | **EXP** postup podľa výsledkov sezóny (nižšie) |
| OVR | Starý vzorec 0,50/0,25/0,20/0,05 (`rider/score.ts`) | Nový kandidát 0,60V+0,15T+0,10Te+0,15S | Počítané oba; hlavná metrika nový |
| Štartovná populácia | Produkcia ~130, vek 18–22 | OVR ~75, vek 17 | **EXP** populácia |

## 2. Metóda simulácie

**Štartovná populácia (EXP / ASSUMPTION, žiadne reálne dáta):** 10 000 jazdcov, vek 17, OVR (nový vzorec) priemer 75,0, medián 75, p5–p95 = 67–83 (je o niečo širšie než zadané 70–80). Šesť archetypov (Vrchár 20 %, Šprintér 15 %, Časovkár 15 %, Univerzál 25 %, Puncheur 12 %, Rovinár 13 %) s rôznym tvarom fyzických atribútov (silné +8…+25, slabé −0,7×), nízke štartovné Skúsenosti 15–45, päť skrytých vlastností ~N(50, 20) orezané na 1–100, nezávislé. Všetky varianty a opakovania používajú tú istú štartovú populáciu a rovnaké šumové semená.

**Športová stratégia (EXP):** dobrá 50 % (zameranie podľa archetypu, každý 3. plán technický), priemerná 35 % (zameranie podľa archetypu, 30 % šanca na náhodný fokus v sezóne, bez techniky), slabá 15 % (náhodný fyzický fokus každý týždeň). Aktivita: 60 % jazdcov sa prihlási na všetky Tour-y, 25 % na ~75 %, 15 % na ~50 %.

**Preteky a rast z nich (EXP):** koeficient Skúseností (14 bodov na etapu, vyhladenie pri strope) kalibrovaný tak, aby Skúsenosti 200 dosiahli aktívni jazdci okolo 30–33 rokov (kalibračný sweep 10/14/18/24: medián 34/31/29/26). Taktika rastie podľa typu jazdca a typu etapy (nie rovnomerne, bez náhodného dominantného atribútu), koeficient 6.

**Postup (EXP, počty neschválené):** po sezóne sa jazdci každej ligy zoradia podľa priemerného **výsledku etáp** (index z atribútov relevantných pre etapu + šum; **nie OVR**), hore ide 30 % / 25 % / 20 % / 15 % (Rookie / Amateur / Continental / Pro), dole 10 % (Amateur–Pro) a 15 % (Elite). Veľkosť líg preto určujú kvóty, nie schopnosti – berte počty v ligách ako ilustráciu.

**Pokles (EXP):** od veku 29–33 podľa Vitality (29 + ⌊(Vitalita−1)/25⌋), strata 0,8 + 0,4×(vek−nástup) bodu za sezónu na fyzický atribút (Šprint, Akcelerácia ×1,4; Vytrvalosť ×0,7).

**Varianty:**
- **A** – súčasný produkčný tréning (PROD, ×1).
- **B** – hlavný atribút ×3 (EXP; hlavný + 35 % vedľajší).
- **C** – rovnaký týždenný rozpočet ako B, rozdelený: hlavný 60 % + 3 súvisiace atribúty po 25 % (EXP).
- **D** – priemerný rozpočet ako B, ale individuálny násobok rastie s lognormálnou funkciou kompozitu (40 % Trénovateľnosť, 30 % Profesionalita, 30 % Potenciál) a Regenerácia ±0,1 na efektivitu týždňa; priemer normalizovaný na rovnaký ako B (EXP).
Násobky ×3 sú voľba pre porovnanie, nie cieľ ani návrh. Pretože v A–D nikto nedosiahne vysoké OVR, doplnil som sweep sily tréningu (kap. 5).

Kalibrácia: tréning a kondícia (rho 0,8) sú zhodné s predchádzajúcim auditom (starý simulátor +3,39 priemerný rast výkonu, nový +3,37); simulátor je týždňový, nie denný (menej presný).

## 3. Výsledky – vývoj OVR podľa veku (VÝSLEDOK, 10 000 kariér na variant)

**Variant A (PROD tréning + EXP preteky/pokles)**

| Vek | Medián | p75 | p90 | p99 | Max | Medián V | Max V | Skúsenosti p10 / medián / p90 | Medián (starý vzorec) | Rookie / Amateur / Continental / Pro / Elite |
|---|---|---|---|---|---|---|---|---|---|---|
| 18 | 77 | 80 | 83 | 88 | 94 | 85,8 | 106,3 | 25 / 38 / 53 | 74 | 7000 / 3000 / 0 / 0 / 0 |
| 20 | 81 | 85 | 89 | 94 | 100 | 87,0 | 108,4 | 38 / 59 / 76 | 77 | 4045 / 4268 / 1537 / 150 / 0 |
| 23 | 89 | 94 | 98 | 104 | 111 | 88,8 | 110,7 | 58 / 94 / 120 | 81 | 2275 / 3592 / 2858 / 1093 / 182 |
| 25 | 94 | 100 | 104 | 111 | 118 | 89,8 | 112,0 | 71 / 119 / 150 | 83 | 1697 / 3032 / 3074 / 1714 / 483 |
| 28 | 102 | 109 | 114 | 121 | 126 | 91,3 | 113,0 | 89 / 158 / 194 | 87 | 1182 / 2371 / 2997 / 2387 / 1063 |
| 30 | 107 | 113 | 117 | 124 | 128 | 92,1 | 114,0 | 103 / 185 / 200 | 89 | 965 / 2039 / 2854 / 2687 / 1455 |
| 32 | 109 | 115 | 119 | 125 | 130 | 91,7 | 114,2 | 116 / 198 / 200 | 90 | 806 / 1776 / 2699 / 2905 / 1814 |
| 35 | 108 | 113 | 117 | 123 | 129 | 86,9 | 110,6 | 135 / 200 / 200 | 89 | 686 / 1567 / 2553 / 3065 / 2129 |

Poznámka: „vek 35“ = stav na začiatku sezóny, v ktorej má jazdec 35 rokov; ligy pri veku 35 sú ligy poslednej odohranej sezóny.

**Porovnanie variantov: medián / p99 / max OVR a max V**

| Vek | A | B | C | D |
|---|---|---|---|---|
| 18 | 77 / 88 / 94 (V max 106) | 78 / 89 / 95 (V max 108) | 77 / 89 / 95 (V max 108) | 78 / 89 / 94 (V max 107) |
| 20 | 81 / 94 / 100 (V max 108) | 84 / 97 / 101 (V max 114) | 83 / 96 / 102 (V max 113) | 84 / 98 / 106 (V max 121) |
| 23 | 89 / 104 / 111 (V max 111) | 93 / 109 / 114 (V max 121) | 92 / 108 / 114 (V max 119) | 93 / 112 / 121 (V max 140) |
| 25 | 94 / 111 / 118 (V max 112) | 100 / 117 / 123 (V max 124) | 99 / 116 / 123 (V max 122) | 100 / 122 / 131 (V max 143) |
| 28 | 102 / 121 / 126 (V max 113) | 109 / 128 / 134 (V max 128) | 108 / 127 / 132 (V max 126) | 109 / 134 / 143 (V max 153) |
| 30 | 107 / 124 / 128 (V max 114) | 115 / 132 / 137 (V max 131) | 114 / 131 / 135 (V max 128) | 114 / 138 / 147 (V max 156) |
| 32 | 109 / 125 / 130 (V max 114) | 118 / 134 / 139 (V max 132) | 117 / 133 / 137 (V max 131) | 117 / 140 / 150 (V max 159) |
| 35 | 108 / 123 / 129 (V max 111) | 118 / 133 / 139 (V max 130) | 117 / 132 / 137 (V max 129) | 117 / 140 / 150 (V max 159) |

**Medián a p75/p90 vo veku 30**

| Variant | Medián | p75 | p90 | p99 | Max | Medián V | Max V |
|---|---|---|---|---|---|---|---|
| A produkcia (×1) | 107 | 113 | 117 | 124 | 128 | 92,1 | 114,0 |
| B silnejší hlavný (×3) | 115 | 121 | 126 | 132 | 137 | 106,6 | 130,5 |
| C hlavný+súvisiace (×3, 60/25/25/25) | 114 | 120 | 124 | 131 | 135 | 104,2 | 128,2 |
| D skryté vlastnosti (×3 priem.) | 114 | 122 | 128 | 138 | 147 | 104,4 | 156,2 |

**Podiel jazdcov s OVR nad prahom – celá populácia vo veku 30 aj najvyššie OVR z celej kariéry, a Elite vo veku 30** (v A–C je všade 0 %; D: 0 % pri veku 30; v Elite vo veku 32/35 ≥150: 0,1 %)

| Variant | Kariérne maximum ≥150 / 160 / 170 / 180 / 185 / 190 / 195 (celá populácia) | OVR ≥150 vek 30 – celá pop. | OVR ≥150 vek 30 – Elite | Elite medián OVR vek 30 |
|---|---|---|---|---|
| A produkcia (×1) | 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % | 0,00 % | 0,00 % | 117 |
| B silnejší hlavný (×3) | 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % | 0,00 % | 0,00 % | 124 |
| C hlavný+súvisiace (×3, 60/25/25/25) | 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % | 0,00 % | 0,00 % | 123 |
| D skryté vlastnosti (×3 priem.) | 0,02 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % / 0,00 % | 0,00 % | 0,00 % | 126 |

Podiel Elite-jazdcov s OVR ≥160/170/180/185/190/195 je v A–D 0 % (okrem D ≥150 0,1 % vo veku 32–35). Elite má vo veku 30 v A 1 455 jazdcov (14,6 %), čo je dôsledok kvót postupu, nie dizajn.

## 4. Rozlíšenie výsledkov (vek 30, medián OVR; n = počet jazdcov)

**Archetyp** – medián (p99)

| Skupina | A | B | C | D |
|---|---|---|---|---|
| Puncheur (n=1259) | 110 (125) | 119 (133) | 117 (131) | 118 (139) |
| Rovinár (n=1257) | 109 (123) | 118 (131) | 117 (130) | 117 (137) |
| Univerzál (n=2474) | 99 (114) | 105 (120) | 105 (120) | 105 (127) |
| Vrchár (n=2046) | 110 (124) | 119 (133) | 117 (131) | 118 (139) |
| Časovkár (n=1513) | 107 (124) | 115 (132) | 114 (131) | 115 (139) |
| Šprintér (n=1451) | 109 (124) | 118 (133) | 117 (131) | 118 (140) |

**Potenciál (terciely)** – medián (p99)

| Skupina | A | B | C | D |
|---|---|---|---|---|
| 1 nízky (n=3203) | 106 (123) | 115 (132) | 114 (131) | 111 (133) |
| 2 stredný (n=3404) | 107 (124) | 115 (132) | 114 (130) | 114 (137) |
| 3 vysoký (n=3393) | 106 (124) | 115 (132) | 113 (131) | 117 (141) |

**Trénovateľnosť (terciely)** – medián (p99)

| Skupina | A | B | C | D |
|---|---|---|---|---|
| 1 nízky (n=3259) | 106 (123) | 114 (131) | 112 (129) | 109 (129) |
| 2 stredný (n=3375) | 106 (123) | 115 (131) | 113 (130) | 114 (134) |
| 3 vysoký (n=3366) | 107 (125) | 116 (133) | 115 (131) | 120 (141) |

**Kvalita tréningovej stratégie** – medián (p99)

| Skupina | A | B | C | D |
|---|---|---|---|---|
| dobrá (n=5034) | 106 (124) | 114 (131) | 112 (129) | 113 (136) |
| priemerná (n=3450) | 107 (124) | 117 (133) | 116 (132) | 117 (140) |
| slabá (n=1516) | 106 (122) | 114 (129) | 113 (129) | 114 (136) |

**Počet absolvovaných pretekov (terciely štartov)** – medián (p99)

| Skupina | A | B | C | D |
|---|---|---|---|---|
| 1 málo štartov (n=3327) | 97 (112) | 106 (122) | 105 (121) | 105 (128) |
| 2 stredne (n=3214) | 106 (119) | 115 (129) | 113 (127) | 113 (134) |
| 3 veľa štartov (n=3459) | 114 (125) | 123 (134) | 121 (132) | 123 (141) |

Poznámky: „dobrá“ stratégia je v A–C mierne **horšia** ako „priemerná“, lebo každý tretí plán spotrebuje na techniku, ktorá takmer nerastie – tréningové rozhodnutie o technike sa dnes neoplatí. Počet štartov má v A väčší vplyv než akékoľvek tréningové rozhodnutie (97 vs 114 medián OVR medzi najnižším a najvyšším terciom štartov).

## 5. Citlivosť na silu tréningu a rozklad rastu OVR (3 000 kariér)

| Nastavenie | Medián OVR (30) | p99 | Max | V p99 | V ≥190 | OVR ≥170 | OVR ≥180 | OVR ≥190 | Kariérne max ≥170 |
|---|---|---|---|---|---|---|---|---|---|
| B ×15 | 140 | 160 | 166 | 176 | 0,0 % | 0,0 % | 0,0 % | 0,0 % | 0,0 % |
| B ×25 | 148 | 170 | 174 | 190 | 1,4 % | 1,4 % | 0,0 % | 0,0 % | 4,3 % |
| B ×40 | 155 | 175 | 179 | 197 | 22,8 % | 11,0 % | 0,0 % | 0,0 % | 17,0 % |
| B ×60 | 158 | 177 | 181 | 200 | 36,6 % | 20,2 % | 0,2 % | 0,0 % | 30,4 % |
| C ×25 | 157 | 170 | 174 | 190 | 0,9 % | 1,9 % | 0,0 % | 0,0 % | 6,4 % |
| C ×40 | 162 | 175 | 179 | 197 | 24,5 % | 14,5 % | 0,0 % | 0,0 % | 24,1 % |
| C ×60 | 164 | 178 | 181 | 200 | 44,6 % | 24,5 % | 0,2 % | 0,0 % | 37,1 % |
| D ×25 | 144 | 174 | 180 | 197 | 7,4 % | 4,5 % | 0,0 % | 0,0 % | 7,6 % |
| D ×40 | 150 | 177 | 181 | 200 | 18,4 % | 11,3 % | 0,2 % | 0,0 % | 16,4 % |
| A ×1 | 107 | 124 | 128 | 107 | 0,0 % | 0,0 % | 0,0 % | 0,0 % | 0,0 % |
| B ×3 | 115 | 132 | 136 | 122 | 0,0 % | 0,0 % | 0,0 % | 0,0 % | 0,0 % |
| B ×10 | 134 | 151 | 159 | 159 | 0,0 % | 0,0 % | 0,0 % | 0,0 % | 0,0 % |

**Rozklad rastu OVR do veku 30** (priemerné body OVR od štartu)

| Variant | z Výkonu (0,6·ΔV) | z Taktiky | z Techniky | zo Skúseností | priemerný ΔTop3 fyzických atribútov |
|---|---|---|---|---|---|
| B ×25 | 45,5 | 5,7 | 0,0 | 21,3 | 86,8 |
| A ×1 | 3,8 | 5,8 | 0,0 | 21,2 | 7,6 |
| B ×3 | 12,1 | 5,8 | 0,0 | 21,2 | 24,3 |
| B ×10 | 30,8 | 5,7 | 0,0 | 21,3 | 60,7 |

Malé citlivostné behy (B, 3 000 kariér, vek 30, medián/p99): ×2 111/128, ×4 119/135, ×6 125/141, ×10 134/151; technika ×6 (B×3) 115/132 – bez zmeny; bez poklesu a bez MS rozdiel ≤1; prísnejší postup (×0,6) 113/132 (Elite 105 jazdcov namiesto 437).

**Opakované seedy** (10 000 kariér, iné štartovné populácie a šum): A medián vo veku 30 107 (p99 123), B 115 (p99 132) pre oba seedy 101 aj 202; kariérne maximum ≥170: 0 %; Skúsenosti 200 medián 31. Výsledok je stabilný.

## 6. Konkrétne kariéry

**Variant A (produkcia)** (vek 17 / 20 / 25 / 30 / 35; OVR, V, Skúsenosti; dráha lig: R=Rookie, A=Amateur, C=Continental, P=Pro, E=Elite, jeden znak = sezóna od 17 rokov)

- **priemerný jazdec** – Šprintér, stratégia priemerná, aktivita 100 %, 186 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 56/42/77/33/48; OVR 72 (V 80, S 39) → OVR 80 (V 82, S 70) → OVR 93 (V 86, S 125) → OVR 107 (V 88, S 191) → OVR 105 (V 81, S 200); dráha `RRRRRRRAAAAACAAAAA`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [66, 79, 72, 110, 75, 67, 92]
- **dobrý talent** – Vrchár, stratégia dobrá, aktivita 100 %, 261 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 83/67/45/75/44; OVR 78 (V 91, S 22) → OVR 85 (V 92, S 58) → OVR 102 (V 95, S 135) → OVR 117 (V 97, S 199) → OVR 116 (V 91, S 200); dráha `RAACCCEEEPPPPPPPPP`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [121, 84, 84, 71, 70, 105, 83]
- **výnimočný talent** – Rovinár, stratégia dobrá, aktivita 100 %, 211 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 90/81/72/36/40; OVR 73 (V 84, S 27) → OVR 81 (V 86, S 58) → OVR 94 (V 89, S 118) → OVR 109 (V 91, S 191) → OVR 109 (V 85, S 200); dráha `RRRRRAAAACCCCCCCCC`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [64, 64, 112, 73, 86, 96, 76]
- **špecialista** – Vrchár, stratégia dobrá, aktivita 75 %, 216 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 67/72/65/71/34; OVR 83 (V 94, S 44) → OVR 88 (V 96, S 65) → OVR 104 (V 99, S 134) → OVR 117 (V 102, S 194) → OVR 117 (V 95, S 200); dráha `RRACCCEEEPPEEPPPPP`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [127, 84, 88, 66, 64, 114, 82]
- **univerzál** – Univerzál, stratégia dobrá, aktivita 100 %, 269 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 78/68/61/4/46; OVR 84 (V 94, S 40) → OVR 91 (V 94, S 78) → OVR 106 (V 96, S 158) → OVR 116 (V 97, S 200) → OVR 113 (V 89, S 200); dráha `RACEEEEPPPPPPPPPPP`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [97, 96, 96, 96, 96, 97, 97]
- **vysoký potenciál, zlý tréning** – Puncheur, stratégia slabá, aktivita 100 %, 252 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 89/75/41/31/58; OVR 77 (V 88, S 16) → OVR 84 (V 89, S 52) → OVR 101 (V 92, S 129) → OVR 116 (V 93, S 198) → OVR 116 (V 89, S 200); dráha `RAACCCCEEEPEPEPPPP`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [84, 94, 81, 84, 88, 89, 105]

**Variant D (skryté vlastnosti)** (vek 17 / 20 / 25 / 30 / 35; OVR, V, Skúsenosti; dráha lig: R=Rookie, A=Amateur, C=Continental, P=Pro, E=Elite, jeden znak = sezóna od 17 rokov)

- **priemerný jazdec** – Vrchár, stratégia priemerná, aktivita 100 %, 204 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 50/42/54/66/15; OVR 72 (V 82, S 17) → OVR 81 (V 87, S 48) → OVR 96 (V 94, S 106) → OVR 114 (V 102, S 176) → OVR 116 (V 96, S 200); dráha `RRRRRRAAAAACEEEEEE`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [136, 81, 82, 80, 69, 109, 83]
- **dobrý talent** – Vrchár, stratégia dobrá, aktivita 100 %, 253 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 74/85/80/28/42; OVR 70 (V 81, S 31) → OVR 85 (V 96, S 62) → OVR 110 (V 114, S 135) → OVR 128 (V 122, S 199) → OVR 129 (V 118, S 200); dráha `RRRRACEPPPEPPPPPPP`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [195, 73, 76, 61, 56, 143, 77]
- **výnimočný talent** – Rovinár, stratégia dobrá, aktivita 100 %, 220 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 90/81/72/36/40; OVR 73 (V 84, S 27) → OVR 89 (V 99, S 58) → OVR 113 (V 118, S 125) → OVR 131 (V 126, S 195) → OVR 132 (V 123, S 200); dráha `RRRRAACCCCCCCCEECE`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [64, 64, 196, 73, 137, 96, 76]
- **špecialista** – Šprintér, stratégia dobrá, aktivita 100 %, 220 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 50/79/75/56/82; OVR 74 (V 82, S 36) → OVR 87 (V 93, S 67) → OVR 110 (V 109, S 135) → OVR 128 (V 118, S 198) → OVR 131 (V 118, S 200); dráha `RRRAAAACCCCCCCCCCE`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [67, 79, 78, 187, 75, 64, 128]
- **univerzál** – Univerzál, stratégia dobrá, aktivita 100 %, 269 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 57/91/71/42/41; OVR 79 (V 93, S 16) → OVR 90 (V 100, S 54) → OVR 111 (V 110, S 134) → OVR 128 (V 118, S 199) → OVR 128 (V 116, S 200); dráha `RACEEEEPPPPPPPPPPP`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [118, 119, 115, 117, 120, 118, 116]
- **vysoký potenciál, zlý tréning** – Šprintér, stratégia slabá, aktivita 75 %, 179 etáp, Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 95/80/63/63/52; OVR 78 (V 89, S 37) → OVR 93 (V 106, S 62) → OVR 117 (V 131, S 108) → OVR 139 (V 147, S 172) → OVR 147 (V 151, S 200); dráha `RRAAACCEPPPPPPPPPP`; fyzické atribúty (Stúp., Kopce, Rov., Šprint, Čas., Vytrv., Akc.) vo veku 30: [98, 117, 121, 149, 152, 130, 167]

Poznámka: príklady sú vybrané podľa pravidiel (nie ručne) z vlastností a výsledkov v danej simulácii; „výnimočný talent“ je najlepší jazdec so Potenciálom >85, Trénovateľnosťou >80 a Profesionalitou >65 s dobrou stratégiou.

## 7. Odpovede na kľúčové otázky

1. **Z OVR 75 na 170?** Nie v A–D (max 137 pri B, 147 pri D vo veku 30). Až pri ×25 tréningu hlavného atribútu dosiahne OVR ≥170 vo veku 30 1,4 % jazdcov, pri ×40 11 %, pri ×60 20 %.
2. **OVR 180–185?** V A–D nikto. Pri ×60 vo veku 30 je OVR ≥180 u 0,17 % a max 181. OVR 185+ nevzniklo v žiadnom teste.
3. **OVR 190+ pre malé percento?** Nie – ani ×60 nestačí. Dôvod: pri V ≈200, S 200, najlepšej taktike ≈115–125 (štart 77 + 38 až 48 z pretekov) a technike ≈77 (bez rastu) vychádza OVR ≈177 (pozorované maximum 181 pri ×60). Na OVR 190 treba aj taktiku a techniku okolo 170.
4. **Špecialista na OVR 190 bez siedmich výborných atribútov?** Neoveriteľné – nikto nedosiahol OVR 190. Pri V platí: pri B ×40 má V ≥190 22,8 % jazdcov (pri ×25 1,4 %); koľko slabých atribútov títo jazdci majú, som nevyhodnotil.
5. **Príliš veľa vysokých OVR?** Pri produkčnom tréningu nie (opak). Pri ×40+ je naopak V ≥190 bežné (22–37 %), čiže príliš veľa.
6. **Dostanú sa priemerní do Elite?** V tejto simulácii je členstvo v Elite určené kvótami (27 % kariér aspoň raz v Elite v A, 27 % v B), nie vzácnosťou. V A–C nezávisí od Potenciálu (28/28/27 %), v D rastie 16 % → 27 % → 37 %. Jazdci s nízkym Potenciálom aj Trénovateľnosťou (n=1 560): A 26,5 %, D 7,3 %. Najlepším prediktorom úspechu je počet štartov a archetyp, nie hidden vlastnosti. Berte opatrne – počty postupu sú predpoklad.
7. **Má rozhodnutie manažéra význam?** V A–C minimálny (±3 OVR medzi stratégiami, a „dobrá“ je horšia ako „priemerná“). V D je rozdiel medzi nízkou a vysokou Trénovateľnosťou 109 → 120 medián OVR (vek 30), ale stratégia (fokus) stále sotva (113 / 117 / 114).
8. **Rast príliš pomalý/rýchly?** Fyzický rast v A je príliš pomalý (priemerné V +6,4 za 13 sezón, hlavný atribút v príkladoch +19 až +23), rast Skúseností (+141 do 30) a Taktiky je naopak taký rýchly, že tvoria 88 % rastu OVR. Medián OVR ide 75 → 107 (vek 30), potom stagnuje a po 32 klesá.

## 8. Skúsenosti a Taktika

- Skúsenosti 200 (EXP koeficient 14): dosiahne ich **63 %** jazdcov do 35 (medián veku 31, p5–p95 = 29–34): do 30 je to 17,5 %, do 32 46,8 %, do 33 55,1 %. Zvyšok má málo štartov (Rookie 9 etáp/sezónu) alebo nízku aktivitu – žiadny vekový zámok.
- Taktika: najlepší taktický atribút rastie o ~+38 (vek 30) a +49 (vek 35), nerovnomerne podľa archetypu.
- Počet etáp: priemer 10,4 za sezónu.

## 9. Konflikty a obmedzenia simulácie

- Štartovná populácia, aktivita, stratégie, kvóty postupu, MS účasť, pokles, rast Taktiky/Skúseností sú **EXP/ASSUMPTION**, nie produkčné pravidlá. Výsledky treba čítať ako „čo by sa stalo, keby…“.
- Veľkosť líg je daná kvótami (Elite 14,6 % kohorty pri veku 30) – to nie je realistická pyramída; počet jazdcov v lige sa musí určiť pravidlami hry, nie týmto modelom.
- Simulácia je týždňová, kondícia konštantná (rho 0,8), nie denná; menej detailná než starý simulátor, kalibrovaná naň.
- Technika: len PROD pravidlá (technický plán, +1/týždeň); žiadny variant nezvyšuje rast techniky (test ×6 bez efektu, lebo prah akumulátora a strop +1/týždeň).
- Race Engine ani ekonomika nie sú simulované; OVR sa na postup nepoužíva.
- Rozloženie hidden vlastností ~N(50, 20) je predpoklad.

## 10. Odporúčania (návrh, nič neimplementované)

1. **Rozdeliť rast OVR na zdroje, ktoré sa dajú ovplyvniť:** dnes je 69 % rastu (A, vek 30) zo Skúseností, 19 % z Taktiky, 12 % z Výkonu. Ak má byť OVR „hlavne za výkon“, váha Skúseností 0,15 je pri nízkom štarte príliš veľká (Skúsenosti rastú „zadarmo“).
2. **Fyzický tréning musí zvyšovať aspoň 3 atribúty** (hlavný + súvisiace), nie 2; variant C rozdelil rovnaký rozpočet na 4 atribúty: pri ×3 je medián OVR podobný (114 vs 115), pri ×25 zdvihne stred (medián 157 vs 148, OVR ≥150 81 % vs 48 %), ale nie vrchol (p99 170 v oboch).
3. **Hrubá sila tréningu je potrebná ≈ ×25–40** oproti produkcii na to, aby sa V ≥190 objavilo; okno medzi „nikto“ a „veľa“ je úzke (×25 1,4 % → ×40 22,8 %), preto sa odporúča per-jazdecký strop podľa Potenciálu (osobný strop atribútov), nie len globálny násobok.
4. **Potenciál musí pôsobiť od nízkych úrovní** (dnes až od priemeru výkonu 140), inak je pri štarte 75 nepoužiteľný.
5. **Technika potrebuje vlastný zdroj rastu** (viac než +1 bod/týždeň alebo rast z pretekov) a primeraný kompromis s fyzickým tréningom; teraz technický týždeň stojí fyzický rast a nič nevráti.
6. **Taktika a Technika v OVR:** ak má byť OVR 190 možné, musí byť dosiahnuteľná taktika/technika ≈170; pri `max()` v T a Te stačí jeden dobrý atribút, ale ten musí vedieť narásť.
7. **Pred ďalším krokom rozhodnúť:** štart populácie (70–80 vs 130 v produkcii), počty postupu a veľkosti líg, strop 200, 5 skrytých vlastností, kto štartuje na MS, a či má rast Skúseností veľkosť pásma 14 b./etapu (kalibrované na cieľ 30–33 rokov).

Ďalší krok navrhujem až po tvojom rozhodnutí: variant „B+C kombinovaný + osobný strop + technický rast“ ako ďalší experiment, nie implementácia.
