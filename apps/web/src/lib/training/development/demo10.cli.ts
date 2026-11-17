/** Demo: 10 clearly different riders with their individual development room. Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/demo10.cli.ts > docs/INDIVIDUAL_PROFILES_DEMO.md */
import { SKILL_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { PHYSICAL, PLANS, type DevRider } from './config';
import { generateAptitudeProfile, unevenness, type AptitudeProfile } from './aptitude';
import { effectiveCap, techCapOf, weeklyTraining, seasonStart } from './core';

const tm = (p: AptitudeProfile) => TECHNIQUE_ATTRIBUTES.reduce((a, k) => a + p[k], 0) / 6;
const find = (shape: number, pred: (p: AptitudeProfile) => boolean, from = 1) => { for (let s = from; s < 500000; s++) { const p = generateAptitudeProfile(s, shape); if (pred(p)) return s; } throw new Error('no seed'); };
const specs: { label: string; shape: number; pred: (p: AptitudeProfile) => boolean }[] = [
  { label: 'Vrchár A – výborný kopec, slabý zjazd', shape: 0, pred: (p) => p.climbing > 0.7 && p.descending < -0.6 },
  { label: 'Vrchár B – priemerný kopec, výborný zjazd', shape: 0, pred: (p) => p.climbing < -0.2 && p.descending > 0.7 && p.cornering > 0.4 },
  { label: 'Vrchár C – vyrovnaný fyzicky aj technicky', shape: 0, pred: (p) => unevenness(p, PHYSICAL) < 0.1 && unevenness(p, TECHNIQUE_ATTRIBUTES) < 0.1 },
  { label: 'Šprintér D – technicky slabý', shape: 1, pred: (p) => tm(p) < -0.45 && p.sprint > 0.3 },
  { label: 'Šprintér E – technicky veľmi silný', shape: 1, pred: (p) => tm(p) > 0.45 && p.sprint < 0 },
  { label: 'Časovkár F – fyzicky vyrovnaný, technicky nevyrovnaný', shape: 2, pred: (p) => unevenness(p, PHYSICAL) < 0.1 && unevenness(p, TECHNIQUE_ATTRIBUTES) > 0.65 },
  { label: 'Puncheur G – fyzicky nevyrovnaný, technicky vyrovnaný', shape: 3, pred: (p) => unevenness(p, PHYSICAL) > 0.7 && unevenness(p, TECHNIQUE_ATTRIBUTES) < 0.1 },
  { label: 'Klasikár H – prekvapivo slabá hrubá cesta', shape: 4, pred: (p) => p.roughSurface < -0.6 && p.flat > 0.4 },
  { label: 'Únikár I – nevyrovnaný vo všetkom', shape: 5, pred: (p) => unevenness(p, PHYSICAL) > 0.75 && unevenness(p, TECHNIQUE_ATTRIBUTES) > 0.75 },
  { label: 'Univerzál J – silná technika, krehká fyzika', shape: 6, pred: (p) => tm(p) > 0.3 && p.endurance < -0.4 },
];
const POT = 70;
const NICE: Record<string, string> = { climbing: 'Kopec', hills: 'Vlnitý', flat: 'Rovina', sprint: 'Šprint', timeTrial: 'Časovka', endurance: 'Vytrv.', acceleration: 'Zrýchl.', descending: 'Zjazd', bikeHandling: 'Bike h.', cornering: 'Zákruty', packRiding: 'Balík', wetHandling: 'Mokro', roughSurface: 'Hrubá c.' };
const rows: string[] = [];
const head = `| Jazdec | seed | ${PHYSICAL.map((k) => NICE[k]).join(' | ')} | ${TECHNIQUE_ATTRIBUTES.map((k) => NICE[k]).join(' | ')} |\n|---|---|${'---|'.repeat(13)}`;
const after: string[] = [];
let seedFrom = 1;
for (const sp of specs) {
  const seed = find(sp.shape, sp.pred, seedFrom); seedFrom = seed + 1; const p = generateAptitudeProfile(seed, sp.shape);
  const r: DevRider = { age: 17, shape: sp.shape, attrs: Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, 105])) as Record<SkillAttribute, number>, progress: {}, decline: {}, energy: 100, fatigue: 0, hidden: { potential: POT, trainability: 50, professionalism: 50, recovery: 50, vitality: 50 }, aptitude: p };
  const cap = (k: SkillAttribute) => Math.round(PHYSICAL.includes(k) ? effectiveCap(r, k) : techCapOf(r, k));
  rows.push(`| ${sp.label} | ${seed} | ${PHYSICAL.map((k) => cap(k)).join(' | ')} | ${TECHNIQUE_ATTRIBUTES.map((k) => cap(k)).join(' | ')} |`);
  let x = r;
  for (let age = 17; age <= 32; age++) { if (age > 17) x = seasonStart(x, age); for (let w = 2; w <= 10; w++) x = weeklyTraining(x, { planId: sp.shape, mode: x.energy + 100 - x.fatigue < 140 ? 'basic' : 'full' }).rider; }
  after.push(`| ${sp.label} | ${PHYSICAL.map((k) => x.attrs[k]).join(' | ')} | ${TECHNIQUE_ATTRIBUTES.map((k) => x.attrs[k]).join(' | ')} |`);
}
console.log(`# Ukážka: 10 výrazne rozdielnych jazdcov (individuálny profil vloh)

Všetci majú rovnaký Potenciál ${POT} a vek 17; tri vrcháre A–C majú rovnaký typ, vek aj Potenciál a napriek tomu úplne iné možnosti. Hodnoty sú reálny výstup generátora a jadra (\`demo10.cli.ts\`), nie odhad.

## Strop rozvoja jednotlivých atribútov (kam až môže jazdec dorásť pri danom Potenciáli a vlohách)
Výkonnostné: strop Potenciálu − rozdiel plánu ± 30 × vloha. Technické: 160 ± 40 × vloha. „Vyrovnaný“ znamená vyrovnané vlohy; strop výkonu stále sleduje typ jazdca (plán a tvar), preto nie sú všetky stropy rovnaké. Technika sa po 32 rokoch zmení len v dvoch technických atribútoch plánu, ostatné ostávajú na štarte 105 (tréning ich netrénuje).

${head}
${rows.join('\n')}

## Dosiahnuté hodnoty vo veku 32 (prirodzený plán typu, tréning každý týždeň, všetci štartujú na 105, rovnaké skryté vlastnosti 50 okrem Potenciálu ${POT})
| Jazdec | ${PHYSICAL.map((k) => NICE[k]).join(' | ')} | ${TECHNIQUE_ATTRIBUTES.map((k) => NICE[k]).join(' | ')} |
|---|${'---|'.repeat(13)}
${after.join('\n')}
`);
void PLANS;
