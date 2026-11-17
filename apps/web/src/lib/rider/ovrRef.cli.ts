/** Reference OVR values for supabase/tests/ovr_f4.test.sh: prints [[attributes, overallRating], ...] for 3000 deterministic riders (incl. exact .5 cases). */
import { SKILL_ATTRIBUTES, type SkillAttribute } from './config';
import { overallRating } from './score';
let s = 987654321; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const out: [Record<SkillAttribute, number>, number][] = [];
for (let i = 0; i < 3000; i++) {
  const a = {} as Record<SkillAttribute, number>;
  const lo = 1 + Math.floor(rnd() * 120), span = 10 + Math.floor(rnd() * 80);
  for (const k of SKILL_ATTRIBUTES) a[k] = Math.min(200, lo + Math.floor(rnd() * span));
  if (i % 3 === 0) for (const k of SKILL_ATTRIBUTES) a[k] = 70 + (i % 7) * 7; // flat riders: sum7 multiple of 7 -> exact half-way cases possible
  out.push([a, overallRating(a)]);
}
console.log(JSON.stringify(out));
