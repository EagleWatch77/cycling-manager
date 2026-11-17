/**
 * One official OVR for generator, development model, rider profile and transfer market.
 * Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/ovr.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { overallRating } from '@/lib/rider/score';
import { officialOvr, OFFICIAL_OVR_SOURCE } from './ovr';
import { generateMarketRider, INITIAL_MARKET_OVR } from './initialMarket';
import * as initialMarket from './initialMarket';
import { SKILL_ATTRIBUTES } from '@/lib/rider/config';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const dir = path.dirname(new URL(import.meta.url).pathname);
const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => ({ f, s: fs.readFileSync(path.join(dir, f), 'utf8') }));

check('the official OVR is the production overallRating() (C-083, model F4), same function', officialOvr === overallRating && OFFICIAL_OVR_SOURCE.includes('overallRating'));
const r = generateMarketRider(11, INITIAL_MARKET_OVR);
check('market rider OVR = official OVR of the stored attributes', officialOvr(r.attributes) >= 69 && officialOvr(r.attributes) <= 75);
check('no second OVR formula is exported from the generator (trainingOvr/ovrInRange are gone)', !('trainingOvr' in initialMarket) && !('ovrInRange' in initialMarket) || typeof (initialMarket as Record<string, unknown>).trainingOvr === 'undefined');
check('only ovr.ts imports overallRating in the development module', sources.filter((x) => /import[^;]*overallRating[^;]*from/.test(x.s) && x.f !== 'ovr.ts').length === 0, sources.filter((x) => /import[^;]*overallRating[^;]*from/.test(x.s) && x.f !== 'ovr.ts').map((x) => x.f).join());
check('no development-module file re-implements an OVR (0.15 x best tactic / 0.60 x V weights)', sources.every((x) => !/0\.15 \* Math\.max|0\.6 \* \(W|trainingOvr/.test(x.s)), sources.filter((x) => /0\.15 \* Math\.max|0\.6 \* \(W|trainingOvr/.test(x.s)).map((x) => x.f).join());
const flat = (v: number) => Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, v])) as Record<(typeof SKILL_ATTRIBUTES)[number], number>;
check('F4 weights: all 100 -> 100; the 7 performance attributes at 170, rest 100 -> V 170 -> 0.6x170 + 15 + 10 + 15 = 142', officialOvr(flat(100)) === 100
  && officialOvr({ ...flat(100), climbing: 170, hills: 170, flat: 170, sprint: 170, timeTrial: 170, endurance: 170, acceleration: 170 }) === 142);
check('F4 worked example: V = 0.6 x top3 + 0.4 x mean7 (top-3 only 170, rest 100 -> V = 0.6x170 + 0.4x(3x170+4x100)/7), OVR = round(0.6V + 0.15xT + 0.10xTe + 0.15xE)',
  officialOvr({ ...flat(100), climbing: 170, hills: 170, flat: 170 }) === Math.round(0.6 * (0.6 * 170 + 0.4 * (3 * 170 + 400) / 7) + 15 + 10 + 15));
check('tactics/technique count only through their BEST attribute (a weak second-best changes nothing)', officialOvr({ ...flat(100), positioning: 150, reaction: 20, descending: 140, cornering: 20 }) === officialOvr({ ...flat(100), positioning: 150, descending: 140 }));
check('generator ovr window uses exactly this function (no local OVR, no rounding before the end)', sources.find((x) => x.f === 'initialMarket.ts')!.s.includes("officialOvr(a)") && !/Math\.round\(\s*officialOvr/.test(sources.find((x) => x.f === 'initialMarket.ts')!.s));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
