# Simulácia denného tréningu, regenerácie a skrytých vlastností

> **Stav:** iba návrh a simulácia. Nič z toho nie je nasadené ani schválené. Produkčná databáza, schopnosti jazdcov, OVR, tréningové plány ani UI sa nemenili. Všetky koeficienty v časti „Návrh“ sú **experimentálne**; schvaľovať ich budeme až po vyhodnotení.
> Tento súbor sa generuje skriptom `docs/training-simulation/make_report.py` z `results.json` — všetky čísla pochádzajú z jedného behu simulácie.

**Beh:** seed **{{SEED}}**, **{{N}}** unikátnych jazdcov, 3 sezóny po 10 týždňov, {{runs}} scenárov (+ citlivostné behy), výpočet {{elapsed}} s. Ten istý seed dá bit-po-bite ten istý výsledok (overené testom).

## 0. Zhrnutie

1. **Populácia sedí na zadané rozdelenie** (tabuľky v §2). Potenciál 96–100 má **{{f0(D['combos'][0]['count'])}}** jazdcov, z toho s trénovateľnosťou > 80 len **{{D['combos'][1]['count']}}**. Kombináciu „všetky štyri vlastnosti ≥ 81“ nemá **nikto** ({{D['combos'][5]['count']}} z {{N}}; teoreticky {{'%.2f' % D['combos'][5]['expected']}}). „Výnimočný“ jazdec v zmysle všetkých štyroch ≥ 61 je {{D['combos'][3]['count']}} jazdcov.
2. **Dnešné vzorce rešpektujú význam vlastností len čiastočne.** Trénovateľnosť a profesionalita fungujú (ako násobiteľ rýchlosti). **Potenciál nemá v prvých 3 sezónach prakticky žiadny efekt** ({{pot_spread}} % medzi najslabším a výborným pásmom) — vzorec ho zapína až od celkového výkonu ≥ 140. U jazdcov, ktorí už sú silní, sa potenciál prejaví ({{hl_gain}} % pri mapovaní 55–95, {{hl_gain_d}} % pri priamej stupnici 1–100). Regenerácia sa dnes vo vzorci vôbec nepoužíva.
3. **Navrhnutá záťaž tvrdej jednotky (−24 / +18) je pre väčšinu jazdcov neudržateľná.** Pri samých tvrdých týždňoch je po 3 sezónach vyčerpaných **{{f0(dh['exhaustedRiders'])}} z {{N}}** jazdcov (všetci s regeneráciou ≤ 60), priemerná energia na konci tréningového týždňa {{f0(dh['trainWeekEnergy'])}} a únava {{f0(dh['trainWeekFatigue'])}}. Ľahký a normálny tréning sú plne udržateľné (energia ~100, únava ~0). Dnešný týždenný model je naopak veľmi benevolentný: tvrdý týždeň stojí iba 15/18 a energia ostáva {{f0(wh['trainWeekEnergy'])}}.
4. **Hranica „energia < 30 alebo únava > 75“** zníži vyčerpaných jazdcov z {{f0(dh['exhaustedRiders'])}} na **{{f0(gh['exhaustedRiders'])}}**, no vynechá {{f1(gh['sessionsSkipped']/gh['sessionsPlanned']*100)}} % všetkých tvrdých jednotiek a rast trénovaného atribútu mierne **zvýši** ({{f2(dh['focusGain3'])}} → {{f2(gh['focusGain3'])}}), lebo sa nevykonávajú neúčinné jednotky pri pripravenosti ×0,50–0,70.
5. **Rozumné plánovanie intenzity** (podľa pripravenosti na začiatku týždňa) dáva v dennom modeli vyšší rast než samé tvrdé týždne ({{f2(ds['focusGain3'])}} vs. {{f2(dh['focusGain3'])}} bez hranice a {{f2(gh['focusGain3'])}} s hranicou) **bez jediného vynechaného tréningu a bez jediného vyčerpaného jazdca**.
6. **OVR rastie pomaly:** keďže hráč trénuje jeden atribút, medián rastu OVR po 3 sezónach je {{f1(gs['ovrGain3']['median'])}} bodu (priemer {{f2(gs['ovrGain3']['mean'])}}). Trénovaný atribút rastie o ~{{f0(gs['focusGain3'])}} bodov. Pozri §5.1 a §8.
7. **Rookie limity OVR 75 / 95 nie sú na stupnici schváleného `overallRating()`** (štartovací jazdec má {{start_ovr}}), preto sa pri ňom nedajú použiť. Pozri §5.9.

**Odporúčanie v skratke (podrobne §8):** ponechať vzorec rastu, prah 12, počty jednotiek, tabuľku pripravenosti a vzorce dennej regenerácie; **znížiť záťaž tvrdej jednotky** (napr. −20 / +15 alebo −22 / +16 — nulové vyčerpanie pri zachovaní tvrdosti); **zaviesť hranicu** ako ochranný mechanizmus (nie ako trest); rozhodnúť o stupnici skrytých vlastností (mapovanie 55–95 vs. priama 1–100); a **definovať Rookie limity na stupnici `overallRating()`**.

---

## 1. Audit existujúceho systému

Prečítané: `CLAUDE.md`, `GAME_DESIGN.md`, `DECISIONS.md`, `TRAINING_AUDIT.md`, `lib/training/*`, `lib/rider/score.ts`, `lib/facilities/config.ts`, SQL migrácie 20261115_01–03 (autoritatívne spracovanie v `apply_training_plan_internal`). Značky: **[IMPL]** reálne v kóde/SQL.

| Téma | Zistenie |
|---|---|
| Skryté vlastnosti — rozsah a generovanie | Štartovací jazdec: potenciál, trénovateľnosť, profesionalita, regenerácia **55–95** (celé čísla; SQL ich pri vytvorení overuje na 55–95). Verejné atribúty: základ 130 ± 5, tvar ±10, šum ±3 (112–148), vek 18–22. **[IMPL]** |
| Presný vzorec (Performance) | `BASE_TRAINING 3 × počet_jednotiek (1/2/3) × (0,5 + trénovateľnosť/200) × (0,8 + profesionalita/500) × vekový_faktor × násobok_tréningového_centra × pripravenosť × developmentRoomFactor`. Sekundárny atribút 35 % primárneho (pevná mapa). **[IMPL]** |
| Vekový faktor | ≤ 19: 1,30 · 20–22: 1,20 · 23–25: 1,10 · 26–28: 1,00 · 29–31: 0,80 · 32–34: 0,55 · 35+: 0,30 **[IMPL]** |
| Úloha skrytých vlastností | **Trénovateľnosť** = násobiteľ rýchlosti učenia (0,5–1,0 pri škále 0–100). **Profesionalita** = násobiteľ efektivity tréningu (0,8–1,0). **Potenciál** vstupuje iba cez `developmentRoomFactor = max(0,05, lokálny_faktor(hodnota) × faktor_potenciálu(celkový_výkon, potenciál))`; faktor potenciálu má **váhu 0 pod celkovým výkonom 140** a rastie k 1 pri 200. **Regenerácia sa vo vzorci nepoužíva** (iba sa zobrazuje v Rozvoji). Duplicitný násobiteľ som nenašiel: každá vlastnosť vstupuje práve raz. **[IMPL]** |
| Strop | Výkonnostné atribúty 200, ostatné 160. Pri 200 je rast 0. |
| Hranica 12 a progres | Surový rast sa sčíta do akumulátora pre každý atribút zvlášť (`rider_training_progress`); celé body = `floor((súčet + 1e-9) / 12)`, zvyšok sa prenáša medzi týždňami. Technical plán: max +1 bod / plán (v simulácii sa nepoužíva). **[IMPL]** |
| Energia, únava, forma, kondícia | Štart 100 / 0 / forma 50 / kondícia 60 / morálka 70. Tréning mení iba energiu a únavu: týždenná cena (ľahký 5/5, normálny 10/10, tvrdý 15/18) **raz za týždeň**, potom pasívna regenerácia na voľných dňoch (6/5/4 dní × 5 energie × 4 únavy × násobok Regeneračného centra). Zaokrúhli sa a ohraničí 0–100. Forma, kondícia, morálka sa nemenia. **[IMPL]** |
| Pripravenosť | `(energia + 100 − únava) / 2` zo stavu **pred** týždňom → účinnosť 1,00 / 0,95 / 0,85 / 0,70 / 0,50 pre ≥ 80 / ≥ 60 / ≥ 40 / ≥ 20 / menej. **[IMPL]** |
| Regenerácia bez plánu | **Neexistuje** — v týždni bez plánu sa stav nemení (potvrdené simuláciou, §6). |
| Zázemie | Tréningové centrum: násobok 1,15 / 1,10 / 1,05 / 1,03 podľa vekového pásma (odomyká sa úrovňami 2–5), len Performance. Regeneračné centrum: ×1,00–1,20 na pasívnu regeneráciu. Čísla sú `[PLACEHOLDER]`. **V simulácii sú obe vypnuté (×1,00)**, aby bol vidieť čistý vplyv jazdca. |
| Rozpis dní | UI aj návrh: ľahká = utorok, normálna = utorok + štvrtok, tvrdá = utorok + štvrtok + sobota (Po = 0 … Ne = 6). Zhoda s `TrainingConfigForm` je kontrolovaná testom. |

Dnešný produkčný model je v simulácii zahrnutý ako **„Týždenný (dnešný produkčný)“** — počíta sa **tými istými funkciami** (`calculatePerformanceRawGrowth`, `accumulateProgress`, `weeklyConditionDelta`, `applyConditionDelta`, `readinessEffectiveness`), nie ich kópiou, takže sa od hry nemôže rozísť.

---

## 2. Experimentálny model skrytých vlastností

Stupnica 1–100, štyri vlastnosti **nezávisle**, v pásme rovnomerne, seed {{SEED}}:

| Pásmo | 1–20 | 21–40 | 41–60 | 61–80 | 81–95 | 96–100 |
|---|---:|---:|---:|---:|---:|---:|
| Podiel | 10 % | 25 % | 40 % | 20 % | 4 % | 1 % |

### 2.1 Reálne rozdelenie vo vygenerovanej populácii ({{N}} jazdcov)

{{t_hidden}}

{{img('hidden_distribution')}}

Nezávislosť (Pearsonovo r medzi vlastnosťami, očakávané ≈ 0):

{{t_corr}}

### 2.2 Zaujímavé kombinácie

{{t_combo}}

Kombinácia „všetky štyri ≥ 81“ má pravdepodobnosť 0,05⁴ = 0,0006 % — v 10 000 jazdcoch ju teda **nemožno očakávať**. Ak má hra takých jazdcov mať, treba ich generovať cielene (alebo zvoliť slabšiu definíciu „výnimočnosti“, napr. aspoň tri vlastnosti ≥ 81: {{D['combos'][4]['count']}} jazdcov).

### 2.3 Mapovanie na dnešnú stupnicu

Produkčné vzorce boli ladené na 55–95. Pre simuláciu sú pripravené dve mapovania (databáza sa nemení):

* **`rescaled` (hlavné):** lineárne 1 → 55, 100 → 95 (`55 + (v − 1) × 40 / 99`) pre trénovateľnosť, profesionalitu a potenciál. Vzorce ostávajú **nezmenené** a zachovajú dnešnú rýchlosť rastu.
* **`direct` (citlivostná analýza):** surové hodnoty 1–100 do nezmenených vzorcov. Rozdiely medzi jazdcami sú väčšie (trénovateľnosť 1 dáva faktor 0,505, nie 0,775) a priemerný jazdec rastie pomalšie.

Regenerácia sa **nemapuje** — nový denný vzorec je definovaný priamo na 1–100.

### 2.4 Rešpektuje existujúci vzorec význam vlastností?

Rast trénovaného atribútu po 3 sezónach (tvrdý týždenný tréning, dnešný vzorec, mapovanie 55–95), podľa pásma vlastnosti:

**Trénovateľnosť** ({{tra_spread}} % medzi pásmom 1–20 a 81–95):

{{inf_tr}}

**Profesionalita** ({{pro_spread}} %):

{{inf_pr}}

**Potenciál** ({{pot_spread}} %):

{{inf_po}}

**Regenerácia** (dnes bez vplyvu, {{rec_spread}} %):

{{inf_re}}

Pri priamej stupnici 1–100 (denný tvrdý s hranicou):

{{inf_tr_d}}

{{inf_pr_d}}

{{inf_po_d}}

{{img('hidden_influence')}}

**Zistenia:**

* **Trénovateľnosť** určuje rýchlosť učenia — správne. **Profesionalita** pôsobí ako jemnejší násobiteľ efektivity — správne, no na rozsahu 55–95 len ~{{pro_spread}} %.
* **Potenciál nerozhoduje o rozvoji v prvých sezónach.** Vzorec ho zapína až od celkového výkonu ≥ 140; štartovací jazdci majú ~130 a po 3 sezónach tréningu jedného atribútu zostávajú pod 140. Potenciál „určuje dlhodobý rozvoj“ až po prekročení tejto hranice. Test s tými istými jazdcami, ktorým som výkonnostné atribúty zdvihol o 22:

{{hl_t}}

{{img('potential_high_level')}}

* Rozdiely medzi mapovaniami sú dôležité pre dizajn: pri `rescaled` je jazdec s vysokou trénovateľnosťou rýchlejší len o ~{{tra_spread}} % než jazdec s nízkou, pri `direct` sa rozdiel medzi slabým a výborným jazdcom výrazne zväčší (tabuľky vyššie). **Toto je herné rozhodnutie** — odporúčam ho prijať vedome.
* **Duplicitné násobitele sa nenašli.** Nič som nepridával ani nemenil.

Vplyv veku (dnešný vekový faktor, 3 sezóny):

{{age_t}}

---

## 3. Experimentálny denný tréning (návrh)

### 3.1 Pravidlá (zachované)
Plánuje sa nasledujúci týždeň · potvrdený plán je konečný · týždeň 1 prípravný · v týždni 10 sa už neplánuje na ďalšiu sezónu (tréning týždňa 10 sa plánuje v týždni 9 a prebehne) · v Tour týždni sa netrénuje · bez plánu žiadny progres · regenerácia prebieha aj bez plánu.

### 3.2 Jednotky a záťaž
| Intenzita | Dni | Záťaž jednej jednotky |
|---|---|---|
| Ľahká | utorok | energia −12, únava +8 |
| Normálna | utorok, štvrtok | energia −18, únava +12 |
| Tvrdá | utorok, štvrtok, sobota | energia −24, únava +18 |

### 3.3 Denná regenerácia pri vrodenej hodnote R (1–100)
`obnova energie = 8 + round(8·R/100)`, `odbúranie únavy = 5 + round(6·R/100)`. Voľný deň 100 %, tréningový deň 50 % **po** tréningu (zaokrúhlené polovicou dennej hodnoty, half-up). Hodnoty sa po každom kroku ohraničujú na 0–100.

{{regen_t}}

Z tabuľky je vidno základný fakt: **normálny týždeň je pre každého jazdca energeticky kladný, tvrdý týždeň je záporný pre R ≲ 60** (týždenný súčet = 4 voľné dni + 3 tréningové dni − 3 × 24).

### 3.4 Rozdelenie týždenného progresu na jednotky
Faktory týždňa (atribúty, vek, potenciál, trénovateľnosť, profesionalita, `developmentRoomFactor`) sa **zmrazia na začiatku týždňa**; týždenný surový progres sa vydelí počtom jednotiek; každá jednotka ho vynásobí **vlastnou pripravenosťou** (stav tesne pred ňou) a pripíše do rovnakých akumulátorov s prahom 12. Zvyškový progres sa prenáša medzi jednotkami aj týždňami. **Dôkaz, že rozdelenie samo rast nezvyšuje:** keď sa pripravenosť neutralizuje (×1,00), denný model dáva pre každého z {{N}} jazdcov rovnaký výsledok ako týždenný (test v §6). Jediný rozdiel medzi modelmi je teda realistická pripravenosť pri každej jednotke.

### 3.5 Experimentálna hranica
Pred jednotkou: energia < 30 **alebo** únava > 75 → jednotka sa neuskutoční, jazdec nezíska progres, nezaplatí záťaž a regeneruje 100 %. Porovnanie „s hranicou“ a „bez hranice“ je v §5.7.

---

## 4. Návrh simulácie

* **Kód:** `apps/web/src/lib/training/sim/` (`rng.ts`, `population.ts`, `model.ts`, `stats.ts`, `run.cli.ts`, `sim.test.ts`). Žiadny prístup k databáze. Spustenie: `npx tsx src/lib/training/sim/run.cli.ts [seed] [n]`, potom `python3 docs/training-simulation/make_report.py`.
* **Populácia (predpoklady):** vek 18–22 (55 %), 23–27 (25 %), 28–32 (13 %), 33–36 (7 %); verejné atribúty: úroveň 130 ± 12 (trojuholníkové), 3 silné (+10) a 3 slabé (−10) atribúty, šum ±3, rozsah 100–160; štartovacia kondícia: polovica oddýchnutá (100/0), polovica náhodná (energia 30–100, únava 0–70); **zameranie tréningu** je náhodné z 7 výkonnostných atribútov a pre jazdca rovnaké vo všetkých scenároch. Štartovací OVR (`overallRating`): priemer {{start_ovr}}.
* **Scenáre:** bez tréningu · iba ľahký · iba normálny · iba tvrdý · striedanie Ľ→N→T · **rozumné plánovanie** (pripravenosť ≥ 75 → tvrdý, ≥ 55 → normálny, ≥ 35 → ľahký, inak týždeň odpočinku; rozhoduje stav na začiatku týždňa, predpoklad: manažér pozná dobrú projekciu) — každý v troch modeloch (týždenný produkčný, denný, denný s hranicou) a v dvoch kalendároch.
* **Kalendár:** 3 sezóny × 10 týždňov; v každej sezóne týždeň 1 bez tréningu, týždeň 10 sa trénuje; vek +1 pri začiatku sezóny. **Tour:** tri Tour za sezónu podľa Rookie pravidiel v týždňoch 2, 5 a 7 (podľa `data/tourSchedule.ts`; týždne 5 sú jedna spoločná voľba), v nich sa netrénuje a jazdec regeneruje voľne.
* **Oddelený experiment s hypotetickou záťažou pretekov („Tour + záťaž“):** reálne pretekárske výpočty energie a únavy ešte nie sú integrované. Ako **hypotézu** sa v Tour týždni používa 5 pretekových dní (Ut–So), každý −15 energie, +10 únavy, regenerácia po preteku 50 %. **Nie sú to skutočné výsledky pretekov**; slúži iba na odhad, ako by ťažký Tour zaťažil tréningový režim.
* **Zázemie a personál:** vypnuté (×1,00, žiadny tréner ani fyzioterapeut).
* **OVR:** schválený `overallRating()` (váhy 50/25/20/5). Aby bolo vidieť aj priamy efekt, uvádzam vždy aj rast **trénovaného atribútu**.
* **Obmedzenia:** jeden fixný fokus na jazdca (reálny hráč môže meniť); Technical plány, skúsenosti, rast Taktiky, zranenia a preteky nie sú v modeli; AI jazdci netrénujú; rast OVR je celé číslo po zaokrúhlení, preto sú mediány často 0 alebo 1.

---

## 5. Výsledky

### 5.1 Rast OVR po 1 a 3 sezónach (S1 / S3), bez Tour

OVR = `overallRating()` (štart priemer {{start_ovr}}). Rast v bodoch OVR; percentily sú z {{N}} jazdcov.

{{ovr_noTour}}

### 5.2 Rast OVR, s Tour (týždne 2, 5, 7 bez tréningu)

{{ovr_tour}}

### 5.3 Rast trénovaného atribútu (priemer, body)

**Bez Tour:**

{{focus_noTour}}

**S Tour:**

{{focus_tour}}

{{img('growth_by_scenario')}}

### 5.4 Rast jednotlivých verejných atribútov (priemer na jazdca, všetci jazdci)

Trénovaný je vždy jeden výkonnostný atribút (náhodný) a jeho sekundárny partner; Taktika, Technika a Skúsenosti sa tréningom nemenia.

{{attr_t}}

### 5.5 Energia a únava

Priemer na konci **tréningových** týždňov, bez Tour:

{{cond_t}}

{{img('condition_weekly')}}

Rozdelenie jednotiek podľa pripravenosti v momente jednotky (tvrdý a rozumný scenár, bez Tour):

{{band_t}}

### 5.6 Vynechané tréningy a vyčerpaní jazdci

„Vyčerpaný“ = aspoň raz za 3 sezóny energia ≤ 10 alebo únava ≥ 90 (na konci dňa; v týždennom modeli na konci týždňa). Počet jazdcov **saturuje** (každý jazdec s nízkou regeneráciou to dosiahne), preto je uvedený aj počet jazdec-dní.

{{exh_t}}

{{img('exhaustion_skips')}}

Poznámka k týždennému modelu: „vyčerpaní“ sú tam jazdci so štartovou únavou ~70, ktorým tvrdý týždeň (+18 − 16) pridáva ďalšie ~2 body únavy týždenne a **nikdy ju neodbúra** (bez plánu nie je regenerácia).

### 5.7 Hranica 30 / 75: s hranicou vs. bez nej

{{gate_t}}

### 5.8 Slabí, priemerní a výnimoční jazdci

Skupiny podľa priemeru štyroch skrytých hodnôt: slabí = spodných 20 % ({{D['segments']['sizes']['weak']}}), priemerní = 40.–60. percentil ({{D['segments']['sizes']['average']}}), výnimoční = horný 1 % ({{D['segments']['sizes']['exceptional']}}). Priemerný rast OVR a trénovaného atribútu po 3 sezónach, bez Tour:

{{seg_t}}

{{img('segments')}}

**Tvrdý tréning vs. rozumné striedanie intenzity:**

{{hs_t}}

### 5.9 Rookie limity OVR (75 pri získaní, 95 pri ponechaní)

**Zistenie o stupnici.** Schválené `overallRating()` je na stupnici atribútov (štartovací jazdec {{start_ovr}}, strop ~200). Hodnoty 75 / 95 sa preto na ňom nedajú použiť (pri štartovacom OVR ~130 by limit 75 nesplnil nikto). Staré normalizované 0–100 skóre `riderOverall()` (priemer {{start_legacy}}, štartovné maximum {{legacy_max_start}}, maximum po 3 sezónach {{legacy_max_s3}}) tiež **nikoho** nedostane nad 75 ani 95. **Nič som neimplementoval ako pravidlo.** Aby sa dalo rozhodnúť, tabuľka ukazuje, koľko jazdcov z {{N}} by prekročilo prahy na stupnici `overallRating()`:

{{rookie_t}}

Počet jazdcov nad starým skóre 0–100: > 75 pri štarte = {{S['weekly|hard|noTour|rescaled']['rookieLegacy']['startAbove75']}}, > 95 po 1. sezóne = {{S['weekly|hard|noTour|rescaled']['rookieLegacy']['s1Above95']}}, > 95 po 3. sezónach = {{S['weekly|hard|noTour|rescaled']['rookieLegacy']['s3Above95']}}.

### 5.10 Citlivosť: záťaž tvrdej jednotky

Denný model, iba tvrdý tréning, bez Tour. Hodnotené **iba** na rozhodnutie, nič sa neprijíma:

{{load_t}}

### 5.11 Citlivosť: stupnica skrytých vlastností

{{map_t}}

### 5.12 Desať konkrétnych kariér

Vyberané deterministicky z populácie podľa uvedeného kritéria (ID = poradie v populácii pri seede {{SEED}}). Stĺpce výsledkov: *prírastok trénovaného atribútu / prírastok OVR* po 3 sezónach, kalendár s Tour.

{{career_t}}

---

## 6. Technické testy

`npx tsx src/lib/training/sim/sim.test.ts` — **{{TEST_COUNT}}** kontrol, všetky prechádzajú. Overujú:

* žiadny progres bez plánu (všetky tri modely, ani jeden atribút sa nezmení, žiadne jednotky);
* žiadny tréning ani progres počas Tour týždňov (všetky tri modely, všetky sezóny);
* hranice sezóny: týždeň 1 sa netrénuje, týždeň 10 trénuje, žiadny plán sa neprenáša do ďalšej sezóny, vek +1 presne pri začiatku sezóny;
* **rozdelenie týždňa na jednotky nezvyšuje rast** (denný = týždenný pre každého z 600 jazdcov a všetky intenzity pri neutrálnej pripravenosti);
* zvyškový progres sa nestráca ani nevzniká (súčet surového progresu = 12 × celé body + zvyšok, 0 ≤ zvyšok ≤ 24 na jazdca);
* energia a únava vždy v 0–100 (aj zo štartov 0/100 a 100/0, všetky modely, politiky, Tour so záťažou);
* vrodená regenerácia sa nemení (zmrazené objekty, rovnaký hash pred/po) a vstupná populácia sa behom nemení;
* reprodukovateľnosť: rovnaký seed a konfigurácia = identické výsledky, iný seed = iné;
* 10 000 jazdcov × všetky modely a politiky: žiadne neplatné hodnoty (NaN, mimo rozsahu, pokles atribútu, atribút > 200);
* rozdelenie skrytých vlastností (do 4 štandardných chýb), nezávislosť (|r| < 0,05), unikátnosť 10 000 profilov;
* zhoda rozpisu dní a počtu jednotiek s UI (`TrainingConfigForm`) a s `SESSION_COUNT`; návrhové záťaže a regeneračné vzorce;
* chovanie hranice (nikdy nevynechá oddýchnutého jazdca; vykonané + vynechané = plánované).

Pri behu s {{N}} jazdcami bolo neplatných hodnôt: **{{inv_total}}**. Dnešný produkčný model je v simulácii zahrnutý tými istými funkciami ako v hre, takže zhoda s produkciou je daná konštrukciou; SQL zrkadlo samotné overujú existujúce DB testy (`supabase/tests/training_security.test.sh`).

---

## 7. Návrh budúceho serverového denného spracovania (Supabase) — NEIMPLEMENTOVANÉ

**Cieľ:** spracovať tréning aj bez prihlásenia hráča, bez dvojitého spracovania, s bezpečným prechodom zo starého týždenného systému.

1. **Spúšťač:** `pg_cron` (bežný vo Supabase, nepotrebuje service-role kľúč) volá raz denne (napr. 00:10 UTC, po konci kalendárneho dňa) `process_training_day(p_day date)`. Funkcia je `security definer`, bez klientskeho grantu (rovnaký vzor ako `apply_training_plan_internal`). Rozhodnutie o `pg_cron` je dnes otvorené (D8).
2. **Idempotencia a zámky:**
   * tabuľka `training_day_runs(day date primary key, started_at, finished_at, riders_done int)` — beh pre daný deň sa „zaregistruje“ cez `insert … on conflict do nothing`; druhý súbežný beh skončí hneď;
   * tabuľka `training_day_log(rider_id, day, primary key (rider_id, day), session_done bool, skipped_reason text, energy_before, fatigue_before, …)` — **PK je ochrana pred dvojitým spracovaním** na úrovni jazdca a dňa; záznam sa vkladá v tej istej transakcii ako zmena stavu jazdca;
   * jazdci sa berú dávkami (`for update skip locked`), jedna transakcia na jazdca/dávku, takže pád uprostred neskazí ostatných.
3. **Dohnanie zameškaných dní:** funkcia spracuje všetky dni od posledného `training_day_log` jazdca po včerajšok v poradí (aj po výpadku crona); vždy podľa **SQL kalendára** (`season_id_at`, `season_week_at`), nikdy podľa času klienta.
4. **Čo sa deje za deň:** nájsť potvrdený plán daného týždňa (jazdec, sezóna, týždeň); ak je to deň tréningu a spĺňa sa pravidlo hranice → progres jednotky do `rider_training_progress` + záťaž; inak iba regenerácia (aj bez plánu a v Tour týždni). Týždeň 1 / Tour týždeň / týždeň bez plánu = iba regenerácia. Vykoná sa vždy v poradí: hranica → progres → záťaž → polovičná regenerácia.
5. **Prechod zo starého systému:**
   * pevný **dátum prepnutia** (pondelok 00:00 UTC): od neho beží denný režim; týždenné spracovanie (`process_my_due_training`) sa vypne **až po** dokončení posledného týždenného dňa;
   * plány už **spracované** týždenne (`applied_at is not null`) sa nikdy nespracujú znova; nespracované plány z týždňa pred prepnutím dobehne ešte týždenný spôsob (jednorazovo), plány od prepnutia ide denne;
   * historické záznamy (`training_plans`, história atribútov) ostávajú; plán sa stále eviduje na úrovni týždňa, denné jednotky pribúdajú v `training_day_log`;
   * lenivé spracovanie pri návšteve stránky Tréning ostane len ako záloha (volá tú istú funkciu s dňami po dnes).
6. **Bezpečnosť:** klient nemá zápis do `training_day_log`/`training_day_runs`; skryté vlastnosti sa nikdy nevracajú; AI jazdci (D13) sa zapnú samostatne.
7. **Testovanie pred nasadením:** DB test s pevným „teraz“ (rovnaký vzor ako `training_security.test.sh`): paralelné volania, výpadok o 3 dni, prechod sezóny, Tour týždeň, týždeň 1/10, zhoda SQL = TypeScript simulácia pre vzorku jazdcov (drift test).

---

## 8. Odporúčania — čo ponechať a čo upraviť

**Ponechať (simulácia nenašla dôvod meniť):**
* vzorec rastu, `BASE_TRAINING 3`, prah akumulátora 12, počty jednotiek 1/2/3 a rozpis dní;
* tabuľku pripravenosti (×1,00 … ×0,50) — v dennom modeli pracuje dobre ako plynulá brzda;
* vzorce dennej regenerácie `8 + round(8R/100)` a `5 + round(6R/100)` a 50 % regeneráciu v tréningový deň;
* záťaž **ľahkej** a **normálnej** jednotky (udržateľné pre všetkých: energia ~100, únava ~0 na konci týždňa);
* vekový faktor a vrodenosť regenerácie.

**Upraviť / rozhodnúť (návrh, nič nie je schválené):**
1. **Záťaž tvrdej jednotky.** −24 / +18 vyčerpá {{f0(dh['exhaustedRiders'])}} z {{N}} jazdcov. Citlivostná analýza (§5.10): **−20 / +15** → nulové vyčerpanie s hranicou a len ~{{f0(D['loadSensitivity'][5]['skipped']/D['loadSensitivity'][5]['planned']*100)}} % vynechaných jednotiek, rast tvrdého tréningu ~{{f1(D['loadSensitivity'][5]['focusGain3'])}} bodu (vs. {{f1(D['loadSensitivity'][1]['focusGain3'])}} pri −24 / +18). Možnosť −22 / +16 je prísnejšia (tvrdý ostáva „tvrdý“).
2. **Hranica 30 / 75: zaviesť** ako ochranu pred spirálou únavy (výrazne znižuje vyčerpanie a rast nezhoršuje), alebo ju nahradiť miernejším trestom cez pripravenosť, ktorá už existuje. Na jej tvorbu treba UI informáciu „dnes si oddychoval“.
3. **Potenciál:** dnes pod celkovým výkonom 140 nič neurobí. Ak má určovať dlhodobý rozvoj už od začiatku, treba samostatné rozhodnutie (nie duplicitný násobiteľ — úprava existujúcej váhy). Ponechať, ak „dlhodobý“ znamená strop pre silných jazdcov.
4. **Stupnica skrytých vlastností:** `rescaled` zachová dnešnú rýchlosť; `direct` vytvorí výraznejšie rozdiely medzi jazdcami, no priemerný jazdec rastie pomalšie (§5.11). Odporúčam `rescaled` na migráciu existujúcich dát a výber až po rozhodnutí o rozdieloch medzi slabými a výnimočnými.
5. **Regenerácia ako vlastnosť jazdca** sa musí zaviesť do dennej regenerácie (je jediný jej vstup); po jej zavedení vyradiť z Rozvoja ako „zatiaľ nepoužité“.
6. **OVR rastie pomaly** (§5.1). Ak má hráč po 3 sezónach vidieť výraznejší posun OVR, nie je to otázka tréningového vzorca — jeden trénovaný atribút z 19 hýbe OVR o ~0,07 bodu na bod atribútu. Treba rozhodnúť, či to tak má byť.
7. **Rookie limity** definovať na stupnici `overallRating()` (napr. percentil populácie alebo pevné hodnoty podľa §5.9), nie 75/95.
8. **Tour:** v modeli bez záťaže pretekov strácajú jazdci cca tretinu tréningových týždňov (18 z 27). Reálna záťaž pretekov (energia/únava) ešte neexistuje — jej zavedenie zmení bilanciu tvrdého tréningu (hypotetický test v §5.6).

**Schválenie, ktoré potrebujem pred ďalším krokom:** (a) stupnica skrytých vlastností; (b) záťaž tvrdej jednotky; (c) hranica áno/nie a jej hodnoty; (d) definícia Rookie limitov; (e) mechanizmus pozadia (D8) a dátum prepnutia.

---

## 9. Reprodukcia

```
cd apps/web
npx --no-install tsx --tsconfig tsconfig.json src/lib/training/sim/run.cli.ts 20261115 10000
npx --no-install tsx src/lib/training/sim/sim.test.ts
cd ../.. && python3 docs/training-simulation/make_report.py
```
Seed {{SEED}}, {{N}} jazdcov, {{runs}} hlavných scenárov. Výstupy: `docs/training-simulation/results.json` + PNG grafy v rovnakom priečinku.
