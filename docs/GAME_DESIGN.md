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

## 7. Trh jazdcov, rebríčky, financie, tím
- Trh (`market_riders`, stránky `/transfers`), rebríčky (`/rankings`), Tím, Scouting, Financie, Personál: v kóde existujú stránky alebo tabuľky, **pravidlá neprečítané** `[CHÝBA]`. Systém Financie je podľa komentárov ešte pred dokončením.

## 8. Účty
- Premium: riadok v `premium_entitlements`, vždy overené na serveri, nikdy cez klientský príznak. Admin: `admin_users`, rovnaký vzor. `[KÓD]`

## 9. Dáta
Tabuľky v `supabase/schema.sql` (12): profiles, riders, tour_registrations, training_plans, admin_users, market_riders, premium_entitlements, race_results, player_facilities, bike_condition, season_transition_processing, rider_training_progress.

## Čo treba doplniť (potrebujeme od vlastníka)
1. Ktoré rozhodnutia zo špecifikácie v9 sa neskôr zmenili (a ako).
2. Pravidlá trhu, financií, personálu, tímu, scoutingu a rebríčkov.
3. Pravidlá bodovania a odmien v pretekoch.
4. Ladenie pre ligy vyššie ako Rookie.
