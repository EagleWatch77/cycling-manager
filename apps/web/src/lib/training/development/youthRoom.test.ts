/**
 * Working model S1 + O5 (owner 2026-11-19): cap 80 + 150 x (Pot/100)^2, plus a youth floor of the physical room factor:
 * 0.30 up to age 21, falling linearly to 0 at age 26; a rider with naturally more room uses the normal value; hard maximum 200.
 * Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/youthRoom.test.ts
 */
import { PERFORMANCE_FOCUS } from '../config';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { DEV_CONFIG, type DevRider } from './config';
import { roomPhys, softCap, weeklyTraining, youthRoomFloor } from './core';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) <= e;

// S1
check('S1: cap slope 1.5, base 80, exponent 2', DEV_CONFIG.capBase === 80 && DEV_CONFIG.capSlope === 1.5 && DEV_CONFIG.capExp === 2);
const caps = [20, 50, 75, 90, 95, 100].map((p) => Math.round(softCap(p))).join();
check('S1 cap at Pot 20/50/75/90/95/100 = 86/118/164/202/215/230 (hard max 200 applies separately)', caps === '86,118,164,202,215,230', caps);
check('hard maximum stays 200', DEV_CONFIG.maxAttribute === 200);

// O5 floor values and the boundaries 21 / 26
const f = (age: number) => youthRoomFloor(age);
check('floor is 0.30 for ages up to and including 21', [15, 17, 20, 21].every((a) => near(f(a), 0.30)));
check('floor falls linearly: 22 = 0.24, 23 = 0.18, 24 = 0.12, 25 = 0.06', near(f(22), 0.24) && near(f(23), 0.18) && near(f(24), 0.12) && near(f(25), 0.06), [22, 23, 24, 25].map(f).join());
check('floor is 0 from age 26 on (26, 27, 40)', f(26) === 0 && f(27) === 0 && f(40) === 0);
check('floor is continuous and never increases with age', Array.from({ length: 30 }, (_, i) => 15 + i).every((a, i, arr) => i === 0 || f(a) <= f(arr[i - 1]) + 1e-12));
check('floor is never negative and never above 0.30', Array.from({ length: 60 }, (_, i) => f(10 + i)).every((v) => v >= 0 && v <= 0.30 + 1e-12));

// roomPhys with age
const cap = 90; // a low individual ceiling
check('above the soft cap a young rider still has room 0.30 (age 17..21)', [17, 21].every((age) => near(roomPhys(150, cap, DEV_CONFIG, age), 0.30)));
check('the floor shrinks with age above the cap: 23 -> 0.18, 25 -> 0.06', near(roomPhys(150, cap, DEV_CONFIG, 23), 0.18) && near(roomPhys(150, cap, DEV_CONFIG, 25), 0.06));
check('age 26+ above the cap: only the (tiny) normal soft-cap value, no floor', roomPhys(150, cap, DEV_CONFIG, 26) < 1e-3 && roomPhys(150, cap, DEV_CONFIG, 30) < 1e-3);
const normal = roomPhys(50, 150, DEV_CONFIG);
check('a rider with naturally more room uses his normal value (not the floor)', normal > 0.99 && near(roomPhys(50, 150, DEV_CONFIG, 19), normal));
const lo = roomPhys(cap - 20, cap, DEV_CONFIG), loY = roomPhys(cap - 20, cap, DEV_CONFIG, 19), hiN = roomPhys(cap + 4, cap, DEV_CONFIG), hiY = roomPhys(cap + 4, cap, DEV_CONFIG, 19);
check('exactly max(normal, floor): normal wins where it is larger than 0.30 (below the cap), the floor where it is smaller (above)', near(loY, lo) && lo > 0.30 && hiN < 0.30 && near(hiY, 0.30));
check('regression: without an age the old behaviour is unchanged', near(roomPhys(100, 120, DEV_CONFIG), 1 / (1 + Math.exp((100 - (120 - DEV_CONFIG.softOffset)) / DEV_CONFIG.softWidth))));
check('hard maximum: room is 0 at 200 whatever the age (floor does not override it)', roomPhys(200, 90, DEV_CONFIG, 17) === 0 && roomPhys(201, 90, DEV_CONFIG, 17) === 0 && roomPhys(199, 90, DEV_CONFIG, 17) === 0.30);

// weeklyTraining end to end
const mk = (age: number, pot: number, start: number): DevRider => ({ age, shape: 0, attrs: Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, start])) as Record<SkillAttribute, number>, progress: {}, decline: {}, energy: 100, fatigue: 0,
  hidden: { potential: pot, trainability: 80, professionalism: 80, recovery: 80, vitality: 50 } as DevRider['hidden'], aptitude: Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, 0])) as DevRider['aptitude'] });
const train = (r0: DevRider, weeks: number): DevRider => { let r = r0; for (let w = 0; w < weeks; w++) r = weeklyTraining({ ...r, energy: 100, fatigue: 0, age: r0.age }, { planId: 0, mode: 'full' }, DEV_CONFIG).rider; return r; };
const sumPerf = (r: DevRider) => PERFORMANCE_FOCUS.reduce((s, k) => s + r.attrs[k], 0);
const young = train(mk(19, 20, 100), 20), old = train(mk(27, 20, 100), 20), start = sumPerf(mk(19, 20, 100));
check('low-Potential young rider starting ABOVE his ceiling still grows (Pot 20, age 19, 20 weeks)', sumPerf(young) - start > 20, `${sumPerf(young) - start}`);
check('the same rider at age 27 does not (no room beyond the soft cap)', sumPerf(old) - start <= 3, `${sumPerf(old) - start}`);
check('training never lowers an attribute', PERFORMANCE_FOCUS.every((k) => young.attrs[k] >= 100 && old.attrs[k] >= 100));
const top = train(mk(20, 20, 190), 400);
check('hard maximum 200: no attribute ever above 200 even with the floor (400 weeks)', SKILL_ATTRIBUTES.every((k) => top.attrs[k] <= 200) && PERFORMANCE_FOCUS.some((k) => top.attrs[k] === 200));
const hi = train(mk(20, 100, 150), 600);
check('Potential 100 (cap 230): still stops at exactly 200', SKILL_ATTRIBUTES.every((k) => hi.attrs[k] <= 200) && PERFORMANCE_FOCUS.some((k) => hi.attrs[k] === 200));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
