# Model F – číselná kalibrácia nového tréningu (7 plánov, 2 režimy, energia) – výsledky simulácie

Stav: **iba experimentálna simulácia v izolácii. Produkčný kód, DB, migrácie ani herné pravidlá sa nezmenili. Nič nie je schválené.**
Značenie: **PROD** = produkčný kód, **EXP** = experimentálne pravidlo/predpoklad, **VÝSLEDOK** = reálne spustený beh, **ODPORÚČANIE** = návrh.
Reprodukcia: `apps/web/src/lib/training/sim/career3/` (`modelF.ts`, `careerF.cli.ts`, `extraF.cli.ts`), seed 20261116, **10 000 kariér Rookie (17 r.) → 35 rokov v každom behu**, rovnaká štartovná populácia (priemerné OVR 75, rozsah ~70–80) a rovnaké šumové semená v každom behu. Výstupy: `careerF_results.json`, `careerF_extra.json`.

## 0. Zhrnutie a poctivé vyhodnotenie

1. **Tvoje štartovné koeficienty (×1,0) na ciele nestačia.** Pri veku 30 je medián OVR 139, p90 150, p99 157, maximum 168; OVR 170+ nemá nikto vo veku 30 (max 168) a vo veku 33 len 0,08 % jazdcov (max 173). Pravdepodobný dôvod: v 10-týždňovej sezóne je len ~6 tréningových týždňov (týždeň 1 a 3 týždne Tour-ov netrénujú) a únava znižuje účinnosť (kap. 1).
2. **Odporúčaná kalibrácia = všetky fyzické koeficienty ×2,0 a technické ×1,5** (pomery 1,15 : 0,95 : 0,75 : 0,35 a 0,85 : 0,45 ostávajú). Potom (V 60/40, 10 000 kariér): vek 30 medián 157, p90 171, p99 179, max 185; vek 33 medián 163, p90 176, p99 183.
3. **Ciele:** „kvalitní ~170“ ✓ (p90 vo veku 30 = 171, 13,4 % má ≥170, vo veku 33 28,2 %); „špičkoví ~180“ ✓ (p99 = 179; vo veku 33 má ≥180 3,8 %); „iba vzácne 190+“: **pri V 60/40 nedosiahol 190 nikto z 10 000**, pri V 75/25 0,26 % a pri 80/20 0,55 % kariér (kariérne maximum). Žiadne kvóty ani ligové limity OVR nie sú zavedené.
4. **Slabá stránka:** priemerný jazdec (všetky skryté vlastnosti 50) dosiahne vo veku 30 medián OVR 159, celá populácia 157. To nie je „automaticky 170“, ale je to viac než by niekto čakal od „priemeru“; pre nižší priemer treba nižšie ×2,0 (tabuľka v kap. 2).
5. **Rozhodnutia manažéra majú efekt:** náhodný plán každý týždeň je o 7 bodov OVR horší v mediáne ako pevný plán, o 9 v p90 a o ~15 bodov v hlavnej disciplíne; zlý manažér (náhodný plán, vždy 100 %) je horší o 9–13 bodov OVR vo veku 30 (kap. 8). Striedanie plánov ani adaptívny výber pevný plán **nepredbehli**.
6. **100 % tréning nie je vždy optimálny:** pevný 100 % režim má OVR 154, základný 155, „smart“ (základný pri únave > 25) 157. Rozdiely sú malé (2–3 body), ale konzistentné; pri nízkej Regenerácii vyhráva základný, pri vysokej plnohodnotný.
7. **Taktika a skúsenosti** dosiahnu vysoké hodnoty: Skúsenosti 200 medián veku 32, najlepšia taktika 162 vo veku 30 a 172 vo veku 33 (priemery).
8. **Skryté vlastnosti** sa nenásobia do extrémne slabého rastu: aditívny modifikátor G má p5 = 0,77, p95 = 1,23; pôvodný multiplikatívny súčin (model E) mal p5 = 0,50 a p95 = 1,25.

**Čo ostáva otvorené (neskrášľujem):** (a) 190+ je pri V 60/40 prakticky nedosiahnuteľné; (b) všetky parametre energie a únavy sú EXP bez produkčných dát; (c) rast je veľmi rýchly v ranom veku (hlavný atribút 92 → 128 do 20 rokov a 155 do 23 rokov), plató okolo 28–30 rokov; (d) postup medzi ligami je v simulácii určený kvótami (30/25/20/15 % hore) – nie je to pravidlo hry; (e) podiely rastu OVR (vek 17 → 30, priemer): fyzika 50 %, Skúsenosti 26 %, Taktika 16 %, Technika 8 % – Skúsenosti a Taktika sú stále veľký podiel.

## 1. Model F – presné vzorce (EXP)

### 1.1 Plány (7) a ich rozdelenie atribútov
Zadanie neurčuje, ktorých 7 plánov existuje; **predpoklad (EXP): jeden plán na jeden hlavný fyzický atribút**, tri hlavné fyzické = hlavný + dva najviac súvisiace (podľa existujúcej mapy `RELATED`), dve techniky podľa typu jazdca.

| Plán | 1. fyzický (+1,15) | 2. fyzický (+0,95) | 3. fyzický (+0,75) | 1. technika (+0,85) | 2. technika (+0,45) |
|---|---|---|---|---|---|
| Stúpanie | Stúpanie | Vytrvalosť | Kopce | Zjazd | Zákruty |
| Kopce/Puncheur | Kopce | Akcelerácia | Stúpanie | Zákruty | Ovládanie bicykla |
| Rovina | Rovina | Časovka | Vytrvalosť | Nerovný povrch | Jazda v balíku |
| Šprint | Šprint | Akcelerácia | Rovina | Jazda v balíku | Ovládanie bicykla |
| Časovka | Časovka | Vytrvalosť | Rovina | Ovládanie bicykla | Zákruty |
| Vytrvalosť/Univerzál | Vytrvalosť | Časovka | Stúpanie | Zjazd | Jazda v balíku |
| Akcelerácia | Akcelerácia | Šprint | Kopce | Ovládanie bicykla | Zákruty |

Prirodzený plán jazdca: Vrchár → Stúpanie, Puncheur → Kopce, Rovinár → Rovina, Šprintér → Šprint, Časovkár → Časovka, Univerzál → Vytrvalosť/Univerzál.

### 1.2 Týždenný rast atribútu j (v „bodoch“, produkčný akumulátor s prahom 12 ostáva: `progress += 12·body`, atribút `+ floor(progress/12)`)
`body_j = coef_j × cScale × podiel × eff(F) × G × α(vek) × room_j`

- `coef_j`: tri hlavné fyzické 1,15 / 0,95 / 0,75; ostatné 4 fyzické `gen` (0,20 / 0,35 / 0,50); technika 0,85 / 0,45 (technika: `techScale`, vek `(1+α)/2`, `room = clamp((200−a)/60; 0,1; 1)`, max +4/týždeň).
- `podiel` = 1,00 (plnohodnotný) alebo 0,75 (základný).
- `α(vek)` = produkčný `ageFactor` (1,30 / 1,20 / 1,10 / 1,00 / 0,80 / 0,55 / 0,30), **PROD**.
- `room_j` = mäkký osobný strop atribútu `1/(1+exp((a − (Cap − medzera − 10))/7))`, `Cap = capBase + Potenciál`, medzera podľa tvaru archetypu 0 / 20 / 45 / 15 (silné / neutrálne / slabé / univerzál).
- Týždne: z 10 týždňov netrénuje týždeň 1 a týždne s Tour-om (**PROD kalendár**; Tour v týždňoch 2, 5, 7 – pre jazdca s aktivitou < 100 % sa Tour vynechá a týždeň je tréningový); v priemere ~6 tréningových týždňov za sezónu.

### 1.3 Skryté vlastnosti (aditívne, nie multiplikatívne)
`G = clamp(1 + 0,30·zTr + 0,15·zPr + 0,10·zPo ; 0,6 ; 1,5)`, `z = (hodnota − 50)/50`.
- **Trénovateľnosť** 0,30, **Profesionalita** 0,15, **Potenciál** 0,10 (rýchlosť) + osobný mäkký strop `Cap = capBase + Potenciál`.
- **Regenerácia**: rýchlosť zotavenia `q = 0,50·(0,75 + 0,5·Reg/100) (+0,18 v základnom režime)`.
- **Vitalita**: začiatok poklesu 29–33 rokov (strata 0,8 + 0,4/rok, Šprint/Akcelerácia ×1,4, Vytrvalosť ×0,7) a záťaž únavy `1,15 − 0,3·Vit/100`.

### 1.4 Energia a únava (EXP; PROD má vlastný systém Condition/Fatigue, tu zjednodušený na jeden stav F 0–100)
- Týždeň tréningu: `F ← F·(1 − q) + záťaž·(1,15 − 0,3·Vit/100)`, záťaž 14 (plnohodnotný), 10,5 (základný, 0,75×).
- Pretekový týždeň: `F ← F·(1 − 0,125·rm)`, každá etapa pridá `7 × veľkosť etapy`.
- Účinnosť tréningu `eff(F) = clamp(1 − 0,020·max(0; F−15); 0,35; 1)`, pri F > 80 navyše ×0,6.
- Výsledok etapy (index pre postup) klesá o `0,15·max(0; F−25)`.
- Medzi sezónami F ×0,25.
- Manažérske režimy: **plnohodnotný** (vždy 100 %), **základný** (vždy 75/25), **smart** (základný, ak F > prah; základný = 25), **tourBasic** (základný 2 týždne po Tour-e), **randomMode** (50 : 50).

### 1.5 Taktika a skúsenosti z pretekov (EXP, nič z techniky)
Za etapu: `raw_S = expK × veľkosť × taper(S)`, `veľkosť = clamp(km/150; 0,3; 1,2)` (MS 1,0), `taper = clamp((200−S)/15; 0; 1)`; `raw_T = tactK × váha_typu × váha_etapy × veľkosť × 0,956 × τ × α × taper`. **Prírastok = raw/12 bodu** (nie raw): etapa veľkosti 1 dá s `expK = 14` len 14/12 = 1,17 bodu Skúseností. Odporúčané `expK = 14`, `tactK = 12`.

## 2. Koeficienty: tvoje surové vs. kalibrované (VÝSLEDOK)

**Globálna škála fyzických koeficientov** (technika ×1,5, strop capBase 130, smart režim, pevný plán; V 60/40):

| cScale | Vek 30: medián / p90 / p99 / max | ≥170 (%) | ≥180 (%) | Vek 33 medián / p90 / p99 | ≥170 (%) | ≥180 (%) | ≥190 (%) |
|---|---|---|---|---|---|---|---|
| 1,0 (tvoje surové, capBase 120, technika ×1,0) | 139 / 150 / 157 / 168 | 0,00 | 0,00 | 145 / 155 / 163 | 0,08 | 0,00 | 0,00 |
| 2,0 | 157 / 171 / 179 / 185 | 13,4 | 0,63 | 163 / 176 / 183 | 28,2 | 3,8 | 0,00 |
| 1,5 | 151 / 164 / 172 / 181 | 2,2 | 0,01 | 158 / 169 / 178 | 9,6 | 0,4 | 0,00 |
| 1,8 | 155 / 168 / 176 / 184 | 7,9 | 0,20 | 161 / 174 / 181 | 21,0 | 1,9 | 0,00 |
| 2,2 | 159 / 173 / 180 / 186 | 18,2 | 1,49 | 165 / 178 / 184 | 34,1 | 6,0 | 0,00 |
| 2,5 | 161 / 175 / 182 / 188 | 25,2 | 3,11 | 167 / 180 / 186 | 41,1 | 10,3 | 0,05 |

**Odporúčané koeficienty (cScale 2,0; technika ×1,5), body za týždeň pri 100 % tréningu pred individuálnymi modifikátormi:**

| Atribút | Tvoj štart | Odporúčané |
|---|---|---|
| Hlavný fyzický | 1,15 | **2,30** |
| Druhý fyzický | 0,95 | **1,90** |
| Tretí fyzický | 0,75 | **1,50** |
| Ostatné 4 fyzické (gen 0,35) | 0,35 | **0,70** |
| Hlavná technika | 0,85 | **1,28** |
| Druhá technika | 0,45 | **0,68** |
| Základný režim | ×0,75 | ×0,75 (+ rýchlejšie zotavenie) |

Výsledok vo F1: hlavný atribút rastie v priemere ≈ +12 bodov za sezónu u 17–20-ročných (92 → 104 → 128 vo veku 17, 18, 20).

**Všeobecný rast ostatných 4 fyzických (gen 0,20 / 0,35 / 0,50; kalibrované ×2,0, V 60/40):**

| gen | Vek 30: medián / p90 / p99 / max | ≥170 (%) | ø m7 (vek 30) | ø top 3 (vek 30) | Vek 33: medián / p90 / p99 |
|---|---|---|---|---|---|
| 0,20 (×2 = 0,40) | 155 / 168 / 176 / 182 | 7,7 | 127 | 166 | 161 / 173 / 180 |
| 0,35 (×2 = 0,70) | 157 / 171 / 179 / 185 | 13,4 | 136 | 166 | 163 / 176 / 183 |
| 0,50 (×2 = 1,00) | 159 / 173 / 181 / 188 | 19,0 | 144 | 166 | 165 / 178 / 185 |

S tvojimi surovými koeficientmi (bez škály) dáva gen 0,20 / 0,35 / 0,50 vo veku 30 medián 138 / 139 / 140 a p99 156 / 157 / 158.

**Čítanie:** všeobecný rast je nízkoriziková páka – celá škála 0,20 → 0,50 zmení medián len o ~4 body OVR, lebo ostatné atribúty rastú pomaly a OVR odmeňuje najmä top 3. **Odporúčam gen 0,35 (kalibrovane 0,70)**; 0,50 zvyšuje p99 o 2 body a priemer všetkých siedmich atribútov (m7), 0,20 ich znižuje.

## 3. Kalibrovaná konfigurácia F1 – OVR podľa veku (V 60/40, VÝSLEDOK)

| Vek | Medián | p75 | p90 | p99 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 18 | 82 | 86 | 89 | 95 | 101 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| 20 | 99 | 103 | 107 | 114 | 123 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| 23 | 121 | 127 | 132 | 140 | 153 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| 25 | 134 | 140 | 146 | 155 | 167 | 4,7 | 0,2 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| 28 | 149 | 157 | 163 | 172 | 181 | 49,3 | 19,1 | 2,5 | 0,0 | 0,0 | 0,0 | 0,0 |
| 30 | 157 | 165 | 171 | 179 | 185 | 73,8 | 43,2 | 13,4 | 0,6 | 0,0 | 0,0 | 0,0 |
| 32 | 162 | 170 | 175 | 182 | 187 | 84,8 | 59,6 | 25,9 | 2,9 | 0,3 | 0,0 | 0,0 |
| 33 | 163 | 171 | 176 | 183 | 188 | 86,8 | 62,7 | 28,2 | 3,8 | 0,4 | 0,0 | 0,0 |
| 35 | 164 | 171 | 176 | 184 | 189 | 88,5 | 65,7 | 29,5 | 4,8 | 0,7 | 0,0 | 0,0 |

(podiely v % zo všetkých 10 000 jazdcov daného veku).

**OVR podľa veku a ligy (V 60/40)** – n = počet jazdcov v lige vo veku, potom medián, p90 a podiely v %:


*Vek 25*

| Liga | n | Medián | p90 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rookie | 1697 | 121 | 129 | 148 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Amateur | 3032 | 130 | 138 | 147 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Continental | 3074 | 137 | 146 | 157 | 3,3 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Pro | 1714 | 141 | 150 | 162 | 12,3 | 0,4 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Elite | 483 | 147 | 154 | 167 | 33,7 | 1,9 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |

*Vek 28*

| Liga | n | Medián | p90 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rookie | 1182 | 132 | 141 | 158 | 0,2 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Amateur | 2371 | 143 | 152 | 164 | 18,2 | 0,4 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Continental | 2997 | 151 | 161 | 172 | 55,3 | 15,3 | 0,3 | 0,0 | 0,0 | 0,0 | 0,0 |
| Pro | 2387 | 155 | 166 | 177 | 77,2 | 31,7 | 4,5 | 0,0 | 0,0 | 0,0 | 0,0 |
| Elite | 1063 | 162 | 170 | 181 | 93,9 | 64,4 | 12,2 | 0,1 | 0,0 | 0,0 | 0,0 |

*Vek 30*

| Liga | n | Medián | p90 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rookie | 965 | 138 | 147 | 163 | 3,7 | 0,1 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Amateur | 2039 | 149 | 159 | 168 | 49,7 | 8,2 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Continental | 2854 | 157 | 167 | 176 | 81,7 | 41,8 | 4,9 | 0,0 | 0,0 | 0,0 | 0,0 |
| Pro | 2687 | 162 | 173 | 183 | 94,9 | 62,4 | 20,2 | 0,3 | 0,0 | 0,0 | 0,0 |
| Elite | 1455 | 169 | 177 | 185 | 99,4 | 88,3 | 44,8 | 3,7 | 0,1 | 0,0 | 0,0 |

*Vek 33*

| Liga | n | Medián | p90 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rookie | 742 | 143 | 152 | 161 | 18,3 | 0,1 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Amateur | 1665 | 154 | 163 | 175 | 71,2 | 21,6 | 0,4 | 0,0 | 0,0 | 0,0 | 0,0 |
| Continental | 2625 | 161 | 170 | 178 | 92,6 | 57,2 | 12,8 | 0,0 | 0,0 | 0,0 | 0,0 |
| Pro | 2991 | 166 | 176 | 183 | 98,8 | 83,1 | 35,3 | 2,1 | 0,0 | 0,0 | 0,0 |
| Elite | 1977 | 173 | 181 | 188 | 100,0 | 97,4 | 71,9 | 16,1 | 2,0 | 0,0 | 0,0 |

*Vek 35*

| Liga | n | Medián | p90 | Max | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rookie | 686 | 144 | 152 | 159 | 21,3 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| Amateur | 1567 | 154 | 162 | 173 | 73,1 | 22,3 | 0,2 | 0,0 | 0,0 | 0,0 | 0,0 |
| Continental | 2553 | 162 | 170 | 181 | 93,5 | 59,3 | 10,5 | 0,0 | 0,0 | 0,0 | 0,0 |
| Pro | 3065 | 167 | 176 | 185 | 99,4 | 84,9 | 36,8 | 2,3 | 0,0 | 0,0 | 0,0 |
| Elite | 2129 | 174 | 181 | 189 | 100,0 | 98,7 | 72,9 | 19,3 | 3,1 | 0,0 | 0,0 |

*Liga je v simulácii daná kvótami postupu (EXP), nie pravidlom hry ani OVR; tabuľka ukazuje, ako sa OVR rozdeľuje medzi ligami, nie ligové limity.* Vo veku 30: Elite má medián 169 a 44,8 % jazdcov ≥170; Pro 20,2 %; Continental 4,9 %; Amateur a Rookie 0 %.

**Kariérne maximum OVR (maximum v celej kariére, %):**

| V | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 | Max |
|---|---|---|---|---|---|---|---|---|
| 60/40 | 88,70 | 66,37 | 30,84 | 5,12 | 0,74 | 0,00 | 0,00 | 189 |
| 75/25 | 91,00 | 73,48 | 41,78 | 11,48 | 3,14 | 0,26 | 0,00 | 192 |
| 80/20 | 91,78 | 75,21 | 44,93 | 14,16 | 4,75 | 0,55 | 0,00 | 193 |

## 4. Vývoj atribútov (priemer všetkých jazdcov, F1)

Hlavný 1/2/3 = 1., 2., 3. fyzický atribút prirodzeného plánu jazdca; ostatné = priemer ostatných 4 fyzických; technika 1/2 = dve techniky plánu.

| Vek | Hlavný 1 | Hlavný 2 | Hlavný 3 | Ostatné 4 | ø 7 fyz. | Top 3 | Technika 1 | Technika 2 | Najl. taktika | ø taktika | Skúsenosti (p5 / ø / p95) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 17 | 92 | 87 | 84 | 75 | 80 | 89 | 75 | 69 | 77 | 71 | 16 / 30 / 44 |
| 18 | 104 | 97 | 92 | 78 | 87 | 98 | 81 | 72 | 83 | 74 | 25 / 39 / 53 |
| 20 | 128 | 117 | 108 | 86 | 100 | 118 | 93 | 79 | 97 | 84 | 38 / 58 / 76 |
| 23 | 155 | 141 | 128 | 96 | 115 | 141 | 110 | 87 | 118 | 99 | 60 / 92 / 118 |
| 25 | 165 | 152 | 138 | 101 | 123 | 152 | 120 | 93 | 133 | 108 | 75 / 115 / 147 |
| 28 | 174 | 163 | 150 | 109 | 132 | 162 | 134 | 100 | 152 | 122 | 97 / 151 / 192 |
| 30 | 177 | 167 | 155 | 113 | 136 | 166 | 142 | 105 | 162 | 129 | 111 / 172 / 199 |
| 33 | 177 | 168 | 157 | 114 | 137 | 167 | 151 | 111 | 172 | 138 | 135 / 188 / 200 |
| 35 | 175 | 166 | 156 | 112 | 135 | 166 | 156 | 115 | 176 | 142 | 150 / 193 / 200 |

Zdroje rastu priemerného OVR vek 17 → 30: fyzika (V) +41,1, Taktika +12,7, Technika +6,5, Skúsenosti +21,3 (spolu +81,6) – podiely 50 / 16 / 8 / 26 %. V C-073 išlo 69 % rastu OVR zo Skúseností; v F je to 26 %.

## 5. Pevný plán vs. strategické striedanie (smart režim, V 60/40)

| Variant | Vek 30: medián / p90 / p99 / max | ≥170 / ≥180 (%) | Vek 33: medián / p90 / p99 / max | ≥170 / ≥180 (%) | Kariérne max ≥180 / ≥190 (%) |
|---|---|---|---|---|---|
| Pevný prirodzený plán | 157 / 171 / 179 / 185 | 13,4 / 0,63 | 163 / 176 / 183 / 188 | 28,2 / 3,83 | 5,12 / 0,00 |
| Striedanie (2 sezóny prirodzený, 1 susedný) | 155 / 169 / 176 / 185 | 8,1 / 0,19 | 161 / 173 / 181 / 189 | 19,8 / 1,71 | 2,47 / 0,01 |
| Adaptívny (prechod pri nasýtení hlavného) | 157 / 170 / 178 / 186 | 11,2 / 0,48 | 163 / 175 / 182 / 189 | 25,2 / 3,40 | 4,61 / 0,04 |
| Náhodný plán každý týždeň | 150 / 162 / 170 / 181 | 1,3 / 0,04 | 156 / 168 / 177 / 188 | 6,9 / 0,50 | 0,92 / 0,01 |

*Disciplína 30* = priemer troch hlavných fyzických atribútov prirodzeného plánu vo veku 30: pevný 166 / striedanie 164 / adaptívny 166 / náhodný 151.

**Čítanie:** pevný plán je najlepší pre hlavnú disciplínu; striedanie ani adaptívny výber ju nezlepšia (OVR o 0–2 nižšie, disciplína o 0,6–2 nižšia). Rozdiel oproti náhodnému plánu je jasný (≈7 bodov v mediáne, ≈9 v p90, ≈15 bodov v disciplíne). Striedanie plánov nemá v tomto nastavení výhodu – nezdôvodňuj ním zložitosť UI, kým nebudeme mať dôvod (napr. strop jedného atribútu).

## 6. Režimy tréningu so skutočnou energiou a únavou

| Režim | Vek 30: medián / p90 / p99 / max | ≥170 / ≥180 (%) | Vek 33: medián / p90 / p99 / max | ≥170 / ≥180 (%) | Kariérne max ≥180 / ≥190 (%) | Ø únava týždeň | Ø únava po Tour-e | Podiel základných týždňov |
|---|---|---|---|---|---|---|---|---|
| Plnohodnotný 100 % | 154 / 167 / 176 / 184 | 6,2 / 0,12 | 160 / 173 / 181 / 187 | 17,8 / 1,58 | 2,39 / 0,00  40,6 | 49,9 | 0,00 |
| Základný 75/25 | 155 / 168 / 176 / 183 | 6,8 / 0,07 | 161 / 173 / 180 / 186 | 19,2 / 1,39 | 2,14 / 0,00  28,7 | 40,9 | 1,00 |
| Základný 2 týždne po Tour-e | 157 / 170 / 178 / 184 | 11,1 / 0,33 | 163 / 175 / 182 / 188 | 25,8 / 2,95 | 4,15 / 0,00  29,7 | 42,3 | 0,82 |
| Náhodný režim 50:50 | 156 / 168 / 176 / 184 | 8,1 / 0,18 | 161 / 174 / 181 / 187 | 21,4 / 1,96 | 2,92 / 0,00  34,0 | 44,9 | 0,50 |
| Smart prah 15 | 155 / 168 / 176 / 184 | 7,6 / 0,15 | 161 / 173 / 181 / 187 | 20,5 / 1,79 | 2,65 / 0,00  28,7 | 41,1 | 1,00 |
| Smart prah 25 (odporúčaný) | 157 / 171 / 179 / 185 | 13,4 / 0,63 | 163 / 176 / 183 / 188 | 28,2 / 3,83 | 5,12 / 0,00  31,5 | 44,5 | 0,56 |
| Smart prah 35 | 158 / 171 / 179 / 185 | 13,6 / 0,62 | 163 / 176 / 183 / 188 | 28,4 / 3,84 | 5,05 / 0,00  33,6 | 45,6 | 0,37 |
| Smart prah 45 | 156 / 170 / 177 / 184 | 10,6 / 0,32 | 162 / 175 / 182 / 188 | 25,1 / 2,84 | 4,08 / 0,00  36,5 | 47,2 | 0,18 |

**Zotavenie po Tour-e (deterministický výpočet, F = 50 po Tour-e, záťaž pokračuje):** F na začiatku 1.–6. týždňa po Tour-e a účinnosť eff (v zátvorke)

| Regenerácia | Režim | T1 | T2 | T3 | T4 | T5 | Rovnováha F |
|---|---|---|---|---|---|---|---|
| 20 | plnohodnotný | 50 (0,35) | 43 (0,44) | 39 (0,53) | 36 (0,58) | 35 (0,60) | 32,9 |
| 20 | základný | 50 (0,35) | 30 (0,69) | 22 (0,85) | 19 (0,91) | 18 (0,94) | 17,4 |
| 50 | plnohodnotný | 50 (0,35) | 39 (0,52) | 34 (0,63) | 31 (0,68) | 29 (0,71) | 28,0 |
| 50 | základný | 50 (0,35) | 26 (0,77) | 19 (0,92) | 17 (0,97) | 16 (0,98) | 15,4 |
| 90 | plnohodnotný | 50 (0,35) | 34 (0,62) | 28 (0,75) | 25 (0,80) | 24 (0,82) | 23,3 |
| 90 | základný | 50 (0,35) | 22 (0,87) | 15 (1,00) | 14 (1,00) | 14 (1,00) | 13,5 |

**Čítanie:**
- Základný režim dostane F pod 25 za 1 týždeň po Tour-e pri Regenerácii 90 a za 2 týždne pri Regenerácii 50 a 20; plnohodnotný režim sa pod 25 nedostane pri Regenerácii 50 a 20 vôbec (rovnováha 28 a 33) a pri 90 až po 3–4 týždňoch. Základný teda **umožňuje zotavenie po Tour-e**, plnohodnotný ho výrazne spomaľuje.
- **100 % nie je vždy optimálne:** plnohodnotný režim je v mediáne o 3 body horší než smart a nižší než základný. Platí to hlavne pre nízku Regeneráciu; pri Regenerácii 90 je plnohodnotný lepší než základný (viď nižšie).
- Rozdiely OVR medzi režimami sú malé (2–4 body). Dôvod: OVR nezávisí od aktuálnej únavy a v jednej sezóne je len ~6 tréningových týždňov; únava sa prejaví na kvalite výsledkov etáp (postup) a na raste atribútov, nie priamo na OVR.

**Interakcia Regenerácie a režimu** (ostatné skryté vlastnosti z populácie; vek 30, medián OVR / p90):

| Regenerácia | Plnohodnotný | Základný | Smart (25) |
|---|---|---|---|
| 20 | 151 / 163 | 153 / 166 | 155 / 168 |
| 50 | 154 / 167 | 155 / 168 | 157 / 171 |
| 90 | 158 / 171 | 157 / 170 | 160 / 174 |

## 7. Skryté vlastnosti (Potenciál, Trénovateľnosť, Profesionalita, Regenerácia, Vitalita)

**Izolovaný efekt jednej vlastnosti** (ostatné štyri = 50; všetci jazdci rovnakí; vek 30; V 60/40; medián OVR / p90):

| Vlastnosť | 20 | 50 | 80 | Rozdiel 80 − 20 |
|---|---|---|---|---|
| Potenciál | 146 / 153 | 159 / 166 | 167 / 174 | +21 |
| Trénovateľnosť | 150 / 158 | 159 / 166 | 165 / 170 | +15 |
| Profesionalita | 156 / 163 | 159 / 166 | 161 / 168 | +5 |
| Regenerácia | 157 / 163 | 159 / 166 | 161 / 168 | +4 |
| Vitalita | 158 / 165 | 159 / 166 | 161 / 168 | +3 |

**Terciely v celej populácii (vek 30, V 60/40; medián OVR / podiel ≥170 %):**

| Vlastnosť | Nízky | Stredný | Vysoký |
|---|---|---|---|
| Potenciál | 148 / 0,0 | 158 / 6,8 | 165 / 32,6 |
| Trénovateľnosť | 151 / 2,4 | 158 / 11,3 | 163 / 26,1 |
| Profesionalita | 156 / 9,5 | 158 / 13,9 | 159 / 16,6 |
| Regenerácia | 155 / 8,7 | 158 / 12,8 | 159 / 18,3 |
| Vitalita | 156 / 9,5 | 158 / 13,2 | 159 / 17,2 |

**Prečo sa efekty nenásobia do extrémne slabého rastu:** modifikátor rýchlosti rastu je aditívny. Rozdelenie násobiča rýchlosti v populácii:

| Model | p5 | p25 | medián | p75 | p95 | max |
|---|---|---|---|---|---|---|
| F (aditívny G) | 0,77 | 0,90 | 1,00 | 1,09 | 1,23 | 1,47 |
| E (súčin τ·π·ρ·rýchlosť Potenciálu) | 0,50 | 0,69 | 0,83 | 1,00 | 1,25 | 1,83 |

V modeli E bol medián súčinu 0,83 (systematický útlm) a p5 = 0,50; v F je medián 1,00 a p5 = 0,77. Regenerácia a Vitalita už nejdú do rýchlosti rastu, ale do energie a poklesu, takže nemôžu rast „zdvojene“ brzdiť.

**Potenciál** pôsobí dvojako: (1) osobný mäkký strop `Cap = 130 + Potenciál` a (2) rýchlosť (+10 % na z = 1). Je to najsilnejšia vlastnosť (80 vs 20: +21 OVR), nasleduje Trénovateľnosť (+15); Profesionalita, Regenerácia a Vitalita pridávajú +3 až +5 – **ak ich chceš silnejšie, treba zvýšiť váhy wPr (0,15) alebo zaviesť ďalšie efekty; návrh je zámerne konzervatívny.**

## 8. Priemerný jazdec, dobrý talent, výnimočný talent

Skryté vlastnosti sú pre celú skupinu pevné (všetci jazdci ostatné atribúty a archetyp ako v populácii), dobrý manažér (pevný prirodzený plán, smart režim). Priemerný = Pot/Tr/Pro/Reg/Vit 50; dobrý talent = 75/70/65/60/60; výnimočný = 92/85/75/70/70.

| Skupina | Vek 20 | Vek 25 | Vek 28 | Vek 30 | Vek 33 | Vek 35 |
|---|---|---|---|---|---|---|
| **priemerný jazdec** (medián / p90 / max) | 99 / 106 / 120 | 134 / 142 / 152 | 150 / 159 / 166 | 159 / 166 / 171 | 165 / 169 / 175 | 165 / 169 / 174 |
| **dobrý talent** (medián / p90 / max) | 105 / 112 / 127 | 149 / 156 / 165 | 166 / 174 / 180 | 175 / 180 / 184 | 181 / 184 / 188 | 182 / 185 / 189 |
| **výnimočný talent** (medián / p90 / max) | 109 / 117 / 132 | 156 / 163 / 172 | 173 / 180 / 186 | 181 / 185 / 189 | 187 / 189 / 193 | 188 / 190 / 194 |

(V 60/40.) S V 75/25: vek 33 medián / max – priemerný jazdec 168 / 177; dobrý talent 185 / 191; výnimočný talent 190 / 195.

| Skupina | Kariérne max ≥170 (%) | ≥180 (%) | ≥185 (%) | ≥190 (%) | Max | Vek 30: ø top 3 / ø m7 | Skúsenosti 200: medián veku |
|---|---|---|---|---|---|---|---|
| priemerný jazdec | 10,9 | 0,0 | 0,0 | 0,0 | 175 | 168 / 137 | 32 |
| dobrý talent | 98,9 | 72,5 | 14,3 | 0,0 | 189 | 191 / 154 | 32 |
| výnimočný talent | 99,9 | 96,2 | 85,9 | 16,1 | 194 | 199 / 162 | 32 |
| priemerný jazdec / zlý manažér (náhodný plán, 100 %) | 0,0 | 0,0 | 0,0 | 0,0 | 169 | 150 / 139 | 32 |
| dobrý talent / zlý manažér (náhodný plán, 100 %) | 63,3 | 8,9 | 0,2 | 0,0 | 187 | 169 / 158 | 32 |
| výnimočný talent / zlý manažér (náhodný plán, 100 %) | 99,9 | 75,5 | 30,9 | 4,7 | 193 | 184 / 172 | 32 |

**Čítanie:** vo veku 30 má dobrý talent medián OVR ~175, výnimočný ~181 (kariérne maximum až 194) a priemerný ~159. Moja definícia „dobrého talentu“ (Potenciál 75, Trénovateľnosť 70) je teda už na úrovni „špičkových“ (72 % dosiahne ≥180) – triedy sú ľubovoľné, nie ciele; zlý manažér (náhodný plán, vždy 100 %) strháva vo veku 30 priemerného jazdca o 11 bodov, dobrý talent o 13 a výnimočný o 9. Pri V 60/40 dosiahne kariérne OVR 190+ až skupina výnimočných talentov (percento v tabuľke vyššie); v celej populácii je 190+ rovné 0 %, lebo kombinácie skrytých vlastností ako Potenciál 92 a Trénovateľnosť 85 vznikajú pri rozdelení N(50; 20) len zriedka. 190+ je teda dosiahnuteľné iba pre extrémne talenty, čo je v súlade so zadaním „iba vzácne“.

**Technika – koľko sezón potrebuje talent** (priemerná hlavná technika plánu v populácii s danými vlastnosťami, štart ~75 vo veku 17; prvý vek, v ktorom priemer dosiahne hranicu; „–“ = nedosiahne do 35):

| Skupina | 120 | 150 | 170 |
|---|---|---|---|
| priemerný jazdec | 26 (9 sezón) | 33 (16 sezón) | – |
| dobrý talent | 24 (7 sezón) | 29 (12 sezón) | 35 (18 sezón) |
| výnimočný talent | 23 (6 sezón) | 27 (10 sezón) | 31 (14 sezón) |

Technika sa trénuje súčasne s fyzikou (bez nákladu na čas), preto jej tempo určuje len koeficient: s techScale 1,5 dosiahne dobrý talent 150 až vo veku 29. Vyššie techScale nie je testované.

## 9. Vzorec V: 60/40 vs. 75/25 vs. 80/20 (vzorec OVR sa nemení; len porovnanie)

**Vek 30** (F1):

| V (TOP 3 / všetkých 7) | Medián | p90 | p99 | Max | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|
| 60/40 | 157 | 171 | 179 | 185 | 13,36 | 0,63 | 0,02 | 0,00 | 0,00 |
| 75/25 | 160 | 174 | 182 | 188 | 21,85 | 2,71 | 0,27 | 0,00 | 0,00 |
| 80/20 | 161 | 175 | 183 | 190 | 24,74 | 3,85 | 0,51 | 0,01 | 0,00 |

**Vek 33** (F1):

| V (TOP 3 / všetkých 7) | Medián | p90 | p99 | Max | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|---|
| 60/40 | 163 | 176 | 183 | 188 | 28,21 | 3,83 | 0,39 | 0,00 | 0,00 |
| 75/25 | 166 | 179 | 186 | 191 | 38,26 | 9,53 | 2,18 | 0,14 | 0,00 |
| 80/20 | 167 | 180 | 187 | 193 | 41,56 | 11,95 | 3,35 | 0,29 | 0,00 |

**Čítanie:** pri 60/40 sa 190+ nedosiahne; pri 75/25 a 80/20 sa objaví v desatinách percenta vo veku 33 (kariérne maximum v tabuľke vyššie) a medián sa zvýši o 3 a 4 body. Pri zachovaní „iba vzácne 190+“ je **75/25 vhodnejší kompromis**; 80/20 zvyšuje ≥180 vo veku 33 na ~12 % (60/40: 3,8 %) (zvažuj, či to je „špičkoví“ alebo „bežní kvalitní“).

## 10. Taktika a skúsenosti z pretekov (samostatná kalibrácia)

| Variant | Vek 30 medián OVR / p90 / p99 | Najl. taktika vek 30 / vek 33 (ø) | Skúsenosti vek 30 / 33 (ø) | Skúsenosti 200: medián veku (podiel do 35) |
|---|---|---|---|---|
| tactK 9 | 154 / 168 / 176 | 143 / 153 | 172 / 188 | 32 (62,7 %) |
| tactK 12 (odporúčané) | 157 / 171 / 179 | 162 / 172 | 172 / 188 | 32 (62,7 %) |
| tactK 16 | 160 / 173 / 179 | 179 / 186 | 172 / 188 | 32 (62,8 %) |
| expK 10 | 152 / 165 / 173 | 162 / 172 | 135 / 161 | 34 (3,9 %) |
| expK 14 (odporúčané) | 157 / 171 / 179 | 162 / 172 | 172 / 188 | 32 (62,7 %) |
| expK 18 | 160 / 173 / 180 | 162 / 172 | 189 / 196 | 29 (85,1 %) |

**Presné vysvetlenie akumulácie (prah 12):** za každú odjazdenú etapu sa do akumulátora pripíše surová hodnota `expK × veľkosť`. Atribút stúpne o `floor(progress/12)`; zvyšok sa prenáša. Surový koeficient preto **nie je** prírastok atribútu: pri `expK = 14` a veľkosti etapy 1 je to 1,17 bodu; bežná sezóna (~10 etáp pre jazdca s plnou aktivitou) dá ~+11–12 bodov Skúseností. Posledných 15 bodov (185 → 200) sa spomaľuje (`taper`). Taktika rastie len na etapách, kde ju profil etapy vyžaduje (kopcovitá: Načasovanie/Reakcia/Úniky; horská: Manažment energie; časovka: iba Manažment energie), preto atribúty nerastú rovnako a nevzniká náhodný dominantný atribút.

**Čítanie:** `tactK 12` dá najlepšiu taktiku ~162 vo veku 30 a ~172 vo veku 33 (priemer), Skúsenosti 200 vo veku 32 (p5–p95: 30–34) pre aktívnych jazdcov; 62,7 % jazdcov dosiahne 200 do 35 rokov (zvyšok majú nižšiu aktivitu). Zvýšenie `tactK` z 9 na 16 zvyšuje medián OVR o 6 bodov, `expK` 10 → 18 o 8 – **taktika a skúsenosti sú preto veľká páka na výšku OVR a vyžadujú vedomé rozhodnutie**, nie len „opraviť“ koeficient.

## 11. Osobný strop (mäkký vs. tvrdý vs. žiadny)

| Variant | Vek 30: medián / p90 / p99 / max | ≥170 / ≥180 (%) | Vek 33: medián / p90 / p99 / max | ≥170 / ≥180 (%) | Kariérne max ≥180 / ≥190 (%) |
|---|---|---|---|---|---|
| Mäkký strop (F1, Cap = 130 + Pot) | 157 / 171 / 179 / 185 | 13,4 / 0,63 | 163 / 176 / 183 / 188 | 28,2 / 3,83 | 5,12 / 0,00 |
| Tvrdý strop | 156 / 170 / 178 / 184 | 10,5 / 0,42 | 161 / 174 / 182 / 188 | 22,6 / 2,51 | 3,53 / 0,00 |
| Žiadny strop, Potenciál = rýchlosť (+0,4·z) | 162 / 174 / 181 / 186 | 24,5 / 1,77 | 169 / 179 / 185 / 190 | 48,3 / 9,40 | 11,56 / 0,05 |

**Čítanie:** rozdiel medzi mäkkým a tvrdým stropom je malý (medián 1 bod, p99 1 bod); bez stropu je medián o 5 bodov vyšší a kariérne maximum ≥180 viac než dvojnásobné (11,6 % vs 5,1 %). **Odporúčam mäkký strop** (nezavádza pevné číslo, zachová vzácnosť legiend aj rozhodovanie manažéra). Žiadny strop OVR sa nezavádza.

## 12. Konkrétne kariéry (F1; výber podľa pravidiel, nie ručne)

Formát: vek → OVR (V 60/40; V 75/25); 7 fyzických atribútov (Stúpanie, Kopce, Rovina, Šprint, Časovka, Vytrvalosť, Akcelerácia); najlepšia taktika T, najlepšia technika Te, skúsenosti S; liga. Dráha: R Rookie, A Amateur, C Continental, P Pro, E Elite (jeden znak = sezóna od 17 rokov). Skryté vlastnosti: Pot/Tr/Pro/Reg/Vit.

**medián** – Rovinár, plán Rovina, vlastnosti 72/7/34/100/53, dráha `RRAAARAACCCCCCCEEE`

- 17: OVR 77 (78); [68, 66, 97, 76, 74, 94, 80]; T 73, Te 78, S 43; Rookie
- 20: OVR 97 (99); [78, 76, 130, 86, 101, 115, 90]; T 83, Te 94, S 69; Amateur
- 25: OVR 131 (135); [96, 94, 187, 104, 151, 155, 108]; T 94, Te 125, S 100; Continental
- 30: OVR 157 (161); [107, 105, 200, 115, 173, 177, 119]; T 116, Te 145, S 168; Continental
- 33: OVR 165 (169); [109, 107, 198, 117, 176, 184, 121]; T 126, Te 153, S 197; Pro
- 35: OVR 167 (171); [109, 107, 198, 115, 176, 186, 119]; T 130, Te 158, S 199; Pro

**dobrý talent (p90)** – Vrchár, plán Stúpanie, vlastnosti 85/53/66/45/55, dráha `RRRRAAACEEEPPPPPPP`

- 17: OVR 76 (77); [99, 79, 78, 63, 56, 100, 71]; T 72, Te 71, S 37; Rookie
- 20: OVR 100 (102); [136, 103, 89, 74, 67, 130, 82]; T 89, Te 89, S 68; Rookie
- 25: OVR 141 (144); [185, 135, 104, 89, 82, 172, 97]; T 135, Te 115, S 134; Pro
- 30: OVR 171 (175); [200, 158, 115, 100, 93, 198, 108]; T 183, Te 134, S 198; Elite
- 33: OVR 175 (179); [200, 163, 116, 101, 94, 200, 109]; T 197, Te 141, S 200; Elite
- 35: OVR 175 (180); [200, 164, 115, 98, 93, 200, 106]; T 199, Te 145, S 200; Elite

**výnimočný (najvyššie OVR)** – Časovkár, plán Časovka, vlastnosti 89/83/53/34/88, dráha `RRAACCEEPPPPPPPPPP`

- 17: OVR 80 (82); [80, 69, 104, 76, 102, 83, 66]; T 84, Te 86, S 31; Rookie
- 20: OVR 116 (118); [99, 88, 144, 95, 164, 134, 85]; T 104, Te 116, S 51; Amateur
- 25: OVR 160 (165); [118, 107, 186, 114, 200, 185, 104]; T 166, Te 149, S 116; Elite
- 30: OVR 185 (188); [129, 118, 200, 125, 200, 197, 115]; T 200, Te 163, S 196; Elite
- 33: OVR 188 (191); [137, 126, 200, 132, 200, 200, 122]; T 200, Te 173, S 200; Elite
- 35: OVR 187 (191); [136, 125, 200, 130, 200, 199, 120]; T 200, Te 175, S 200; Elite

**vrchár (p90)** – Vrchár, plán Stúpanie, vlastnosti 85/53/66/45/55, dráha `RRRRAAACEEEPPPPPPP`

- 17: OVR 76 (77); [99, 79, 78, 63, 56, 100, 71]; T 72, Te 71, S 37; Rookie
- 20: OVR 100 (102); [136, 103, 89, 74, 67, 130, 82]; T 89, Te 89, S 68; Rookie
- 25: OVR 141 (144); [185, 135, 104, 89, 82, 172, 97]; T 135, Te 115, S 134; Pro
- 30: OVR 171 (175); [200, 158, 115, 100, 93, 198, 108]; T 183, Te 134, S 198; Elite
- 33: OVR 175 (179); [200, 163, 116, 101, 94, 200, 109]; T 197, Te 141, S 200; Elite
- 35: OVR 175 (180); [200, 164, 115, 98, 93, 200, 106]; T 199, Te 145, S 200; Elite

**šprintér (p90)** – Šprintér, plán Šprint, vlastnosti 63/54/49/85/59, dráha `RRRRARACACCCACCCEE`

- 17: OVR 71 (71); [68, 73, 75, 82, 72, 69, 83]; T 76, Te 74, S 34; Rookie
- 20: OVR 98 (99); [80, 85, 101, 121, 84, 81, 115]; T 103, Te 93, S 65; Rookie
- 25: OVR 140 (143); [96, 101, 136, 174, 100, 97, 160]; T 149, Te 121, S 128; Amateur
- 30: OVR 171 (174); [109, 114, 160, 193, 113, 110, 186]; T 191, Te 145, S 195; Continental
- 33: OVR 175 (179); [112, 118, 164, 194, 117, 114, 189]; T 198, Te 155, S 200; Pro
- 35: OVR 175 (179); [112, 117, 164, 191, 116, 115, 187]; T 199, Te 160, S 200; Pro

**univerzál (p90)** – Univerzál, plán Vytrvalosť/Univerzál, vlastnosti 99/35/100/54/94, dráha `RACCCEEEPPPPPPPPPP`

- 17: OVR 79 (79); [89, 91, 85, 88, 85, 87, 86]; T 81, Te 79, S 41; Rookie
- 20: OVR 106 (107); [116, 103, 97, 100, 119, 128, 98]; T 96, Te 99, S 79; Continental
- 25: OVR 147 (149); [150, 119, 113, 116, 163, 181, 114]; T 125, Te 126, S 156; Elite
- 30: OVR 171 (174); [170, 128, 122, 125, 187, 200, 123]; T 155, Te 143, S 200; Elite
- 33: OVR 176 (180); [178, 132, 126, 128, 196, 200, 126]; T 169, Te 150, S 200; Elite
- 35: OVR 178 (181); [179, 131, 125, 126, 197, 200, 124]; T 175, Te 155, S 200; Elite

## 13. Odporúčaná konfigurácia a otvorené rozhodnutia

**Odporúčam na schválenie (nič neimplementované):**
1. **Koeficienty:** fyzické 2,30 / 1,90 / 1,50, ostatné 4 fyzické 0,70 (gen 0,35 × 2), technika 1,28 / 0,68 (alebo viac, ak chceš výraznejšiu techniku). Pomery tvojich štartovných hodnôt sú zachované; **absolútna výška musí byť ~2× vyššia, inak 170+ nikto nedosiahne.**
2. **Režimy:** základný (75 % + zotavenie) a plnohodnotný (100 %); manažér má reálne dôvody prepínať (po Tour-e a pri nízkej Regenerácii základný, pri vysokej Regenerácii plnohodnotný). V simulácii „smart“ s prahom únavy 25–35 vyhráva o 2–4 body OVR.
3. **Plány:** pevný prirodzený plán je optimum; striedanie plánov je v tomto nastavení neefektívne.
4. **Skryté vlastnosti:** aditívny modifikátor G (Trénovateľnosť 0,30, Profesionalita 0,15, Potenciál 0,10 + mäkký strop `130 + Potenciál`), Regenerácia → zotavenie, Vitalita → pokles a záťaž únavy.
5. **Taktika/skúsenosti:** `tactK = 12`, `expK = 14` (prah 12; prírastok = raw/12).
6. **Vzorec V:** pri 60/40 nie je 190+ dosiahnuteľné; ak chceš „vzácne 190+“, použi aspoň 75/25 (desatiny percenta). Rozhodnutie je na tebe – OVR vzorec zatiaľ nemením.

**Obmedzenia a čo je potrebné rozhodnúť:**
- Priemerný jazdec dosiahne OVR ~159 (medián populácie 157): ak je to príliš vysoko, zníž cScale na 1,8 (medián 155, p90 168, p99 176) – cena: 170+ je potom iba 7,9 % vo veku 30.
- Raný rast je rýchly (hlavný atribút 92 → 128 do 20 rokov); ak má byť pomalší, treba nižší `α(vek)` v 17–22 rokoch (PROD tabuľka sa tu nemení).
- Energia a únava sú EXP: produkčné Condition/Fatigue majú iné konštanty (ENERGY_COST 5/10/15, FATIGUE_GAIN 5/10/18). Model F je zjednodušený na jeden stav; pred implementáciou treba prepojiť s reálnym systémom.
- Postup medzi ligami je v simulácii daný kvótami (30/25/20/15 % hore), nie pravidlami hry; „Elite“ v tabuľkách preto nie je dôkaz o kvalite tréningu.
- Sezónny kalendár: 3 Tour-y (týždne 2, 5, 7) ako v C-073; ak sa prijme 4. Tour, ubudne 1 z ~6 tréningových týždňov za sezónu (nie je simulované, odhad ≈ −1/6 rastu).
- Technika sa trénuje spolu s fyzikou a nestojí čas – ak má mať cenu, treba samostatný plán alebo nižší podiel fyziky.
- Výsledky etáp (promotion) sú experimentálny index, nie reálny Race Engine.

## 14. Rozlíšenie PROD / EXP / VÝSLEDOK / ODPORÚČANIE

- **PROD:** `ageFactor`, prah akumulátora 12, 1 sezóna = +1 rok, kalendár a týždne Tour-ov, OVR sa nepoužíva v Race Engine ani v postupe.
- **EXP:** celý model F (kap. 1), štartovná populácia (OVR ~75, skryté vlastnosti ~N(50; 20), Skúsenosti 15–45), 7 plánov, režimy, energia a únava, rast Skúseností/Taktiky z pretekov, pokles s Vitalitou, MS každú druhú sezónu pre Continental+, postup podľa výsledkov etáp.
- **VÝSLEDOK:** tabuľky v kap. 0–12.
- **ODPORÚČANIE:** kap. 13.
