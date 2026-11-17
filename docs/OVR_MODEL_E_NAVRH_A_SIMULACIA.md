# Model E – realistický tréning od OVR 75 (matematický návrh na schválenie)

Stav: **iba návrh a izolovaná simulácia. Produkčný kód, DB, migrácie a herné pravidlá sa nezmenili.** Nič z toho nie je schválené; čaká sa na tvoje rozhodnutie o modeli.

Značenie: **PROD** = produkčný kód, **EXP** = experimentálne pravidlo, **VÝSLEDOK** = reálne spustený beh, **ODPORÚČANIE** = návrh na rozhodnutie.
Reprodukcia: `apps/web/src/lib/training/sim/career3/` (`modelE.ts`, `careerE.cli.ts`, `extraE.cli.ts`, `extraE2.cli.ts`), seed 20261116, 10 000 kariér na variant, rovnaká štartovná populácia (priemerné OVR 75) a rovnaké šumové semená ako v C-073. Výstupy `docs/audit-ovr-career/careerE_*.json`, graf `modelE_graf.png`.

## 0. Zhrnutie a poctivé vyhodnotenie cieľov

**Model E rieši príčiny z C-073, nie násobok:** osobný strop z Potenciálu (aktívny od OVR 75), vážený fyzický tréning (hlavný + 3 súvisiace atribúty + minimálny zvyšok), samostatný technický tréning s cenou v čase a prepojenie skrytých vlastností na rýchlosť aj strop.

1. Vek 30: medián OVR 146, p75 155, p90 161, p99 171, maximum 181 (v A–D bolo maximum vo veku 30 128–147).
2. Kariérne maximum OVR (E-soft): ≥160 u 25,0 %, ≥170 u 4,4 %, ≥175 u 1,1 %, ≥180 u 0,06 %, **≥185 a ≥190 u 0 %**.
3. **Cieľ „iba malé percento jazdcov OVR 190+“ model E nesplnil – 0 zo 10 000 pri kandidátskom vzorci 60/40.** Dôvod je vo vzorci OVR (kap. 7): dokonalý špecialista (200/200/200 + štyri 100) s najlepšou taktikou 190, technikou 190 a skúsenosťami 200 má OVR 184. OVR 190 si vyžaduje aj priemerné atribúty (štyri okolo 150).
4. Elite (vek 30): medián OVR 159, p90 169, 7,9 % ≥170 – „v Elite môžu pôsobiť jazdci s OVR 170“ platí. Priemerný jazdec (medián) končí okolo 146, nie 170.
5. **Rozhodnutie manažéra o tréningu:** pri rovnakom počte tréningových príležitostí je zlý (náhodný) tréning o 10–16 bodov slabší v hlavnej disciplíne, ale **OVR je rovnaké (146 vs 147)**, lebo OVR odmeňuje aj priemer všetkých siedmich, ktorý náhodný tréning zvyšuje. Pri kandidátskom vzorci je teda trénovať náhodne takmer rovnako dobré – presne to, čo si nechcel. Oprava: väčšia váha TOP 3 vo V (kap. 5 a 7).
6. **Technika:** dá sa cielene dotiahnuť (75 → 120/150/170 za 7/12/17 sezón pri cT 3,0 a 2 týždňoch ročne u dobrého talentu), ale cena fyzického tréningu je v E hlavne **oneskorenie**, lebo fyzické atribúty aj tak narazia na osobný strop (hlavný atribút vo veku 20: 173 vs 135 pri 0 vs 3 technických týždňoch).
7. Potenciál pôsobí už od OVR 75: terciely nízky/stredný/vysoký majú vo veku 30 medián OVR 136 / 147 / 155 a podiel ≥170 0 % / 0,06 % / 4,9 %.

**Čo model E nevyriešil (otvorené):** (a) vzorec OVR 60/40 neumožňuje OVR 190, (b) OVR nerozlišuje dobrý a zlý tréning, (c) raný rast je rýchly (ø fyzické atribúty z 80 na 100 do 20 rokov) a plató je okolo 28–30 rokov, (d) členstvo v Elite je v simulácii určené kvótami postupu (predpoklad), nie schopnosťami.

## 1. Prečo A–D zlyhali (príčiny)

| Príčina | Dôkaz z C-073 | Čo robí model E |
|---|---|---|
| Fyzický rast pomalý a len 2 atribúty | ΔV +6 za 13 sezón; ×10 stále nikto OVR 170 | Hlavný + 3 súvisiace s váhami 1 / 0,60 / 0,45 / 0,25 |
| Potenciál bez efektu pod priemerom výkonu 140 | A–C: terciely 106/107/106 | Osobný strop Cap = 120 + Potenciál od prvého týždňa |
| Technický tréning stojí fyzický rast a nič nevráti (+0,4) | `TECHNICAL_BASE` 2,0, max +1/týždeň | Samostatný model, cT 1–3 body/týždeň, strop +4/týždeň |
| OVR rastie zo Skúseností a Taktiky | 69 % + 19 % rastu OVR | Taktika rastie podľa situácií; otvorená otázka vzorca OVR |
| Jediný globálny násobok | ×25 → ×40: V ≥190 z 1,4 % na 22,8 % | Rast obmedzuje osobný strop, nie len čas |

## 2. Matematický návrh modelu E

Všetky vzorce sú v **bodoch** (očakávaný prírastok atribútu). Produkčný akumulátor s prahom **12** zostáva: za každé tréningové okno sa pripíše `progress += 12 × body` a atribút dostane `+ floor(progress / 12)`; zvyšok sa prenáša. Surový koeficient preto nie je prírastok – prírastok je `koeficient / 12` bodu.

### 2.1 Fyzický týždeň

Pre atribút j, jazdca i s hlavným zameraním f:

`body_j = cP × w_j(f) × τ × π × α(vek) × ρ × room_j`

- `cP = 3,2` bodu/týždeň pri τ = π = α = ρ = room = 1 (kalibračná konštanta; nastavená tak, aby dobrý talent dosiahol OVR 160–175; citlivosť v kap. 9).
- Váhy `w_j`: hlavný atribút 1,00; tri súvisiace 0,60 / 0,45 / 0,25 (Stúpanie → Vytrvalosť, Kopce, Časovka; Šprint → Akcelerácia, Rovina, Kopce; atď.); ostatné `ε = 0,04`.
- `τ = 0,6 + 0,8 × Trénovateľnosť/100` (0,6–1,4), `π = 0,85 + 0,30 × Profesionalita/100` (0,85–1,15), `ρ = 0,75 + 0,20 × Regenerácia/100` (0,75–0,95).
- `α(vek)` = produkčná tabuľka `ageFactor` (1,30 / 1,20 / 1,10 / 1,00 / 0,80 / 0,55 / 0,30), **PROD**.
- Plánovaných tréningových týždňov je ~5,2–5,7 za sezónu (z 10 týždňov odpadá týždeň 1 a týždne Tour-ov/MS) – **PROD kalendár**.

### 2.2 Osobný strop podľa Potenciálu (varianty A/B/C zo zadania)

`Cap_i = 120 + Potenciál_i` (Potenciál 1–100 → 121–220; fakticky orezané na 200 pre Potenciál ≥ 80). Strop jedného atribútu je `Cap_i − medzera`, kde medzera závisí od tvaru archetypu: prirodzené silné atribúty 0, neutrálne 20, prirodzené slabiny 45, univerzál 15 všade. Tak má sústredenie na správne atribúty zmysel (náhodný tréning plytvá na slabých atribútoch).

- **E-soft (mäkký strop, odporúčaný):** `room = 1 / (1 + exp((a − (Cap_a − 10)) / 7))` – rast sa plynule spomaľuje, pri strope je ešte 0,19 a jazdec môže strop pomaly prekročiť.
- **E-hard (tvrdý strop):** `room = clamp((Cap_a − a) / 30, 0, 1)` – nulový rast pri strope.
- **E-none (bez osobného stropu, možnosť C):** `room` = produkčný lokálny faktor (do 140 = 1, k 200 klesá na 0), Potenciál je len násobok rýchlosti `0,5 + Potenciál/100`.

Žiadny strop OVR podľa Potenciálu sa nezavádza; ide o strop atribútov (pri mäkkom variante prekročiteľný).

### 2.3 Technický týždeň

`body_k = cT × s × τ × π × ((1 + α)/2) × ρ × roomT(a_k)`, `roomT = clamp((200 − a)/60, 0,1, 1)`, `s` = podiel zamerania (1–2 atribúty: v nepárnych sezónach obe týždne na prvý, v párnych druhý týždeň na druhý), maximum +4 body za týždeň. Technický týždeň **nahrádza fyzický týždeň** (rovnaký rozpočet ~5,5 týždňa). Manažér volí 0–3 technické týždne ročne. `cT = 2,0` v základnej simulácii; sweep 1,0–3,0 v kap. 6. Rast techniky z pretekov sa nezavádza.

### 2.4 Skúsenosti a taktika (iba z pretekov)

Za každú odjazdenú etapu sa do akumulátora pripíše **surová hodnota**:

`raw_Skúsenosti = 14 × veľkosť_etapy × taper(S)`, `veľkosť = clamp(km/150, 0,3, 1,2)` (časovka 0,6, MS 1,0), `taper(S) = clamp((200 − S)/15, 0, 1)`.

Prírastok je `raw / 12` bodu: etapa veľkosti 1 dá 14/12 = **1,17 bodu Skúseností**, bežná sezóna s ~10 etapami +11–12 bodov, posledných 15 bodov sa spomaľuje. Štart 15–45 (priemer 30) → 200 vyžaduje ~14–15 sezón.
Výsledok: medián veku 200 = 32, p5–p95 = 30–34, dosiahne ich 62,9 % jazdcov do 35 (zvyšok má málo štartov – žiadny vekový zámok).

Taktika: pre každý taktický atribút `raw = 9 × váha_typu × váha_etapy × veľkosť × 0,956 × τ × α(vek) × taper`, `body = raw/12`. Váha typu je pevná podľa archetypu (napr. vrchár: Načasovanie útoku 1,0, Manažment energie 0,8), váha etapy podľa profilu (kopcovitá etapa zaťažuje Načasovanie/Reakciu/Úniky, horská Manažment energie, časovka len Manažment energie). Atribúty nerastú rovnako a nie je náhodný dominantný atribút. Výsledok: najlepšia taktika medián 142 vo veku 30 a 159 vo veku 35 (štart 77).

### 2.5 Päť skrytých vlastností

| Vlastnosť | Pôsobenie v modeli E | Medián OVR vek 30: nízky / stredný / vysoký terciel |
|---|---|---|
| Potenciál | osobný strop `Cap = 120 + Po` (silné atribúty) | 136 / 147 / 155 |
| Trénovateľnosť | τ: rýchlosť fyzického, technického aj taktického rastu (0,6–1,4) | 140 / 147 / 152 |
| Profesionalita | π: rýchlosť fyzického a technického rastu (0,85–1,15) | 145 / 147 / 147 |
| Regenerácia | ρ: efektivita týždňa (0,75–0,95) | 145 / 146,5 / 147 |
| Vitalita | začiatok poklesu 29–33, strata 0,8 + 0,4/rok (Šprint, Akcelerácia ×1,4; Vytrvalosť ×0,7) | (vek 35) 150 / 151 / 152 |

Profesionalita, Regenerácia a Vitalita majú slabý efekt (±1–2 OVR); ak majú byť výraznejšie, treba ich rozšíriť (otvorené rozhodnutie).

## 3. Výsledky – E-soft (VÝSLEDOK, 10 000 kariér)

| Vek | Medián | p75 | p90 | p99 | Max | ø fyz. (7) | Top 3 | Najl. taktika | Najl. technika | Skúsenosti p10 / medián / p90 |
|---|---|---|---|---|---|---|---|---|---|---|
| 20 | 99 | 104 | 108 | 115 | 125 | 100 | 124 | 91 | 79 | 38 / 59 / 76 |
| 25 | 127 | 134 | 140 | 150 | 160 | 120 | 153 | 117 | 83 | 73 / 118 / 149 |
| 28 | 140 | 148 | 155 | 165 | 175 | 127 | 160 | 132 | 85 | 93 / 157 / 193 |
| 30 | 146 | 155 | 161 | 171 | 181 | 131 | 162 | 142 | 86 | 107 / 183 / 199 |
| 32 | 150 | 158 | 165 | 174 | 183 | 132 | 163 | 150 | 87 | 122 / 197 / 200 |
| 35 | 151 | 159 | 165 | 174 | 182 | 129 | 160 | 159 | 87 | 143 / 200 / 200 |

Štart (vek 17): ø fyzické 80, top 3 = 89, najlepšia taktika a technika 77, skúsenosti ~30.

**Podiel jazdcov s OVR nad prahom (%) – celá populácia a samostatne Elite**

| Vek | Skupina | ≥150 | ≥160 | ≥170 | ≥180 | ≥185 | ≥190 | ≥195 |
|---|---|---|---|---|---|---|---|---|
| 25 | všetci | 1,08 | 0,02 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| 25 | Elite (n=483) | 7,9 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| 28 | všetci | 21,10 | 4,24 | 0,20 | 0,00 | 0,00 | 0,00 | 0,00 |
| 28 | Elite (n=1063) | 62,8 | 20,3 | 1,4 | 0,0 | 0,0 | 0,0 | 0,0 |
| 30 | všetci | 40,22 | 13,45 | 1,67 | 0,01 | 0,00 | 0,00 | 0,00 |
| 30 | Elite (n=1455) | 84,4 | 45,1 | 7,9 | 0,1 | 0,0 | 0,0 | 0,0 |
| 32 | všetci | 52,24 | 22,26 | 3,59 | 0,02 | 0,00 | 0,00 | 0,00 |
| 32 | Elite (n=1814) | 90,6 | 59,3 | 13,2 | 0,1 | 0,0 | 0,0 | 0,0 |
| 35 | všetci | 54,58 | 23,49 | 3,69 | 0,05 | 0,00 | 0,00 | 0,00 |
| 35 | Elite (n=2129) | 93,0 | 61,5 | 13,0 | 0,2 | 0,0 | 0,0 | 0,0 |

Kariérne maximum (celá kariéra) – E-soft: ≥150: 56,16 % / ≥160: 25,02 % / ≥170: 4,43 % / ≥180: 0,06 % / ≥185: 0,00 % / ≥190: 0,00 % / ≥195: 0,00 %. Najvyššie OVR v celom behu: 183.

**Porovnanie E s A–D (vek 30)**

| Model | Medián | p75 | p90 | p99 | Max | Kariérne max ≥160 / ≥170 / ≥180 |
|---|---|---|---|---|---|---|
| A produkcia (×1) | 107 | 113 | 117 | 124 | 128 | 0,0 / 0,0 / 0,0 % |
| B silnejší hlavný (×3) | 115 | 121 | 126 | 132 | 137 | 0,0 / 0,0 / 0,0 % |
| C hlavný+súvisiace (×3, 60/25/25/25) | 114 | 120 | 124 | 131 | 135 | 0,0 / 0,0 / 0,0 % |
| D skryté vlastnosti (×3 priem.) | 114 | 122 | 128 | 138 | 147 | 0,0 / 0,0 / 0,0 % |
| **E-soft (mäkký strop)** | 146 | 155 | 161 | 171 | 181 | 25,0 / 4,4 / 0,1 % |
| **E-hard (tvrdý strop)** | 144 | 152 | 159 | 170 | 179 | 18,5 / 2,8 / 0,0 % |
| **E-none (bez osobného stropu)** | 156 | 163 | 169 | 176 | 185 | 60,6 / 21,7 / 1,2 % |

**Vývoj OVR vo veku 20, 25, 28, 30, 32, 35 pre E-hard a E-none (medián / p90 / p99 / max)**

| Vek | E-hard | E-none |
|---|---|---|
| 20 | 99 / 107 / 114 / 125 | 100 / 110 / 118 / 128 |
| 25 | 126 / 139 / 149 / 160 | 133 / 146 / 155 / 164 |
| 28 | 138 / 153 / 164 / 174 | 148 / 162 / 171 / 180 |
| 30 | 144 / 159 / 170 / 179 | 156 / 169 / 176 / 185 |
| 32 | 147 / 163 / 173 / 182 | 161 / 172 / 179 / 188 |
| 35 | 148 / 163 / 173 / 181 | 162 / 173 / 179 / 187 |

## 4. Mäkký vs. tvrdý vs. žiadny osobný strop

| Kritérium | E-soft | E-hard | E-none |
|---|---|---|---|
| Medián OVR (vek 30) | 146 | 144 | 156 |
| p99 / max (vek 30) | 171 / 181 | 170 / 179 | 176 / 185 |
| Kariérne max ≥170 (%) | 4,4 | 2,8 | 21,7 |
| Kariérne max ≥180 (%) | 0,06 | 0,02 | 1,19 |
| Terciely Potenciálu: medián OVR (vek 30) | 136 / 147 / 155 | 133 / 145 / 153 | 148 / 156 / 161 |
| Terciely Potenciálu: podiel ≥170 (%) | 0,0 / 0,1 / 4,9 | 0,0 / 0,0 / 3,4 | 1,0 / 6,8 / 16,8 |
| Terciely Trénovateľnosti: medián OVR | 140 / 147 / 152 | 139 / 145 / 149 | 148 / 156 / 162 |
| Elite vek 30: medián / p90 / ≥170 (%) | 159 / 169 / 7,9 | 157 / 167 / 6,3 | 165 / 175 / 28,1 |

- **E-none** dáva priemernému jazdcovi OVR 156 (vek 30), 21,7 % jazdcov dosiahne kariérne OVR ≥170 a 1,2 % ≥180: príliš veľa vysokých OVR; zároveň Potenciál rozhoduje najviac (terciely ≥170: 1,0 / 6,8 / 16,8 %). Nezachováva vzácnosť legiend.
- **E-hard** má plató: zadržiava rast presne pri strope, tenší chvost (≥170 2,8 %), Potenciál má silný efekt (133 / 145 / 153), ale manažérske rozhodnutia po dosiahnutí stropu už nemajú význam.
- **E-soft** zachováva vzácnosť (≥170 4,4 %, ≥180 0,06 %) a necháva priestor pre manažérske rozhodnutia (strop sa dá pomaly prekročiť).

**Odporúčanie:** mäkký osobný strop (E-soft) so stropom atribútu podľa tvaru archetypu. Rozdiel medzi soft a hard je malý (medián +2, p99 +1); soft nemá tvrdé hrany, hard je vhodný, ak sa strop má hráčovi komunikovať ako pevný údaj.

## 5. Dobrý, priemerný a zlý tréning (kontrolované porovnanie)

Rovnakí 10 000 jazdci, rovnaké skryté vlastnosti, semená aj počet tréningových týždňov; mení sa len manažérske rozhodnutie. **Dobrý** = adaptívny (zameranie podľa archetypu, pri nasýtení atribútu prechod na ďalší; 0–3 technické týždne). **Priemerný** = stále hlavný atribút archetypu, bez techniky. **Zlý** = náhodný fyzický atribút každý týždeň.

| Rozhodnutie | OVR vek 30: medián / p90 / p99 | Top 3 | ø fyz. (7) | Hlavná disciplína: p10 / medián / p90 | Najl. technika | Kar. max ≥170 (%) |
|---|---|---|---|---|---|---|
| dobrý (adaptívny, 1 tech. týždeň) | 147 / 162 / 172 | 161 | 132 | 141 / 172 / 200 | 98 | 6,0 |
| dobrý bez techniky | 148 / 163 / 173 | 163 | 139 | 143 / 174 / 200 | 77 | 6,1 |
| dobrý, 2 tech. týždne | 145 / 159 / 169 | 157 | 124 | 139 / 170 / 197 | 111 | 3,5 |
| dobrý, 3 tech. týždne | 143 / 156 / 165 | 149 | 115 | 137 / 163 / 189 | 134 | 1,8 |
| priemerný (stále hlavný atribút) | 146 / 161 / 169 | 167 | 126 | 146 / 178 / 200 | 77 | 2,3 |
| zlý (náhodný fyzický fokus) | 146 / 161 / 171 | 156 | 143 | 138 / 162 / 186 | 77 | 5,1 |

*Hlavná disciplína* = priemer prirodzene silných atribútov archetypu (napr. Stúpanie a Vytrvalosť u vrchára); univerzáli nie sú zahrnutí. Podiel jazdcov, ktorí sa niekedy dostali do Elite (26,7–27,5 %), je pri všetkých rozhodnutiach rovnaký, lebo postup je v simulácii určený kvótami – nie je to dôkaz o hodnote tréningu.

**Závery:**
- Zlý tréning je o 10–16 bodov slabší v hlavnej disciplíne a o 5–11 v top 3, ale **OVR sa nelíši** (146 vs 147). V obsahuje 40 % priemeru siedmich atribútov, ktorý náhodný tréning zvyšuje (ø fyz. 143 vs 132).
- Priemerný (stále hlavný atribút) má najvyššiu hlavnú disciplínu (178 vs 172 u „dobrého“), lebo adaptívny tréning sa prepína na ďalší atribút skôr, než hlavný dosiahne strop. „Dobrý“ preto nie je jednoznačne najlepší: adaptívne prepínanie pomáha OVR a priemeru, nie špičke v jednej disciplíne.
- Technika: 1 týždeň ročne stojí −0,5 OVR (147,5 → 147), 2 týždne −2,5, 3 týždne −4,5 (vek 30); ø fyz. klesne z 139 na 132 / 124 / 115. Najlepšia technika stúpne 77 → 98 / 111 / 134, ale OVR ju odmeňuje len 10 % váhou.

**Vzácnosť rozpočtu (3 000 kariér, vek 30; OVR medián / top 3 / hlavná disciplína):** nižšie cP zväčšuje význam rozhodnutia, ale znižuje OVR.

| cP | Dobrý | Priemerný | Zlý (náhodný) |
|---|---|---|---|
| 2 | 139 / 150 / 164 | 140 / 157 / 168 | 136 / 139 / 144 |
| 2,6 | 144 / 157 / 170 | 143 / 163 / 174 | 142 / 149 / 154 |
| 3,2 | 147 / 161 / 172 | 146 / 167 / 178 | 146 / 156 / 162 |
| 4 | 150 / 164 / 174 | 148 / 171 / 180 | 150 / 161 / 168 |

**Ako by OVR odmeňoval sústredený tréning pri väčšej váhe TOP 3** (E-soft, vek 30; medián / p90 / p99):

| Rozhodnutie | V 60/40 (kandidát) | V 75/25 | V 85/15 |
|---|---|---|---|
| dobrý (1 tech. týždeň) | 147 / 162 / 172 | 149 / 166 / 176 | 151 / 168 / 179 |
| priemerný | 146 / 161 / 169 | 149 / 165 / 174 | 152 / 168 / 177 |
| zlý (náhodný) | 146 / 161 / 171 | 147 / 162 / 173 | 148 / 163 / 174 |

Pri V 85/15 je dobrý tréning o 3 body lepší v mediáne a o 5 v p90 než náhodný (pri kandidátskom 60/40 o 1 a 1). Náhodné trénovanie všetkých siedmich prestáva byť výhodné až pri väčšej váhe TOP 3.

## 6. Technický tréning – koľko sezón potrebuje talent

Deterministický model jedného jazdca (štart techniky 75, vek 17, 5,5 plánovaného týždňa ročne). Hodnoty = počet sezón od veku 17, po ktorých vybraná technika prvýkrát dosiahne 120 / 150 / 170; „–“ = nedosiahne do 25 sezón; v zátvorke hodnota po 25 sezónach.

**Dobrý talent** (Potenciál 75, Trénovateľnosť 70, Profesionalita 60, Regenerácia 60)

| cT (bodov/týždeň) | 1 týždeň ročne | 2 týždne ročne | 3 týždne ročne |
|---|---|---|---|
| 1 | – / – / – (98) | 24 / – / – (122) | 14 / – / – (145) |
| 1,5 | – / – / – (110) | 14 / – / – (145) | 9 / 16 / – (169) |
| 2 | 24 / – / – (122) | 10 / 19 / – (163) | 7 / 12 / 17 (183) |
| 3 | 14 / – / – (145) | 7 / 12 / 17 (183) | 5 / 8 / 11 (195) |

**Priemerný** (všetky 50)

| cT (bodov/týždeň) | 1 týždeň ročne | 2 týždne ročne | 3 týždne ročne |
|---|---|---|---|
| 1 | – / – / – (94) | – / – / – (113) | 18 / – / – (132) |
| 1,5 | – / – / – (104) | 18 / – / – (132) | 11 / 21 / – (158) |
| 2 | – / – / – (113) | 13 / 25 / – (150) | 8 / 15 / 23 (174) |
| 3 | 18 / – / – (132) | 8 / 15 / 23 (174) | 6 / 9 / 14 (190) |

**Výnimočný** (Potenciál 92, Trénovateľnosť 85, Profesionalita 75, Regenerácia 70)

| cT (bodov/týždeň) | 1 týždeň ročne | 2 týždne ročne | 3 týždne ročne |
|---|---|---|---|
| 1 | – / – / – (103) | 19 / – / – (130) | 12 / 23 / – (155) |
| 1,5 | – / – / – (116) | 12 / 23 / – (155) | 8 / 13 / 21 (178) |
| 2 | 19 / – / – (130) | 9 / 15 / 24 (172) | 6 / 10 / 14 (189) |
| 3 | 12 / 23 / – (155) | 6 / 10 / 14 (189) | 4 / 7 / 9 (199) |

**Cena v čase fyzického tréningu** (hlavný fyzický atribút od 96, mäkký strop; hodnoty vo veku 20 / 25):

| Profil (strop) | 0 tech. týždňov | 1 | 2 | 3 |
|---|---|---|---|---|
| dobrý talent (Cap 195) | 173 / 200 | 161 / 200 | 148 / 196 | 135 / 186 |
| priemerný (Cap 170) | 156 / 177 | 148 / 175 | 138 / 171 | 128 / 164 |
| výnimočný (Cap 212) | 187 / 200 | 172 / 200 | 157 / 200 | 142 / 200 |

**Čítanie:** pri cT 2,0 a 2 týždňoch ročne dostane dobrý talent techniku 75 → 120 za 10 sezón, → 150 za 19 sezón – na cieľ „150“ je to príliš pomalé. Pri cT 3,0 a 2 týždňoch je to 7 / 12 / 17 sezón, pri 3 týždňoch 5 / 8 / 11. **Odporúčam cT = 3,0 s manažérskou voľbou 1–3 technické týždne ročne** (plná špecializácia na 170 trvá 11–17 sezón). Cena: pri 3 týždňoch ročne je hlavný fyzický atribút vo veku 20 o ~38 bodov nižšie (135 vs 173); do 25 rokov to dobrý talent dobehne, lebo fyzické atribúty aj tak dosiahnu strop. Ak má byť cena trvalá, treba vzácnejší fyzický rozpočet (kap. 5, nižšie cP) – za cenu nižšieho OVR.

## 7. OVR a špecialisti

**Existujú špecialisti?** Áno. Vo veku 30 má 18,1 % jazdcov aspoň tri atribúty ≥160 a aspoň tri ≤120; ich medián OVR je 156 (max 178), kým jazdci bez slabého atribútu (všetkých 7 ≥130; n=632) majú medián 150 (max 176). Špecialista teda nie je penalizovaný – kandidátsky vzorec ho mierne zvýhodňuje. Najlepší špecialista (Puncheur) má vo veku 30 OVR 181 s fyzickými atribútmi 181 / 200 / 154 / 125 / 142 / 174 / 200.

**Strop kandidátskeho vzorca (analyticky; T = najlepšia taktika, Te = najlepšia technika, S = skúsenosti):**

| Profil | V 60/40 | OVR (T190, Te190, S200) | OVR (T170, Te175, S200) | V 75/25: max / typ | V 85/15: max / typ |
|---|---|---|---|---|---|
| špecialista 200/200/200 + 4×100 | 177,1 | 184 | 179 | 189 / 184 | 192 / 188 |
| špecialista 200/200/200 + 4×130 | 184,0 | 188 | 183 | 192 / 187 | 194 / 189 |
| špecialista 190/190/190 + 4×110 | 171,7 | 181 | 176 | 185 / 180 | 187 / 183 |
| špecialista 195/190/185/150/125/110/100 | 174,3 | 182 | 178 | 186 / 181 | 188 / 183 |
| univerzál 7×180 | 180,0 | 186 | 181 | 186 / 181 | 186 / 181 |
| univerzál 7×170 | 170,0 | 180 | 175 | 180 / 175 | 180 / 175 |
| takmer dokonalý 7×195 | 195,0 | 195 | 190 | 195 / 190 | 195 / 190 |

**Problém:** pri kandidátskom vzorci 60/40 má špecialista 200/200/200 + štyri 100 OVR 184 aj pri maximálnej taktike, technike a skúsenostiach – **nikdy nedosiahne 190**. OVR 190 dosiahne len jazdec s priemerom ostatných štyroch atribútov okolo 150 (200×3 + 4×130 dáva 188). To odporuje cieľu „špecialista môže dosiahnuť 190 bez výborných všetkých siedmich“.

**Alternatívy (zatiaľ nemeniť v produkcii):** (1) `V = 0,75·TOP3 + 0,25·priemer7` – špecialista 200/200/200 + 4×100 má 189 (max), typicky 184; (2) `V = 0,85·TOP3 + 0,15·priemer7` – 192 / 188; (3) ponechať 60/40 a znížiť váhu Skúseností/Taktiky. Simulácia (kariérne maximum OVR; „cesta k legende“ = dobrý tréning, 2 technické týždne, cT 3,0, taktika 12):

| Scenár | Vzorec | ≥170 | ≥175 | ≥180 | ≥185 | ≥190 | Max |
|---|---|---|---|---|---|---|---|
| základ E-soft (mix) | V 60/40 | 4,43 % | 1,14 % | 0,06 % | 0,00 % | 0,00 % | 183 |
| základ E-soft (mix) | V 75/25 | 9,46 % | 3,26 % | 0,65 % | 0,02 % | 0,00 % | 185 |
| základ E-soft (mix) | V 85/15 | 13,68 % | 5,87 % | 1,52 % | 0,10 % | 0,00 % | 187 |
| cesta k legende: dobrý, 2 tech. týždne, cT 3,0, taktika 12 | V 60/40 | 8,96 % | 2,58 % | 0,38 % | 0,01 % | 0,00 % | 185 |
| cesta k legende: dobrý, 2 tech. týždne, cT 3,0, taktika 12 | V 75/25 | 17,67 % | 7,16 % | 2,04 % | 0,22 % | 0,00 % | 188 |
| cesta k legende: dobrý, 2 tech. týždne, cT 3,0, taktika 12 | V 85/15 | 23,84 % | 11,72 % | 4,37 % | 1,10 % | 0,04 % | 190 |
| cesta k legende + 3 tech. týždne | V 60/40 | 5,20 % | 1,17 % | 0,17 % | 0,01 % | 0,00 % | 185 |
| cesta k legende + 3 tech. týždne | V 75/25 | 13,03 % | 4,38 % | 1,03 % | 0,13 % | 0,00 % | 189 |
| cesta k legende + 3 tech. týždne | V 85/15 | 20,23 % | 8,26 % | 2,52 % | 0,63 % | 0,05 % | 192 |

Aj pri „ceste k legende“ a vzorci 85/15 dosiahne OVR 190 len 0,04 % jazdcov (4 zo 10 000). Pre cieľ „malé percento 190+“ preto nestačí zmena váh V; treba aj väčší rast taktiky a techniky (v tejto simulácii vo veku 30 taktika medián 163, technika 129, pri 3 týždňoch 160) alebo širšie rozdelenie Potenciálu.

## 8. Konkrétne kariéry (E-soft; výber podľa pravidiel, nie ručne)

Formát: vek → OVR; fyzické atribúty (Stúpanie, Kopce, Rovina, Šprint, Časovka, Vytrvalosť, Akcelerácia); najlepšia taktika T, najlepšia technika Te, skúsenosti S; liga. Dráha: R Rookie, A Amateur, C Continental, P Pro, E Elite (jeden znak = sezóna od 17 rokov).

**priemerný jazdec** – Univerzál, stratégia priemerná, 223 etáp; Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 54/48/47/46/36; dráha `RRACACACAACCCCCCCC`

- 17: OVR 73; [77, 81, 80, 78, 81, 79, 83]; T 76, Te 73, S 37; Rookie
- 20: OVR 99; [79, 108, 95, 114, 83, 81, 142]; T 88, Te 73, S 71; Continental
- 25: OVR 130; [82, 143, 115, 153, 86, 84, 165]; T 113, Te 73, S 144; Amateur
- 30: OVR 146; [85, 157, 133, 162, 89, 87, 170]; T 133, Te 73, S 198; Continental
- 35: OVR 145; [79, 155, 136, 156, 83, 84, 162]; T 147, Te 73, S 200; Continental

**dobrý talent** – Šprintér, stratégia dobrá, 170 etáp; Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 69/66/21/69/59; dráha `RAAAAAACACCCECECEE`

- 17: OVR 78; [59, 80, 81, 103, 75, 67, 107]; T 80, Te 80, S 25; Rookie
- 20: OVR 106; [61, 94, 106, 159, 77, 69, 141]; T 104, Te 86, S 61; Amateur
- 25: OVR 140; [64, 123, 142, 191, 84, 75, 187]; T 137, Te 96, S 117; Amateur
- 30: OVR 161; [83, 158, 169, 193, 111, 96, 192]; T 162, Te 105, S 168; Continental
- 35: OVR 168; [95, 167, 168, 187, 127, 106, 188]; T 179, Te 108, S 199; Pro

**výnimočný talent** – Puncheur, stratégia dobrá, 253 etáp; Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 92/89/62/44/38; dráha `RRAACCEEEEPPPPPPPP`

- 17: OVR 77; [79, 101, 67, 78, 69, 85, 97]; T 84, Te 77, S 19; Rookie
- 20: OVR 109; [110, 172, 84, 80, 71, 87, 139]; T 112, Te 84, S 53; Amateur
- 25: OVR 151; [144, 200, 105, 110, 79, 100, 200]; T 167, Te 97, S 127; Pro
- 30: OVR 177; [190, 200, 114, 114, 99, 142, 200]; T 199, Te 108, S 198; Elite
- 35: OVR 179; [188, 200, 125, 113, 103, 152, 200]; T 200, Te 112, S 200; Elite

**vrchár** – Vrchár, stratégia dobrá, 151 etáp; Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 95/65/57/46/44; dráha `RACEEEPPPPPPPPPPPP`

- 17: OVR 84; [110, 91, 83, 75, 73, 109, 82]; T 87, Te 90, S 20; Rookie
- 20: OVR 114; [185, 125, 86, 78, 92, 154, 85]; T 99, Te 96, S 40; Pro
- 25: OVR 145; [200, 183, 109, 82, 120, 200, 118]; T 120, Te 107, S 76; Elite
- 30: OVR 161; [200, 196, 141, 85, 165, 200, 136]; T 143, Te 116, S 121; Elite
- 35: OVR 175; [200, 192, 160, 80, 166, 200, 131]; T 164, Te 120, S 190; Elite

**šprintér** – Šprintér, stratégia dobrá, 170 etáp; Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 69/66/21/69/59; dráha `RAAAAAACACCCECECEE`

- 17: OVR 78; [59, 80, 81, 103, 75, 67, 107]; T 80, Te 80, S 25; Rookie
- 20: OVR 106; [61, 94, 106, 159, 77, 69, 141]; T 104, Te 86, S 61; Amateur
- 25: OVR 140; [64, 123, 142, 191, 84, 75, 187]; T 137, Te 96, S 117; Amateur
- 30: OVR 161; [83, 158, 169, 193, 111, 96, 192]; T 162, Te 105, S 168; Continental
- 35: OVR 168; [95, 167, 168, 187, 127, 106, 188]; T 179, Te 108, S 199; Pro

**univerzál** – Univerzál, stratégia dobrá, 225 etáp; Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 93/43/40/47/68; dráha `RAAAAAACAACEEEEPPE`

- 17: OVR 77; [80, 81, 91, 84, 84, 86, 86]; T 82, Te 81, S 30; Rookie
- 20: OVR 99; [81, 82, 139, 96, 112, 107, 87]; T 93, Te 81, S 66; Amateur
- 25: OVR 134; [84, 85, 194, 113, 154, 138, 90]; T 113, Te 86, S 135; Amateur
- 30: OVR 161; [107, 88, 199, 117, 185, 187, 93]; T 131, Te 94, S 197; Pro
- 35: OVR 165; [117, 85, 196, 113, 190, 196, 88]; T 144, Te 97, S 200; Pro

**najlepší špecialista (rozpätie ≥70)** – Puncheur, stratégia dobrá, 221 etáp; Potenciál/Trénovateľnosť/Profesionalita/Regenerácia/Vitalita = 80/91/69/85/62; dráha `RACCEEEPPPPPPPPPPP`

- 17: OVR 86; [84, 103, 71, 82, 74, 90, 114]; T 83, Te 83, S 45; Rookie
- 20: OVR 122; [120, 182, 91, 85, 77, 93, 162]; T 113, Te 91, S 83; Continental
- 25: OVR 159; [177, 200, 110, 109, 93, 129, 199]; T 157, Te 105, S 142; Elite
- 30: OVR 181; [181, 200, 154, 125, 142, 174, 200]; T 195, Te 118, S 198; Elite
- 35: OVR 182; [179, 198, 153, 149, 145, 178, 198]; T 199, Te 123, S 200; Elite

Pozorovanie: „univerzál“ s adaptívnym tréningom sa vyvinie na špecialistu v troch atribútoch (Rovina, Časovka, Vytrvalosť), lebo V aj prepínanie zamerania odmeňujú koncentráciu. Vyrovnaný univerzál vzniká len pri vedome „vyváženom“ tréningu (v simulácii ekvivalent náhodného), ktorý dáva podobné OVR, ale plochý profil. Univerzáli majú v E medián OVR 140 vs 147–149 u ostatných archetypov.

## 9. Citlivosť na kalibračné konštanty (3 000 kariér, vek 30)

| Zmena | Medián | p90 | p99 | Max | ≥160 (%) | ≥170 (%) | Kar. max ≥180 (%) | Kar. max |
|---|---|---|---|---|---|---|---|---|
| cP 2,6 | 143 | 158 | 168 | 176 | 7,6 | 0,5 | 0,00 | 178 |
| cP 4,6 | 151 | 167 | 177 | 184 | 24,9 | 5,8 | 1,60 | 187 |
| cap 120+0,8·Po | 143 | 157 | 167 | 174 | 5,6 | 0,2 | 0,00 | 177 |
| cap 90+1,1·Po | 136 | 153 | 164 | 173 | 2,9 | 0,1 | 0,00 | 177 |
| tactK 6 | 143 | 157 | 166 | 176 | 5,6 | 0,3 | 0,00 | 178 |
| tactK 12 | 150 | 164 | 173 | 178 | 20,8 | 2,9 | 0,13 | 183 |
| bez poklesu | 146 | 162 | 172 | 179 | 13,5 | 1,8 | 0,37 | 184 |
| cT 1,0 (technika pomalá) | 146 | 161 | 171 | 177 | 12,3 | 1,5 | 0,07 | 180 |

Model je citlivý na silu taktiky (tactK 6 → 12: medián 143 → 150) a na cP (2,6 → 4,6: p99 168 → 177); strop Cap = 90 + 1,1·Po znižuje celú populáciu o ~10. Pokles s vekom ovplyvňuje kariérne maximum (bez poklesu 0,37 % ≥180 oproti 0,06 %).

## 10. Odporúčaná konfigurácia a otvorené rozhodnutia

**Odporúčam na schválenie (nič neimplementované):**
1. Osobný strop: **mäkký**, `Cap = 120 + Potenciál`, medzera 0/20/45 (silné/neutrálne/slabé atribúty archetypu), 15 pre univerzála.
2. Fyzický tréning: `cP = 3,2`, váhy 1 / 0,60 / 0,45 / 0,25, ε = 0,04, τ, π, ρ podľa kap. 2.
3. Technika: `cT = 3,0`, 1–3 technické týždne ročne (manažérska voľba), 1–2 atribúty.
4. Skúsenosti: `expK = 14` (prah 12); taktika `tactK = 9` až 12 podľa želanej výšky taktiky (kalibračné rozhodnutie).
5. Vitalita: začiatok poklesu 29–33.
6. **Vzorec OVR:** pre cieľ „190+ možné aj pre špecialistu“ treba zmeniť váhy (aspoň V = 0,75·TOP3 + 0,25·priemer7); pri 60/40 je OVR 190 prakticky nemožný (0 z 10 000).

**Čo model E nesplnil a čo treba rozhodnúť:**
- Podiel OVR 190+ je 0 % (cieľ „malé percento“ nesplnený).
- OVR neodmeňuje sústredený tréning pri 60/40 – rozhodnutie o vzorci V.
- Raný rast je rýchly (ø fyzické atribúty z 80 na 100 do 20 rokov, plató okolo 28–30 rokov); ak je to príliš, znížiť cP (kap. 5).
- Profesionalita, Regenerácia a Vitalita majú malý efekt (±1–2 OVR).
- Elite a postup sú v simulácii kvóty (predpoklad) – počty postupu a veľkosť líg musia byť pravidlom hry.
- Technický tréning zvyšuje OVR málo (10 % váha); jeho hodnota je v Race Engine, ktorý tu nie je simulovaný.

## 11. Rozlíšenie PROD / EXP / VÝSLEDOK / ODPORÚČANIE

- **PROD:** kalendár (Rookie 3×3, Amateur 3×4, Continental/Pro 3×5, Elite 4×5 – pracovný návrh), `ageFactor`, prah akumulátora 12, 1 sezóna = +1 rok, OVR sa nepoužíva v Race Engine ani v postupe.
- **EXP:** celý model E (kap. 2), štartovná populácia (OVR 75, skryté vlastnosti ~N(50, 20), Skúsenosti 15–45), rast Skúseností a Taktiky z pretekov, pokles s Vitalitou, MS každú druhú sezónu pre Continental+, postup podľa výsledkov etáp (30/25/20/15 % hore, 10/10/10/15 % dole), stratégie 50/35/15 %, aktivita 60/25/15 %.
- **VÝSLEDOK:** tabuľky v kap. 3–9.
- **ODPORÚČANIE:** kap. 10.
