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
- Potenciál prvých 100 jazdcov: **55–95** (jednotná produkčná škála). Overená kompatibilita: SQL `rider_score_to_level`, `overall_potential_factor` (ease = (Pot−55)/40) aj validácia `create_my_starter_rider` majú 55–95 pevne; rozdelenie N(50,20) z modelu F4/V2 by dalo ~60 % jazdcov Potenciál pod 55 (1 hviezdička, nulová „ease“) bez zmeny SQL. Priestor na rozvoj sa pri OVR < 140 neuplatňuje (váha 0), takže rozdiel sa prejaví až neskôr. Zmena škály Potenciálu = samostatné rozhodnutie spolu so zmenou SQL funkcií a hviezdičiek.

## C-094 – Skryté hodnoty trhu (O-011) – SCHVÁLENÝ PRINCÍP, migrácia pripravená
- Hráčom sa sprístupnia len verejné stĺpce trhu a hviezdičky potenciálu (`potential_stars`); skryté hodnoty a koeficienty nie. Admin ich vidí v Supabase a cez kontrolovanú funkciu. Nasadenie rozdelené na časť A (pridanie stĺpca + admin funkcia), nasadenie kódu, časť B (odobratie čítania skrytých stĺpcov).
