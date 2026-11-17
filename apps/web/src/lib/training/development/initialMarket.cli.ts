/** Demo of the initial market: npx tsx --tsconfig tsconfig.json src/lib/training/development/initialMarket.cli.ts > docs/INITIAL_MARKET_DEMO.md */
import { PERFORMANCE_FOCUS } from '../config';
import { TECHNIQUE_ATTRIBUTES, TACTICS_ATTRIBUTES } from '@/lib/rider/config';
import { generateInitialMarketPool } from './initialMarket';
import { officialOvr } from './ovr';
import { effectiveCap } from './core';
import { SHAPE_OF_PLAN } from './config';

const pool = generateInitialMarketPool(10000, 20261117);
const ov = pool.map((r) => officialOvr(r.attributes));
const cnt = (v: number) => ov.filter((o) => o === v).length;
const mean = (a: number[]) => a.reduce((x, y) => x + y) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const NICE: Record<string, string> = { climbing: 'Kop', hills: 'Vln', flat: 'Rov', sprint: 'Špr', timeTrial: 'Čas', endurance: 'Vyt', acceleration: 'Zrý', descending: 'Zja', bikeHandling: 'Bik', cornering: 'Zák', packRiding: 'Bal', wetHandling: 'Mok', roughSurface: 'Hrub' };
// pick 10 different riders: different types, different OVR, wide Potential spread
const picks: number[] = []; const used = new Set<string>();
for (const target of [69, 70, 71, 72, 73, 74, 75, 72, 70, 74]) {
  const want = SHAPE_OF_PLAN[picks.length % 7];
  const i = pool.findIndex((r, j) => ov[j] === target && !picks.includes(j) && (picks.length < 7 ? r.inferredShape === want : true) && !used.has(r.firstName + r.surname) && (picks.length % 2 === 0 ? r.hidden.potential > 75 : r.hidden.potential < 30 || picks.length === 3));
  picks.push(i < 0 ? pool.findIndex((r, j) => ov[j] === target && !picks.includes(j)) : i); used.add(pool[picks[picks.length - 1]].firstName + pool[picks[picks.length - 1]].surname);
}
const rows = picks.map((i) => { const r = pool[i]; return `| ${r.firstName} ${r.surname} | ${r.inferredShape} | ${r.age} | **${ov[i]}** | ${PERFORMANCE_FOCUS.map((k) => r.attributes[k]).join(' / ')} | ${TECHNIQUE_ATTRIBUTES.map((k) => r.attributes[k]).join(' / ')} | ${Math.max(...TACTICS_ATTRIBUTES.map((k) => r.attributes[k]))} / ${r.attributes.experience} | ${r.hidden.potential} / ${r.hidden.trainability} | ${PERFORMANCE_FOCUS.map((k) => Math.round(effectiveCap({ hidden: r.hidden, shape: SHAPE_OF_PLAN.indexOf(r.inferredShape as never), aptitude: r.aptitude }, k))).join(' / ')} |`; });
console.log(`# Počiatočný prestupový trh – OVR 69–75 (generátor \`initialMarket.ts\`)

Reálny výstup generátora pre 10 000 jazdcov (seed 20261117), OVR = jedno oficiálne \`overallRating()\` (C-083, model F4: 0,60 V + 0,15 najlepšia taktika + 0,10 najlepšia technika + 0,15 Skúsenosti), atribúty 1–200.

| OVR | počet | podiel |
|---|---|---|
${[69, 70, 71, 72, 73, 74, 75].map((v) => `| ${v} | ${cnt(v)} | ${(100 * cnt(v) / pool.length).toFixed(1)} % |`).join('\n')}

- Najnižšie OVR ${Math.min(...ov)}, najvyššie ${Math.max(...ov)}, žiadny jazdec nad 75; počet mimo rozsahu: ${ov.filter((o) => o < 69 || o > 75).length}.
- Rozptyl atribútov v jazdcovi: medián (max − min) fyzika ${[...pool.map((r) => Math.max(...PERFORMANCE_FOCUS.map((k) => r.attributes[k])) - Math.min(...PERFORMANCE_FOCUS.map((k) => r.attributes[k])))].sort((a, b) => a - b)[5000]}, technika ${[...pool.map((r) => Math.max(...TECHNIQUE_ATTRIBUTES.map((k) => r.attributes[k])) - Math.min(...TECHNIQUE_ATTRIBUTES.map((k) => r.attributes[k])))].sort((a, b) => a - b)[5000]}.
- Potenciál: priemer ${mean(pool.map((r) => r.hidden.potential)).toFixed(1)}, sd ${sd(pool.map((r) => r.hidden.potential)).toFixed(1)}, nezávislý od štartovného OVR.
- OVR je jedno oficiálne (\`overallRating()\`, C-083, model F4) pre generátor, model rozvoja, profil jazdca aj trh.

## 10 jazdcov z trhu
Stĺpce: fyzika Kop/Vln/Rov/Špr/Čas/Vyt/Zrý, technika Zja/Bik/Zák/Bal/Mok/Hrub, najlepšia taktika / Skúsenosti, Potenciál / Trénovateľnosť (skryté, tu pre ukážku), individuálny strop 7 výkonnostných atribútov.

| Jazdec | typ | vek | OVR | fyzika | technika | taktika / skúsenosti | Pot / Trén | stropy výkonu |
|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`);
void NICE;
