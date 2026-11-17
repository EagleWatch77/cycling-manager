# Ukážka: 10 výrazne rozdielnych jazdcov (individuálny profil vloh)

Všetci majú rovnaký Potenciál 70 a vek 17; tri vrcháre A–C majú rovnaký typ, vek aj Potenciál a napriek tomu úplne iné možnosti. Hodnoty sú reálny výstup generátora a jadra (`demo10.cli.ts`), nie odhad.

## Strop rozvoja jednotlivých atribútov (kam až môže jazdec dorásť pri danom Potenciáli a vlohách)
Výkonnostné: strop Potenciálu − rozdiel plánu ± 30 × vloha. Technické: 160 ± 40 × vloha. „Vyrovnaný“ znamená vyrovnané vlohy; strop výkonu stále sleduje typ jazdca (plán a tvar), preto nie sú všetky stropy rovnaké. Technika sa po 32 rokoch zmení len v dvoch technických atribútoch plánu, ostatné ostávajú na štarte 105 (tréning ich netrénuje).

| Jazdec | seed | Kopec | Vlnitý | Rovina | Šprint | Časovka | Vytrv. | Zrýchl. | Zjazd | Bike h. | Zákruty | Balík | Mokro | Hrubá c. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Vrchár A – výborný kopec, slabý zjazd | 42 | 169 | 133 | 66 | 112 | 111 | 134 | 155 | 120 | 148 | 134 | 133 | 141 | 137 |
| Vrchár B – priemerný kopec, výborný zjazd | 150 | 113 | 166 | 77 | 125 | 129 | 117 | 152 | 195 | 132 | 180 | 133 | 120 | 139 |
| Vrchár C – vyrovnaný fyzicky aj technicky | 154 | 136 | 141 | 97 | 96 | 126 | 144 | 140 | 156 | 157 | 156 | 156 | 160 | 154 |
| Šprintér D – technicky slabý | 161 | 122 | 91 | 132 | 160 | 99 | 122 | 134 | 121 | 178 | 132 | 136 | 141 | 120 |
| Šprintér E – technicky veľmi silný | 172 | 75 | 104 | 133 | 111 | 151 | 133 | 148 | 179 | 182 | 186 | 173 | 181 | 181 |
| Časovkár F – fyzicky vyrovnaný, technicky nevyrovnaný | 212 | 97 | 120 | 144 | 95 | 144 | 138 | 121 | 144 | 120 | 158 | 200 | 139 | 121 |
| Puncheur G – fyzicky nevyrovnaný, technicky vyrovnaný | 269 | 171 | 145 | 99 | 151 | 105 | 71 | 111 | 167 | 165 | 172 | 168 | 165 | 169 |
| Klasikár H – prekvapivo slabá hrubá cesta | 313 | 85 | 162 | 159 | 102 | 108 | 127 | 115 | 136 | 138 | 120 | 148 | 138 | 120 |
| Únikár I – nevyrovnaný vo všetkom | 1451 | 66 | 91 | 166 | 151 | 143 | 147 | 111 | 125 | 120 | 137 | 200 | 132 | 183 |
| Univerzál J – silná technika, krehká fyzika | 1459 | 116 | 142 | 132 | 115 | 142 | 103 | 161 | 154 | 157 | 196 | 196 | 174 | 168 |

## Dosiahnuté hodnoty vo veku 32 (prirodzený plán typu, tréning každý týždeň, všetci štartujú na 105, rovnaké skryté vlastnosti 50 okrem Potenciálu 70)
| Jazdec | Kopec | Vlnitý | Rovina | Šprint | Časovka | Vytrv. | Zrýchl. | Zjazd | Bike h. | Zákruty | Balík | Mokro | Hrubá c. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Vrchár A – výborný kopec, slabý zjazd | 179 | 140 | 102 | 113 | 115 | 145 | 150 | 131 | 105 | 138 | 105 | 105 | 105 |
| Vrchár B – priemerný kopec, výborný zjazd | 125 | 171 | 102 | 124 | 130 | 128 | 147 | 188 | 105 | 170 | 105 | 105 | 105 |
| Vrchár C – vyrovnaný fyzicky aj technicky | 147 | 148 | 106 | 103 | 127 | 154 | 138 | 162 | 105 | 156 | 105 | 105 | 105 |
| Šprintér D – technicky slabý | 124 | 104 | 140 | 168 | 107 | 124 | 141 | 105 | 169 | 105 | 146 | 105 | 105 |
| Šprintér E – technicky veľmi silný | 102 | 110 | 140 | 121 | 149 | 134 | 155 | 105 | 170 | 105 | 175 | 105 | 105 |
| Časovkár F – fyzicky vyrovnaný, technicky nevyrovnaný | 106 | 122 | 153 | 103 | 155 | 146 | 121 | 105 | 126 | 164 | 105 | 105 | 105 |
| Puncheur G – fyzicky nevyrovnaný, technicky vyrovnaný | 176 | 155 | 107 | 147 | 111 | 103 | 120 | 163 | 105 | 174 | 105 | 105 | 105 |
| Klasikár H – prekvapivo slabá hrubá cesta | 103 | 168 | 169 | 106 | 112 | 138 | 116 | 105 | 105 | 105 | 105 | 142 | 131 |
| Únikár I – nevyrovnaný vo všetkom | 102 | 104 | 174 | 147 | 142 | 158 | 118 | 136 | 126 | 105 | 105 | 105 | 105 |
| Univerzál J – silná technika, krehká fyzika | 119 | 151 | 140 | 116 | 141 | 117 | 155 | 105 | 156 | 105 | 188 | 105 | 105 |

