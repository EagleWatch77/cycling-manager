/**
 * Individual aptitude profile — targeted tests. Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/aptitude.test.ts
 */
import { PERFORMANCE_FOCUS } from '../config';
import { TECHNIQUE_ATTRIBUTES, SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { DEV_CONFIG, PLANS, type DevRider } from './config';
import { generateAptitudeProfile, unevenness, isNearlyBalanced, type AptitudeProfile } from './aptitude';
import { weeklyTraining, effectiveCap } from './core';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const SHAPES = 7;
const prof = (seed: number, shape = 0) => generateAptitudeProfile(seed, shape);
const corr = (a: number[], b: number[]) => { const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); };

// ---- stability + shape of the profile ----
const p = prof(12345, 0);
check('profile has all 7 physical and 6 technical attributes', [...PERFORMANCE_FOCUS, ...TECHNIQUE_ATTRIBUTES].every((k) => typeof p[k] === 'number') && Object.keys(p).length === 13);
check('profile is stable: same seed -> identical profile (whole career)', JSON.stringify(prof(12345, 0)) === JSON.stringify(p));
check('all values lie in [-1, 1] with two decimals', Object.values(p).every((v) => v >= -1 && v <= 1 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9));
check('two riders of the same type differ', JSON.stringify(prof(1, 0)) !== JSON.stringify(prof(2, 0)));
check('no fixed pattern: 200 climbers give 200 different profiles', new Set(Array.from({ length: 200 }, (_, i) => JSON.stringify(prof(1000 + i, 0)))).size === 200);

// ---- population statistics (10 000 profiles, cheap) ----
const N = 10000;
const pop = Array.from({ length: N }, (_, i) => ({ shape: i % SHAPES, p: prof(i * 7919 + 13, i % SHAPES) }));
const physSd = pop.map((x) => unevenness(x.p, PERFORMANCE_FOCUS)), techSd = pop.map((x) => unevenness(x.p, TECHNIQUE_ATTRIBUTES));
const balPhys = physSd.filter((v) => v < 0.15).length / N, balTech = techSd.filter((v) => v < 0.15).length / N;
const balBoth = pop.filter((x) => isNearlyBalanced(x.p)).length / N;
check('almost completely balanced riders are rare (~1 in 50: 1 % .. 4 %)', balBoth >= 0.01 && balBoth <= 0.04, `${balBoth}`);
check('physically balanced alone is a minority (< 25 %), not the majority', balPhys < 0.25 && balPhys > balBoth, `${balPhys}`);
check('technically balanced alone is a minority (< 25 %)', balTech < 0.25 && balTech > balBoth, `${balTech}`);
check('physical and technical unevenness are independent (|corr| < 0.05)', Math.abs(corr(physSd, techSd)) < 0.05, `${corr(physSd, techSd)}`);
const c = pop.filter((x) => x.shape === 0);
check('a good climber (climbing aptitude high) does NOT imply good descending (|corr| < 0.08)', Math.abs(corr(c.map((x) => x.p.climbing), c.map((x) => x.p.descending))) < 0.08, `${corr(c.map((x) => x.p.climbing), c.map((x) => x.p.descending))}`);
const s = pop.filter((x) => x.shape === 1);
check('a sprinter can be technically weak: > 15 % of sprinters have a technical mean aptitude < -0.2', s.filter((x) => TECHNIQUE_ATTRIBUTES.reduce((a, k) => a + x.p[k], 0) / 6 < -0.2).length / s.length > 0.15);
check('and technically strong: > 15 % have mean > +0.2', s.filter((x) => TECHNIQUE_ATTRIBUTES.reduce((a, k) => a + x.p[k], 0) / 6 > 0.2).length / s.length > 0.15);
check('physical aptitude keeps the total: mean over the 7 stays ~0 (|mean| < 0.1 for 95 % of riders)', pop.filter((x) => Math.abs(PERFORMANCE_FOCUS.reduce((a, k) => a + x.p[k], 0) / 7) < 0.1).length / N > 0.95);
const bias = (k: SkillAttribute) => s.reduce((a, x) => a + x.p[k], 0) / s.length;
check('type only nudges: sprinters are on average slightly better in sprint than climbing, but the profile is not fixed', bias('sprint') > bias('climbing') && bias('sprint') < 0.45);
const spread = (k: SkillAttribute) => { const v = s.map((x) => x.p[k]); const m = v.reduce((a, b) => a + b) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
check('within one type every attribute still varies a lot (sd > 0.3)', PERFORMANCE_FOCUS.every((k) => spread(k) > 0.3) && TECHNIQUE_ATTRIBUTES.every((k) => spread(k) > 0.3));

// ---- effect on development: same type, age, Potential -> different room per attribute ----
const mk = (seed: number, shape = 0, potential = 60): DevRider => ({
  age: 20, shape, attrs: Object.fromEntries(SKILL_ATTRIBUTES.map((k) => [k, 100])) as Record<SkillAttribute, number>, progress: {}, decline: {},
  energy: 100, fatigue: 0, hidden: { potential, trainability: 50, professionalism: 50, recovery: 50, vitality: 50 }, aptitude: prof(seed, shape),
});
const a = mk(3), b = mk(4);
const capsA = PERFORMANCE_FOCUS.map((k) => effectiveCap(a, k)), capsB = PERFORMANCE_FOCUS.map((k) => effectiveCap(b, k));
check('same type, age and Potential: different attribute ceilings', JSON.stringify(capsA) !== JSON.stringify(capsB));
check('aptitude moves a ceiling by at most +-30 points', PERFORMANCE_FOCUS.every((k, i) => Math.abs(capsA[i] - effectiveCap({ ...a, aptitude: undefined }, k)) <= 30 + 1e-9));
check('Potential keeps its meaning: higher Potential -> higher ceilings for the same profile', PERFORMANCE_FOCUS.every((k) => effectiveCap(mk(3, 0, 90), k) > effectiveCap(mk(3, 0, 30), k)));
check('the average physical ceiling is unchanged by aptitude (the plan of Potential stays)', Math.abs(PERFORMANCE_FOCUS.reduce((x, k) => x + effectiveCap(a, k) - effectiveCap({ ...a, aptitude: undefined }, k), 0) / 7) < 3);
let hi = mk(5, 0, 95), lo = mk(5, 0, 95);
hi = { ...hi, aptitude: { ...hi.aptitude!, climbing: 1, descending: -1 } }; lo = { ...lo, aptitude: { ...lo.aptitude!, climbing: -1, descending: 1 } };
const run = (r: DevRider, w: number) => { let x = r; for (let i = 0; i < w; i++) x = weeklyTraining(x, { planId: 0, mode: 'full' }, DEV_CONFIG).rider; return x; };
const rh = run(hi, 300), rl = run(lo, 300);
check('same plan: high climbing aptitude climbs higher, low one stalls earlier', rh.attrs.climbing > rl.attrs.climbing + 15, `${rh.attrs.climbing} ${rl.attrs.climbing}`);
check('same plan: low descending aptitude caps Descending, high one grows further', rl.attrs.descending > rh.attrs.descending + 15 && rh.attrs.descending < 175, `${rh.attrs.descending} ${rl.attrs.descending}`);
check('training does NOT level everything: untrained attributes keep their own ceilings', rh.attrs.sprint !== rh.attrs.climbing);
const neutral = { ...mk(5), aptitude: undefined }; const nr = run(neutral, 300);
check('a rider without a profile (legacy) behaves exactly as before: no technique ceiling', nr.attrs.descending >= 190, `${nr.attrs.descending}`);
check('PLANS unchanged (still the seven approved plans)', PLANS.length === 7 && PLANS[0].phys.join() === 'climbing,endurance,hills');
check('coefficients unchanged', DEV_CONFIG.cPhys === 1.8 && DEV_CONFIG.cTech === 6.5 && DEV_CONFIG.coefPhys.join() === '1.15,0.95,0.75' && DEV_CONFIG.coefTech.join() === '0.85,0.45');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
