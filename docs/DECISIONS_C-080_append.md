## C-080 – Individuálny profil vloh jazdca (rozvoj V2) – IMPLEMENTOVANÉ ZA VYPÍNAČOM (default VYPNUTÝ)
- Interný profil 13 hodnôt (-1..1) pre 7 výkonnostných a 6 technických atribútov, stabilný celú kariéru, hráčovi sa neukazuje. Generátor `development/aptitude.ts` je deterministický zo seedu (10 000+ jazdcov, žiadny pevný vzor podľa typu; typ len mierne posúva fyziku).
- Výkon a technika sa losujú nezávisle (vlastná nevyrovnanosť aj úroveň). Takmer vyrovnaná skupina ~14 % samostatne, v oboch skupinách naraz ~2 % (pravdepodobnosť, nie kvóta).
- Účinok: strop výkonného atribútu = strop Potenciálu − rozdiel plánu ± 30 × vloha (priemer 7 stropov zostáva); technický atribút má vlastný mäkký strop 160 ± 40 × vloha. Jazdec bez profilu (starý) sa správa ako doteraz. Koeficienty a 7 plánov NEZMENENÉ.
- Migrácia 20261117_01 (stále nespustená) doplnená o `riders/market_riders.aptitude_profile`; vypínač ostáva VYPNUTÝ.
- Otvorené: zápis profilu pri vzniku jazdca (starter, trh, AI) spolu s Vitalitou; prémiové filtre trhu a odhad rozvoja zatiaľ neimplementované.
