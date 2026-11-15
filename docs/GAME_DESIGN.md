# GAME_DESIGN — herné mechaniky (Cycling Manager)

Tento dokument zachytáva **iba to, čo je potvrdené** v kóde alebo v ratifikovaných dokumentoch. Nič tu nie je domyslené.

## Ako sa používa
- **Hierarchia zdrojov:** ratifikované dokumenty race enginu a komentáre v kóde > `DECISIONS.md` > tento súbor. Špecifikácia v9 je historický vstup, nie autorita (niektoré rozhodnutia sa neskôr zmenili).
- **Značky:** `[KÓD]` potvrdené v kóde (uvedený súbor), `[ENGINE]` rieši race engine (len odkaz), `[CHÝBA]` zatiaľ nezdokumentované, `[PLACEHOLDER]` číslo je dočasné.
- Pri konflikte alebo medzere sa pýtame vlastníka hry, nedomýšľame.
- Čísla balansu sú v kóde, nie tu. Tu je pravidlo a odkaz.

## 1. Ligy
- Poradie: rookie → amateur → continental → pro → elite. `[KÓD]` `apps/web/src/lib/leagues.ts`
- Viditeľné etapy kanonického 5-etapového Touru: rookie 3, amateur 4, continental 5, pro 5, elite 5. Etapy nad limitom v UI **neexistujú** (nie sú zamknuté/šedé), povýšenie ich odhalí ako nový obsah. `[KÓD]`
- Počet Tourov na sezónu: 3 vo všetkých ligách, ale ladená je len Rookie, ostatné sú `[PLACEHOLDER]`. `[KÓD]`
- Rookie je jediná funkčná liga. Sekcie Tím a Scouting sú dostupné od amateur vyššie, Trh jazdcov už od Rookie. `[KÓD]` `lib/navigation.ts`

## 2. Jazdec a atribúty
- 19 kanonických zručností: Performance 7 + Tactics 5 + Technique 6 + experience (podľa komentára v kóde). Presný zoznam: `lib/rider/config.ts`. `[KÓD]`
- Ďalšie vlastnosti spomínané v kóde: Trainability, Professionalism, Potential, Recovery, Energy/Fatigue. Ich pravidlá `[CHÝBA]`.
- Štartovací Rookie: základ 130 ± 5, šum na atribút ± 3, „tvar“ jazdca zvyšuje silnú stránku o 10 a znižuje slabú o 10 (komentár označuje ako rozhodnutie). Verzia generátora `starter-v1`. `[KÓD]`
- `breakawaySkill` (trvalá schopnosť jazdca) nie je to isté ako `BreakawayEffort` (príkaz v pretekoch v engine). Nezamieňať. `[KÓD]`
- Engine má 17 atribútov (`AttributeKey`); `breakawaySkill` a `wetHandling` v engine zatiaľ nie sú, ich zapojenie do simulácie je samostatná zmena na strane enginu. `[KÓD]`

## 3. Týždenný tréning
Zdroj: `lib/training/config.ts`. `[KÓD]`
- Jeden plán na jazdca a týždeň, jeden z dvoch typov:
  - **Performance:** zameranie je jeden zo 7 výkonnostných atribútov, intenzita určuje počet tréningov: ľahká 1, normálna 2, ťažká 3 za týždeň. Vzorec (Development Model V2): základ × trainability × professionalism × vek × zázemie × developmentRoomFactor × readiness × počet tréningov.
  - **Technical:** zameranie je jedna zo 6 techník, vždy presne 1 tréning, bez voľby intenzity. Jednoduchší vzorec (bez zázemia a bez Development Model V2). Tvrdý limit **+1 bod atribútu** na spracovaný plán.
- Tactics sa tréningom nezvyšuje, má rásť až cez budúci systém pretekových situácií. `[KÓD]`
- Kondícia a regenerácia: `lib/training/condition.ts`. Pravidlá `[CHÝBA]` (neprečítané).

## 4. Zázemie (Facilities)
Zdroj: `lib/facilities/config.ts`, jediný kanonický zdroj všetkých efektov. `[KÓD]`
- 5 zariadení: training, recovery, scouting, technical, teamCenter. Úrovne 1–5.
- **Training Center** (finálny model V1): ovplyvňuje iba Performance tréning. Kumulatívny, ale nesčítavaný: každá úroveň odomkne ďalšie vekové pásmo (17–23 / 24–27 / 28–31 / 32+), jazdec dostane iba násobok **svojho** pásma. Príklad z kódu: 20-ročný na L5 dostane presne 1.15.
- **Technical Center** je iný systém (technické riziko a servis bicykla), nezamieňať s Technical tréningom.
- Všetky ceny a číselné efekty sú `[PLACEHOLDER]`, ceny čakajú na systém Financie.

## 5. Preteky a Toury
- Obsah Tourov (názov, etapy, dĺžka, obtiažnosť flat/hilly/mountain/classics/mixed, dresy gc/points/mountain/youth): `apps/web/src/data/tours.ts`. Príklad: Danube Tour. `[KÓD]`
- Registrácia na Tour a výsledky: tabuľky `tour_registrations`, `race_results`. Pravidlá registrácie a bodovania `[CHÝBA]` (`data/scoring.ts`, `data/rewards.ts` neprečítané).
- Simuláciu pretekov rieši race engine `[ENGINE]`: `packages/race-engine/README.md`, `packages/race-engine/docs/DESIGN_GAPS.md`. Nekopírovať.
- Zapojenie enginu do web toku pretekov: neoverené `[CHÝBA]`.

## 6. Sezóny
- Prechod sezóny (starnutie) sa spracuje lenivo: pri prvom požiadavku po hranici sezóny cez `AppShell` → `ensureGameStateProcessed()`. Je idempotentný. `[KÓD]` `lib/gameState.ts`

### Celkové hodnotenie a radar jazdca `[SCHVÁLENÉ 2026-11-14/15]`
- Jazdec má jediné hodnotenie: Celkové hodnotenie (OVR) = Výkon × 0,50 + Taktika × 0,25 + Technika × 0,20 + Skúsenosti × 0,05, z nezaokrúhlených priemerov skupín, zaokrúhlené až na konci (škála atribútov, napr. 129). Rozvoj a stav jazdca doň nevstupujú. Samostatné skóre „Výkon" sa nezobrazuje. `[KÓD]` `overallRating()` v `lib/rider/score.ts`. Staré 0–100 skóre (`riderOverall`) sa už nezobrazuje.
- Radar na Jazdec → Prehľad: osi Výkon, Taktika, Technika, Skúsenosti, Rozvoj. Skupiny Výkon/Taktika/Technika/Rozvoj sa dajú rozbaliť (naraz jedna) na jednotlivé atribúty; Skúsenosti sú jeden bod.
- Rozvoj ukazuje iba odhad (rozsah) zo skautingu a označenie „odhad"; kým odhady neexistujú, je „Neznámy". Skutočné skryté hodnoty sa hráčovi neodhaľujú. `[KÓD]` `lib/rider/radar.ts`, `lib/rider/developmentEstimates.ts`
- Čaká na implementáciu: číselné skautingové rozsahy pre Potenciál, Trénovateľnosť, Profesionalitu a Regeneráciu (dnes iba hviezdičky pre Potenciál).

### Silné stránky jazdca `[SCHVÁLENÉ 2026-11-15]`
- Informačná karta na Jazdec → Prehľad: tri najvyššie viditeľné atribúty z Výkonu, Taktiky a Techniky (skutočné hodnoty, pri zhode stále poradie skupín), každý s krátkym vysvetlením pre preteky. Bez bonusov a bez porovnania s inými jazdcami.
- Nezapočítavajú sa: Skúsenosti, priemery, Celkové hodnotenie, skryté rozvojové atribúty, stav jazdca, vybavenie.
- Pretekársky profil = existujúci štýl jazdca + popis (vhodné typy tratí). Výpočet vhodnosti pre disciplíny v projekte neexistuje. `[KÓD]` `lib/rider/strengths.ts`, `components/rider/StrengthsCard.tsx`

## 7. Trh jazdcov, rebríčky, financie, tím
- Trh (`market_riders`, stránky `/transfers`), rebríčky (`/rankings`), Tím, Scouting, Financie, Personál: v kóde existujú stránky alebo tabuľky, **pravidlá neprečítané** `[CHÝBA]`. Systém Financie je podľa komentárov ešte pred dokončením.

## 8. Účty
- Premium: riadok v `premium_entitlements`, vždy overené na serveri, nikdy cez klientský príznak. Admin: `admin_users`, rovnaký vzor. `[KÓD]`

## 9. Dáta
Tabuľky v `supabase/schema.sql` (14): league_divisions, league_memberships (podligy V1), profiles, riders, tour_registrations, training_plans, admin_users, market_riders, premium_entitlements, race_results, player_facilities, bike_condition, season_transition_processing, rider_training_progress.

## 10. Ligy a podligy V1 `[SCHVÁLENÉ 2026-11-14]`
- Päť líg: Rookie, Amateur, Continental, Pro, Elite. Podliga má max. 50 hráčov; označenie `Rookie 1.1`, `Rookie 1.2`, ... Podligy v lige sú rovnocenné, číslo nevyjadruje silu. Elite má najviac jednu podligu Elite 1.1. Ostatné podligy vznikajú podľa potreby, žiadne prázdne vopred.
- Nový hráč začína v Rookie, v podlige s najnižším číslom, ktorá má voľné miesto; ak sú všetky plné, vznikne nová. Vstupuje do aktuálnej globálnej sezóny a týždňa. Do Tour, ktorá už začala, sa nemôže prihlásiť, pripravuje sa na ďalšiu.
- Technicky: tabuľky `league_divisions` a `league_memberships`, zaradenie funkciou `assign_my_league_division` (lenivo cez `AppShell`), kapacita chránená v databáze. Migrácia musí byť nasadená. `[KÓD]` `supabase/migrations/20261114_league_divisions.sql`
- Rebríčky → karta „Moja podliga“: len členovia, bez bodov a poradia (bodovanie neexistuje).
- Bezpečnosť: liga, podliga a sezóna vstupu sú len pod serverovou kontrolou (hráč ich nemôže meniť ani podvrhnúť); `league_memberships` je hlavný zdroj, `profiles.league` je synchronizovaná kópia. Hráč môže meniť len meno a jazyk. `[KÓD]` migrácie 01–03
- Zatiaľ neriešime: postupy/zostupy, neaktivitu a vyraďovanie, bodovanie a rovnosť bodov. `[CHÝBA]`

### Vyvažovanie podlíg na konci sezóny `[SCHVÁLENÝ KONCEPT – NEIMPLEMENTOVANÉ]`
- Na konci sezóny sa podligy jednej ligy vyvažujú podľa počtu aktívnych a neaktívnych hráčov. Príklad: Rookie 1.1 má 20 aktívnych + 30 neaktívnych, Rookie 1.2 má 40 aktívnych + 10 neaktívnych → po vyvážení má každá 30 aktívnych + 20 neaktívnych.
- Pravidlá: kapacita podligy ostáva 50. Účty ani členstvo sa nemažú len pre neaktivitu; hráč sa môže kedykoľvek vrátiť. Počas sezóny sa hráči medzi podligami nepresúvajú. Vyvažuje sa až po skončení sezóny, po postupoch a zostupoch. Cieľ: čo najrovnomernejší počet aktívnych hráčov pri čo najmenšom počte presunov. Platí pre Rookie, Amateur, Continental a Pro; Elite (jedna podliga) sa nevyvažuje.
- **Aktivita nie je definovaná.** Predbežný návrh (neschválený, neimplementovaný): 28 dní bez prihlásenia. `[CHÝBA]` Algoritmus vyvažovania zatiaľ neexistuje.

## 11. Majstrovstvá sveta V1 `[SCHVÁLENÝ KONCEPT – NEIMPLEMENTOVANÉ]`
Podrobné ID rozhodnutí: `DECISIONS.md` C-015 až C-021.
- **Základ:** každú sezónu v 6. týždni, samostatné MS pre každú ligu. Jeden jednodňový pretek (nie Tour) s kombinovaným terénom (rovina, kopce, stúpania); profil sa môže meniť podľa sezóny. Nezapočítavajú sa do limitu ligových Tour. Účasť je dobrovoľná, len na pozvánku. Národnosť zatiaľ nič neovplyvňuje.
- **Kvalifikácia:** koniec 4. týždňa, nemenný snapshot poradia podlíg (sezóna, liga, podliga, jazdec, manažér, poradie, body). Z každej podligy: 35 % oprávnených aktívnych jazdcov priamo + ďalších 15 % náhradníci, obe nahor; náhradníci max. do počtu zvyšných oprávnených. Príklady: 10→4+2, 20→7+3, 30→11+5, 40→14+6, 50→18+8.
- **Pozvánky:** pondelok 5. týždňa. Priamy: prijatie = garantované miesto, odmietnutie uvoľní miesto. Náhradník: prijatie = štartuje, ak sa miesto uvoľní; voľné miesto dostane najvyšší náhradník v poradí, ktorý už prijal; nerozhodnutého vyššieho nikto nepredbehne pred uzávierkou (miesto sa rezervuje). Po povýšení netreba nové potvrdenie.
- **Uzávierka:** piatok 5. týždňa, koniec dňa v UTC (presná hranica sa upresní pri implementácii). Nepotvrdené pozvánky vypršia = neúčasť; voľné miesta doplnia potvrdení náhradníci v poradí; ak ich je málo, štartovná listina ostane menšia. Nikto nejde bez súhlasu; odmietnutie ani nepotvrdenie sa nepenalizuje.
- **Šampionáty:** jazdci podlíg jednej ligy pretekajú spolu. Nad konfigurovateľnou kapacitou (predbežne 100) sa MS delia na MS Rookie A, B, C... rovnomerne podľa počtu aj poradia (80→1; 120→2×60; 250→3×83–84; 500→5×100). Každý šampionát má vlastného víťaza a titul; spoločné finále nie. Elite = 1 šampionát. Kapacita race enginu neoverená `[CHÝBA]`.
- **Dashboard:** pred kvalifikáciou (MS, týždeň 6, kvalifikácia na konci 4. týždňa) → priama pozvánka (gratulácia, poradie, termín, Prijať/Odmietnuť) → pozvánka náhradníka (poradie, podmienky, Prijať/Odmietnuť, „Čakáš na voľné miesto“) → po povýšení („Účasť potvrdená“) → po uzávierke (pridelený šampionát a termín, alebo „MS sa nezúčastníš“). MS sa zobrazujú v kalendári aj hráčom bez pozvánky.
- **Mimo rozsah:** simulácia MS, výsledky a tituly, dúhové dresy, odmeny/body, nové mechaniky tréningu/energie/regenerácie, olympiáda a ďalšie špeciálne preteky.
- **Závisí od:** líg a podlíg (V1 rozpracované), bodovania a rebríčkov, definície „oprávnený aktívny jazdec“, plánovaných úloh (cron) a overenia kapacity race enginu.

## Čo treba doplniť (potrebujeme od vlastníka)
1. Ktoré rozhodnutia zo špecifikácie v9 sa neskôr zmenili (a ako).
2. Pravidlá trhu, financií, personálu, tímu, scoutingu a rebríčkov.
3. Pravidlá bodovania a odmien v pretekoch.
4. Ladenie pre ligy vyššie ako Rookie.
