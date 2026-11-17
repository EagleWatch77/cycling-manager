/**
 * Parity: the shared core must reproduce the F4 simulation (modelF2.ts runCareerF2, candidate B settings, no races)
 * attribute by attribute, for several riders, both modes and every season of a 17-35 career.
 * Run with: npx tsx --tsconfig tsconfig.json src/lib/training/development/development.parity.test.ts
 */
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { NATTR, IDX } from '../sim/career/params';
import { runCareerF2, snap2, DEF4, PLANS4 } from '../sim/career3/modelF2';
import type { Rider3 } from '../sim/career3/model3';
import { DEV_CONFIG, type DevRider } from './config';
import { weeklyTraining, seasonStart } from './core';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

const cases = [
  { arch: 0, hid: [50, 50, 50, 50, 50], mode: 'full' as const },
  { arch: 1, hid: [95, 85, 80, 70, 80], mode: 'full' as const },
  { arch: 2, hid: [15, 20, 30, 30, 30], mode: 'basic' as const },
  { arch: 6, hid: [70, 60, 40, 90, 10], mode: 'basic' as const },
  { arch: 4, hid: [88, 30, 70, 20, 60], mode: 'full' as const },
];
const base = (arch: number) => { const a = new Float64Array(NATTR); SKILL_ATTRIBUTES.forEach((k, i) => { a[i] = 100 + ((i * 7 + arch * 3) % 11); }); return a; };

for (const c of cases) {
  const attrs0 = base(c.arch);
  const pop: Rider3[] = [{ arch: c.arch, attrs: attrs0, hidden: Float64Array.from(c.hid), strat: 0, activity: 0 }];
  const cfg = { ...DEF4, plans: PLANS4, mode: c.mode, effTable: 'steep' as const, capBase: 80, capSlope: 1.25, capExp: 2, ms: false, seasons: 18 };
  const sim = runCareerF2(pop, cfg);
  let r: DevRider = {
    age: 17, shape: c.arch, attrs: Object.fromEntries(SKILL_ATTRIBUTES.map((k, i) => [k, attrs0[i]])) as Record<SkillAttribute, number>,
    progress: {}, decline: {}, energy: 100, fatigue: 0,
    hidden: { potential: c.hid[0], trainability: c.hid[1], professionalism: c.hid[2], recovery: c.hid[3], vitality: c.hid[4] },
  };
  const cf = { ...DEV_CONFIG, roundCondition: false };
  let worst = 0, where = '';
  for (let s = 1; s <= 18; s++) {
    r = seasonStart(r, 16 + s, cf);
    for (let w = 2; w <= 10; w++) r = weeklyTraining(r, { planId: c.arch, mode: c.mode }, cf).rider;
    const snap = snap2(sim, 0, s);
    for (const k of SKILL_ATTRIBUTES) { const d = Math.abs(snap[IDX[k]] - r.attrs[k]); if (d > worst) { worst = d; where = `${k}@season${s}`; } }
  }
  check(`career 17-35 identical to the F4 simulation (arch ${c.arch}, ${c.mode}, Pot ${c.hid[0]})`, worst === 0, `max diff ${worst} at ${where}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
