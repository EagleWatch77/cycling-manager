/**
 * Reference values for supabase/tests/development_v2.test.sh: the TypeScript core run on the same scenarios the SQL test
 * builds. Prints JSON. Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/dbParityV2.cli.ts
 */
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { type DevRider, type HiddenTraits, DEV_CONFIG } from './config';
import { generateAptitudeProfile } from './aptitude';
import { weeklyTraining, seasonStart } from './core';

const make = (age: number, shape: number, level: number, h: HiddenTraits, seed?: number): DevRider => ({
  aptitude: seed === undefined ? undefined : generateAptitudeProfile(seed, shape),
  age, shape, attrs: Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, level])) as Record<SkillAttribute, number>,
  progress: {}, decline: {}, energy: 70, fatigue: 30, hidden: h,
});
const scenarios = [
  { name: 'talent', seed: 4242, age: 19, shape: 0, level: 130, plan: 0, mode: 'full', h: { potential: 95, trainability: 85, professionalism: 80, recovery: 70, vitality: 80 } },
  { name: 'weak', seed: 99, age: 22, shape: 6, level: 125, plan: 6, mode: 'basic', h: { potential: 15, trainability: 20, professionalism: 30, recovery: 30, vitality: 10 } },
  { name: 'profile', age: 24, shape: 1, level: 135, plan: 1, mode: 'full', seed: 777, h: { potential: 80, trainability: 70, professionalism: 60, recovery: 50, vitality: 50 } },
  { name: 'lowcap', age: 18, shape: 1, level: 90, plan: 1, mode: 'full', seed: 55, h: { potential: 5, trainability: 60, professionalism: 50, recovery: 50, vitality: 50 } },
  { name: 'wrongplan', age: 30, shape: 1, level: 140, plan: 4, mode: 'full', h: { potential: 60, trainability: 55, professionalism: 45, recovery: 90, vitality: 10 } },
];
const out: Record<string, unknown> = {};
for (const s of scenarios) {
  let r = make(s.age, s.shape, s.level, s.h, (s as { seed?: number }).seed);
  const weeks: unknown[] = [];
  for (let w = 0; w < 9; w++) { r = weeklyTraining(r, { planId: s.plan, mode: s.mode as 'basic' | 'full' }, DEV_CONFIG).rider; }
  const afterWeeks = { attrs: r.attrs, progress: r.progress, energy: r.energy, fatigue: r.fatigue };
  const nxt = seasonStart(r, s.age + 1, DEV_CONFIG);
  out[s.name] = { aptitude: r.aptitude ?? {}, weeks, afterWeeks, afterSeasonStart: { attrs: nxt.attrs, decline: nxt.decline, energy: nxt.energy, fatigue: nxt.fatigue } };
}
console.log(JSON.stringify({ scenarios, out }));
