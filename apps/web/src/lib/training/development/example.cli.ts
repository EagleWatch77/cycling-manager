/** Example career of a weak, an average and a talented rider (core model, training set EVERY available week = 9 weeks/season). Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/example.cli.ts */
import { SKILL_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { PHYSICAL, productionShape, type DevRider, type HiddenTraits } from './config';
import { officialOvr } from './ovr';
import { weeklyTraining, seasonStart, readinessOf } from './core';

const start = (shape: number, h: HiddenTraits): DevRider => {
  const sh = productionShape(shape);
  const attrs = Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, 100])) as Record<SkillAttribute, number>;
  for (const k of PHYSICAL) attrs[k] = (sh.strong as readonly string[]).includes(k) ? 118 : (sh.weak as readonly string[]).includes(k) ? 100 : 108;
  for (const k of TECHNIQUE_ATTRIBUTES) attrs[k] = 105;
  return { age: 17, shape, attrs, progress: {}, decline: {}, energy: 100, fatigue: 0, hidden: h };
};
const riders = {
  slabý: start(0, { potential: 15, trainability: 25, professionalism: 30, recovery: 35, vitality: 20 }),
  priemerný: start(0, { potential: 50, trainability: 50, professionalism: 50, recovery: 50, vitality: 50 }),
  talent: start(0, { potential: 95, trainability: 85, professionalism: 80, recovery: 75, vitality: 85 }),
};
const mean = (r: DevRider, ks: readonly SkillAttribute[]) => ks.reduce((s, k) => s + r.attrs[k], 0) / ks.length;
const top3 = (r: DevRider) => PHYSICAL.map((k) => r.attrs[k]).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 3;
const vOf = (r: DevRider) => 0.6 * top3(r) + 0.4 * mean(r, PHYSICAL);
const best = (r: DevRider, ks: readonly SkillAttribute[]) => Math.max(...ks.map((k) => r.attrs[k]));
const rows: Record<string, unknown[]> = {};
for (const [name, r0] of Object.entries(riders)) {
  let r = r0; rows[name] = [];
  for (let age = 17; age <= 35; age++) {
    if (age > 17) r = seasonStart(r, age);
    for (let w = 2; w <= 10; w++) { const mode = readinessOf(r.energy, r.fatigue) < 70 ? 'basic' : 'full'; r = weeklyTraining(r, { planId: 0, mode }).rider; }
    rows[name].push({ age, climbing: r.attrs.climbing, physMean: +mean(r, PHYSICAL).toFixed(1), V: +vOf(r).toFixed(1), tech: best(r, TECHNIQUE_ATTRIBUTES), ovr: officialOvr(r.attrs) });
  }
}
console.log(JSON.stringify(rows));
