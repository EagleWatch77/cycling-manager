# Počiatočný prestupový trh – OVR 69–75 (generátor `initialMarket.ts`)

Reálny výstup generátora pre 10 000 jazdcov (seed 20261117), OVR = jedno oficiálne `overallRating()` (C-083, model F4: 0,60 V + 0,15 najlepšia taktika + 0,10 najlepšia technika + 0,15 Skúsenosti), atribúty 1–200.

| OVR | počet | podiel |
|---|---|---|
| 69 | 841 | 8.4 % |
| 70 | 1343 | 13.4 % |
| 71 | 1748 | 17.5 % |
| 72 | 1870 | 18.7 % |
| 73 | 1790 | 17.9 % |
| 74 | 1473 | 14.7 % |
| 75 | 935 | 9.3 % |

- Najnižšie OVR 69, najvyššie 75, žiadny jazdec nad 75; počet mimo rozsahu: 0.
- Rozptyl atribútov v jazdcovi: medián (max − min) fyzika 34, technika 26.
- Potenciál: priemer 49.8, sd 20.0, nezávislý od štartovného OVR.
- OVR je jedno oficiálne (`overallRating()`, C-083, model F4) pre generátor, model rozvoja, profil jazdca aj trh.

## 10 jazdcov z trhu
Stĺpce: fyzika Kop/Vln/Rov/Špr/Čas/Vyt/Zrý, technika Zja/Bik/Zák/Bal/Mok/Hrub, najlepšia taktika / Skúsenosti, Potenciál / Trénovateľnosť (skryté, tu pre ukážku), individuálny strop 7 výkonnostných atribútov.

| Jazdec | typ | vek | OVR | fyzika | technika | taktika / skúsenosti | Pot / Trén | stropy výkonu |
|---|---|---|---|---|---|---|---|---|
| Chris White | climber | 17 | **69** | 92 / 95 / 52 / 51 / 65 / 65 / 89 | 63 / 53 / 72 / 54 / 69 / 51 | 60 / 17 | 92 / 14 | 187 / 187 / 140 / 140 / 168 / 182 / 187 |
| Caleb Jones | sprinter | 17 | **70** | 61 / 54 / 88 / 103 / 65 / 76 / 95 | 76 / 72 / 70 / 55 / 56 / 70 | 43 / 22 | 25 / 38 | 41 / 42 / 70 / 99 / 59 / 92 / 81 |
| Nejc Bizjak | timeTrial | 18 | **71** | 67 / 77 / 89 / 72 / 85 / 92 / 70 | 54 / 57 / 56 / 61 / 65 / 70 | 61 / 30 | 80 / 52 | 111 / 142 / 179 / 110 / 155 / 176 / 117 |
| Dawid Michalski | puncheur | 19 | **72** | 81 / 87 / 67 / 81 / 89 / 71 / 86 | 62 / 76 / 59 / 70 / 66 / 60 | 61 / 32 | 21 / 75 | 82 / 84 / 35 / 61 / 89 / 32 / 85 |
| Alejandro Hernández | classics | 17 | **73** | 59 / 87 / 82 / 63 / 72 / 74 / 81 | 78 / 59 / 76 / 78 / 81 / 72 | 79 / 38 | 86 / 45 | 111 / 202 / 179 / 122 / 131 / 164 / 148 |
| Adam Wróbel | rouleur | 19 | **74** | 63 / 58 / 105 / 74 / 76 / 97 / 78 | 71 / 72 / 63 / 54 / 85 / 71 | 66 / 21 | 6 / 1 | 64 / 20 / 80 / 59 / 62 / 61 / 87 |
| Martin Marek | allrounder | 19 | **75** | 89 / 69 / 85 / 75 / 88 / 78 / 75 | 72 / 77 / 61 / 70 / 80 / 74 | 82 / 26 | 88 / 31 | 188 / 139 / 191 / 162 / 191 / 164 / 137 |
| Simone Giordano | timeTrial | 19 | **72** | 68 / 72 / 89 / 73 / 89 / 82 / 73 | 60 / 62 / 78 / 62 / 61 / 66 | 64 / 28 | 1 / 66 | 37 / 64 / 88 / 41 / 91 / 66 / 44 |
| Charlie Green | puncheur | 19 | **70** | 70 / 90 / 46 / 80 / 78 / 52 / 98 | 67 / 65 / 55 / 59 / 78 / 68 | 56 / 29 | 93 / 44 | 194 / 190 / 125 / 184 / 182 / 128 / 185 |
| Patrik Švec | timeTrial | 19 | **74** | 62 / 81 / 100 / 61 / 105 / 103 / 74 | 62 / 61 / 79 / 77 / 47 / 49 | 38 / 25 | 14 / 61 | 22 / 73 / 95 / 14 / 104 / 96 / 44 |

