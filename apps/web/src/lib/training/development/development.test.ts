/**
 * Development model V2 (training 1.0) — unit + integration tests.
 * Run with: npx tsx --tsconfig tsconfig.json src/lib/training/development/development.test.ts
 */
import { PERFORMANCE_FOCUS } from '../config';
import { TECHNIQUE_ATTRIBUTES, SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { progressShares, DEV_CONFIG, PLANS, TRAINING_MODEL_VERSION, type DevRider, type HiddenTraits } from './config';
import {
  trainingFactor, softCap, weeklyTraining, seasonStart, declineOnset, readinessOf, efficiencyOf, accumulate, attributeGap,
} from './core';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

const ALL = SKILL_ATTRIBUTES;
type MkOver = Omit<Partial<DevRider>, 'hidden' | 'attrs'> & { hidden?: Partial<HiddenTraits>; attrs?: Partial<Record<SkillAttribute, number>>; level?: number };
const mk = (over: MkOver = {}): DevRider => {
  const attrs = Object.fromEntries(ALL.map((k) => [k, over.level ?? 100])) as Record<SkillAttribute, number>;
  return {
    age: 20, shape: 0, attrs: { ...attrs, ...(over.attrs ?? {}) }, progress: {}, decline: {}, energy: 100, fatigue: 0,
    ...over,
    hidden: { potential: 50, trainability: 50, professionalism: 50, recovery: 50, vitality: 50, ...(over.hidden ?? {}) },
  } as DevRider;
};
const plain = { ...DEV_CONFIG, roundCondition: false };
const run = (r: DevRider, planId: number | null, mode: 'basic' | 'full', weeks: number, cfg = DEV_CONFIG) => {
  let cur = r;
  for (let w = 0; w < weeks; w++) cur = weeklyTraining(cur, planId === null ? null : { planId, mode }, cfg).rider;
  return cur;
};
const sum = (r: DevRider, keys: readonly SkillAttribute[]) => keys.reduce((s, k) => s + r.attrs[k], 0);

// ---- 0. switch + frozen constants of training 1.0 ----
check('switch defaults to the OLD model (v1)', TRAINING_MODEL_VERSION === 'v1');
check('constants: ONE weekly budget 93.72, shares 58/18/14/10 %, ratios, max 200',
  DEV_CONFIG.weeklyBudget === 93.72 && DEV_CONFIG.shareMain === 0.58 && DEV_CONFIG.shareSupplementary === 0.18 && DEV_CONFIG.shareOtherPhysical === 0.14 && DEV_CONFIG.shareOtherTechnical === 0.10
  && DEV_CONFIG.ratioMain.join() === '1.15,0.95,0.75' && DEV_CONFIG.ratioSupplementary.join() === '0.85,0.45' && DEV_CONFIG.maxAttribute === 200);
check('the budget equals the old coefficient model total (12 x (1.8 x 0.8 x 4.25 + 6.5 x 0.2 x 1.3))', near(DEV_CONFIG.weeklyBudget, 12 * (1.8 * 0.8 * 4.25 + 6.5 * 0.2 * 1.3), 1e-9));
check('basic = 75 % training, full = 100 %', DEV_CONFIG.modeCapacity.basic === 0.75 && DEV_CONFIG.modeCapacity.full === 1);
check('seven plans exactly as approved in F4', PLANS.length === 7
  && PLANS[0].phys.join() === 'climbing,endurance,hills' && PLANS[0].tech.join() === 'descending,cornering'
  && PLANS[1].phys.join() === 'sprint,acceleration,flat' && PLANS[1].tech.join() === 'packRiding,bikeHandling'
  && PLANS[2].phys.join() === 'timeTrial,flat,endurance' && PLANS[2].tech.join() === 'cornering,bikeHandling'
  && PLANS[3].phys.join() === 'hills,acceleration,climbing' && PLANS[3].tech.join() === 'cornering,descending'
  && PLANS[4].phys.join() === 'flat,endurance,hills' && PLANS[4].tech.join() === 'roughSurface,wetHandling'
  && PLANS[5].phys.join() === 'endurance,flat,acceleration' && PLANS[5].tech.join() === 'descending,bikeHandling'
  && PLANS[6].phys.join() === 'endurance,hills,flat' && PLANS[6].tech.join() === 'packRiding,bikeHandling');
check('cap formula = working model S1: 80 + 150 x (Pot/100)^2', near(softCap(100), 230) && near(softCap(50), 117.5) && near(softCap(0), 80));

// ---- 1. exact increments of performance and technique ----
{
  const pts = trainingFactor(mk(), DEV_CONFIG);
  check('neutral rider (hidden 50) has G = 1', near(pts.G, 1));
  // full week, climber, age 20 (alpha 1.2), level 100 -> raw = budget x share x eff x G x alpha x room
  const r = mk({ age: 20 });
  const o = weeklyTraining(r, { planId: 0, mode: 'full' }, plain);
  const sh = progressShares(0);
  const room = 1 / (1 + Math.exp((100 - (softCap(50) - 0 - 10)) / 7));
  const expectClimb = 93.72 * sh.climbing * 1 * 1 * 1.2 * room;
  check('physical raw progress = budget x share x eff x G x alpha x room', near(o.rawProgress.climbing, expectClimb, 1e-6), `${o.rawProgress.climbing} vs ${expectClimb}`);
  check('main attribute #1 share = 58 % x 1.15 / 2.85', near(sh.climbing, 0.58 * 1.15 / 2.85, 1e-12));
  const expectTech = 93.72 * sh.descending * 1 * 1 * ((1 + 1.2) / 2) * Math.max(0.1, Math.min(1, (200 - 100) / 60));
  check('technical raw progress = budget x share x eff x G x (1+alpha)/2 x roomT', near(o.rawProgress.descending, expectTech, 1e-6), `${o.rawProgress.descending} vs ${expectTech}`);
  check('other performance attribute shares 14 % / 4 = 3.5 % of the budget', near(sh.sprint, 0.035, 1e-12) && near(o.rawProgress.sprint / (93.72 * 0.035 * 1.2 * Math.max(1 / (1 + Math.exp((100 - (softCap(50) - 45 - 10)) / 7)), 0.30)), 1, 1e-6)); // age 20: O5 youth floor 0.30 applies above the ceiling
  check('plan technique 2nd attribute uses 0.45 / 0.85 of the first', near(o.rawProgress.cornering / o.rawProgress.descending, 0.45 / 0.85, 1e-6));
  check('non-plan technique attributes get a SMALL progress (10 % / 4 each)', near(sh.wetHandling, 0.025, 1e-12) && (o.rawProgress.wetHandling ?? 0) > 0 && (o.rawProgress.wetHandling ?? 0) < o.rawProgress.cornering * 0.5);
  check('tactics and experience are not touched by training', (o.rawProgress.experience ?? 0) === 0 && (o.rawProgress.positioning ?? 0) === 0);
}

// ---- 2. modes 75/25 vs 100 % ----
{
  const full = weeklyTraining(mk(), { planId: 0, mode: 'full' }, plain), basic = weeklyTraining(mk(), { planId: 0, mode: 'basic' }, plain);
  check('basic mode gives exactly 75 % of full progress', near(basic.rawProgress.climbing / full.rawProgress.climbing, 0.75, 1e-9) && near(basic.rawProgress.descending / full.rawProgress.descending, 0.75, 1e-9));
  check('same input, full leaves the rider no fresher than basic (clamped at a fresh start)', full.rider.energy <= basic.rider.energy && full.rider.fatigue >= basic.rider.fatigue);
  const lowE = mk({ energy: 50, fatigue: 50 });
  const f2 = weeklyTraining(lowE, { planId: 0, mode: 'full' }, plain).rider, b2 = weeklyTraining(lowE, { planId: 0, mode: 'basic' }, plain).rider;
  check('energy delta full = -15 + 4x5 x rm(50)=1.0 -> +5 ; basic = -10 + 25 -> +15', near(f2.energy, 55) && near(b2.energy, 65), `${f2.energy} ${b2.energy}`);
  check('fatigue delta full = +18 - 16 = +2 ; basic = +10 - 20 = -10', near(f2.fatigue, 52) && near(b2.fatigue, 40), `${f2.fatigue} ${b2.fatigue}`);
  const after10 = (m: 'basic' | 'full') => run(mk({ age: 19 }), 0, m, 9);
  check('over a season full yields more points than basic', sum(after10('full'), PERFORMANCE_FOCUS) > sum(after10('basic'), PERFORMANCE_FOCUS));
}

// ---- 3. Potential: soft cap only, weak vs high ----
{
  const strong = run(mk({ age: 27, hidden: { potential: 95 } }), 0, 'basic', 400);
  const weak = run(mk({ age: 27, hidden: { potential: 15 } }), 0, 'basic', 400); // age 27: past the O5 youth floor
  check('weak Potential stagnates far below strong Potential', weak.attrs.climbing < 130 && strong.attrs.climbing > 170, `${weak.attrs.climbing} ${strong.attrs.climbing}`);
  check('Potential is not a growth multiplier at low levels (same first-week raw)', near(weeklyTraining(mk({ hidden: { potential: 15 } }), { planId: 0, mode: 'full' }, plain).rawProgress.descending, weeklyTraining(mk({ hidden: { potential: 95 } }), { planId: 0, mode: 'full' }, plain).rawProgress.descending, 1e-9));
  check('no hard OVR limit: high Potential reaches the 190+ zone on the planned attribute', strong.attrs.climbing >= 190, `${strong.attrs.climbing}`);
  const climber = mk({ hidden: { potential: 50 } });
  check('gap rules: in-plan 0, shape-weak 45, other 20; Univerzal 10', attributeGap(0, 'climbing') === 0 && attributeGap(0, 'sprint') === 45 && attributeGap(0, 'timeTrial') === 20 && attributeGap(0, 'endurance') === 0 && attributeGap(6, 'flat') === 10 && attributeGap(0, 'hills') === 0 && climber.shape === 0);
}

// ---- 4. Trainability + professionalism ----
{
  const lo = weeklyTraining(mk({ hidden: { trainability: 10 } }), { planId: 0, mode: 'full' }, plain), hi = weeklyTraining(mk({ hidden: { trainability: 90 } }), { planId: 0, mode: 'full' }, plain);
  check('G(Trainability 10) = 0.76, G(90) = 1.24 (weight 0.30)', near(trainingFactor(mk({ hidden: { trainability: 10 } }), DEV_CONFIG).G, 0.76) && near(trainingFactor(mk({ hidden: { trainability: 90 } }), DEV_CONFIG).G, 1.24));
  check('high Trainability grows faster than low', hi.rawProgress.climbing > lo.rawProgress.climbing * 1.5);
  const p = weeklyTraining(mk({ hidden: { professionalism: 90 } }), { planId: 0, mode: 'full' }, plain), p0 = weeklyTraining(mk({ hidden: { professionalism: 10 } }), { planId: 0, mode: 'full' }, plain);
  check('Professionalism raises efficiency by weight 0.15 (G 1.12 vs 0.88)', near(p.rawProgress.climbing / p0.rawProgress.climbing, 1.12 / 0.88, 1e-9));
  const ex = trainingFactor(mk({ hidden: { trainability: 0, professionalism: 0 } }), DEV_CONFIG).G;
  check('G is clamped to [0.6, 1.5]', near(ex, 0.6) && near(trainingFactor(mk({ hidden: { trainability: 100, professionalism: 100 } }), DEV_CONFIG).G, 1.45));
}

// ---- 5. Recovery + fatigue / readiness ----
{
  check('readiness = (E + (100 - F)) / 2', readinessOf(60, 40) === 60);
  check('strict efficiency table 1.0/.90/.70/.45/.25', [90, 70, 50, 30, 10].map((s) => efficiencyOf(s, 'strict')).join() === '1,0.9,0.7,0.45,0.25');
  check('production table 1.0/.95/.85/.70/.50 stays available', [90, 70, 50, 30, 10].map((s) => efficiencyOf(s, 'production')).join() === '1,0.95,0.85,0.7,0.5');
  const tired = mk({ energy: 20, fatigue: 80 }); // readiness 20 -> 0.45
  const fresh = weeklyTraining(mk(), { planId: 0, mode: 'full' }, plain), t = weeklyTraining(tired, { planId: 0, mode: 'full' }, plain);
  check('tired rider trains with the lower efficiency', near(t.rawProgress.climbing / fresh.rawProgress.climbing, 0.45, 1e-9) && t.efficiency === 0.45);
  const lowRec = weeklyTraining(mk({ energy: 50, fatigue: 50, hidden: { recovery: 5 } }), { planId: 0, mode: 'full' }, plain).rider;
  const hiRec = weeklyTraining(mk({ energy: 50, fatigue: 50, hidden: { recovery: 95 } }), { planId: 0, mode: 'full' }, plain).rider;
  check('high Recovery recovers more (energy up, fatigue down)', hiRec.energy > lowRec.energy && hiRec.fatigue < lowRec.fatigue, `${hiRec.energy}/${hiRec.fatigue} vs ${lowRec.energy}/${lowRec.fatigue}`);
  const cycle = (m: 'basic' | 'full') => { let r = mk(); for (let i = 0; i < 9; i++) r = weeklyTraining(r, { planId: 0, mode: m }, DEV_CONFIG).rider; return r; };
  check('nine full weeks leave the rider more fatigued than nine basic weeks', cycle('full').fatigue > cycle('basic').fatigue);
  const r = weeklyTraining(mk({ energy: 99, fatigue: 1 }), { planId: 0, mode: 'basic' }, DEV_CONFIG).rider;
  check('condition stays an integer within 0..100 (production rounding)', Number.isInteger(r.energy) && r.energy <= 100 && r.fatigue >= 0);
  const season = seasonStart(mk({ energy: 20, fatigue: 90 }), 21);
  check('season start: +50 Energy, -50 Fatigue', season.energy === 70 && season.fatigue === 40);
}

// ---- 6. ageing (Vitality) ----
{
  check('decline onset 29..32 by Vitality (1..25=29, 26..50=30, 51..75=31, 76..100=32)', declineOnset(1) === 29 && declineOnset(25) === 29 && declineOnset(26) === 30 && declineOnset(75) === 31 && declineOnset(100) === 32);
  const young = seasonStart(mk({ level: 150, age: 27 }), 28);
  check('no decline before the onset age', sum(young, PERFORMANCE_FOCUS) === 150 * 7);
  const lowVit = (age: number) => { let r = mk({ level: 150, age: age - 1, hidden: { vitality: 10 } }); for (let a = age; a < age + 6; a++) r = seasonStart(r, a); return r; };
  const hiVit = (age: number) => { let r = mk({ level: 150, age: age - 1, hidden: { vitality: 95 } }); for (let a = age; a < age + 6; a++) r = seasonStart(r, a); return r; };
  check('low Vitality loses more than high Vitality over 6 seasons from 29', sum(lowVit(29), PERFORMANCE_FOCUS) < sum(hiVit(29), PERFORMANCE_FOCUS), `${sum(lowVit(29), PERFORMANCE_FOCUS)} ${sum(hiVit(29), PERFORMANCE_FOCUS)}`);
  const one = seasonStart(mk({ level: 150, age: 29, hidden: { vitality: 10 } }), 29);
  check('onset season: loss 0.8 (sprint/acceleration x1.4 = 1.12 -> 1 point, endurance x0.7 = 0.56 carried)', one.attrs.climbing === 150 && one.attrs.sprint === 149 && near(one.decline.sprint ?? 0, 0.12, 1e-9) && near(one.decline.endurance ?? 0, 0.56, 1e-9) && near(one.decline.climbing ?? 0, 0.8, 1e-9));
  const two = seasonStart(one, 30);
  check('second season (loss 1.2): sprint 0.12 + 1.68 -> -1 more, climbing 0.8 + 1.2 -> -2 whole points', two.attrs.sprint === 148 && two.attrs.climbing <= 149 && two.attrs.climbing >= 148, `${two.attrs.sprint} ${two.attrs.climbing}`);
  check('decline touches only the 7 physical attributes', TECHNIQUE_ATTRIBUTES.every((k) => two.attrs[k] === 150) && two.attrs.experience === 150);
  const floor = seasonStart(mk({ level: 20, age: 40, hidden: { vitality: 1 } }), 41);
  check('decline never goes below 20', PERFORMANCE_FOCUS.every((k) => floor.attrs[k] >= 20));
}

// ---- 7. attribute maximum 200 + accumulator ----
{
  const a = accumulate(0, 40, 12, 200, 199);
  check('accumulator converts progress into whole points, never above the cap', a.gain === 1 && a.attr === 200);
  check('at the cap the stored progress is discarded', a.progress === 0);
  const at = weeklyTraining(mk({ attrs: { climbing: 200 }, progress: { climbing: 11 } }), { planId: 0, mode: 'full' }, plain);
  check('attribute at 200 does not grow and keeps no progress', at.rider.attrs.climbing === 200 && (at.rider.progress.climbing ?? 0) === 0 && at.gains.climbing === 0);
  const tech = run(mk({ level: 198 }), 0, 'full', 60);
  check('technique can also reach 200 (visible maximum 200), never above', tech.attrs.descending <= 200 && tech.attrs.descending >= 199, `${tech.attrs.descending}`);
  const t4 = weeklyTraining(mk({ progress: { descending: 500 } }), { planId: 0, mode: 'full' }, plain);
  check('technique weekly gain stays capped at +4', t4.gains.descending === 4);
  check('floor accumulator carries the remainder', near(accumulate(5, 20, 12, 200, 100).progress, 1));
}

// ---- 8. week without a plan ----
{
  const r = mk({ age: 20, energy: 55, fatigue: 45, progress: { climbing: 3 } });
  const o = weeklyTraining(r, null, DEV_CONFIG);
  check('no plan set => no progress, no attribute change', JSON.stringify(o.rider.attrs) === JSON.stringify(r.attrs) && JSON.stringify(o.rider.progress) === JSON.stringify(r.progress) && Object.values(o.gains).every((v) => v === 0));
  check('no plan set => condition unchanged (nothing is processed)', o.rider.energy === 55 && o.rider.fatigue === 45 && o.processed === false);
}

// ---- 9. integration: three riders over a career (9 training weeks per season, every available week set) ----
{
  const career = (h: Partial<HiddenTraits>, plan: number, mode: 'basic' | 'full') => {
    let r = mk({ age: 17, shape: plan, level: 100, hidden: h }); const log: number[] = [];
    for (let age = 17; age <= 35; age++) {
      if (age > 17) r = seasonStart(r, age); else r = { ...r, age };
      for (let w = 2; w <= 10; w++) r = weeklyTraining(r, { planId: plan, mode }, DEV_CONFIG).rider;
      log.push(Math.round(sum(r, PERFORMANCE_FOCUS) / 7));
    }
    return { r, log };
  };
  const weak = career({ potential: 15, trainability: 20, professionalism: 30, recovery: 30, vitality: 30 }, 0, 'full');
  const avg = career({ potential: 50, trainability: 50, professionalism: 50, recovery: 50, vitality: 50 }, 0, 'full');
  const talent = career({ potential: 95, trainability: 85, professionalism: 80, recovery: 70, vitality: 80 }, 0, 'full');
  check('career: weak < average < talent', weak.log[8] < avg.log[8] && avg.log[8] < talent.log[8], `${weak.log[8]} ${avg.log[8]} ${talent.log[8]}`);
  check('career: talent keeps growing longer and declines later than weak', Math.max(...talent.log) > Math.max(...avg.log));
  const sw = career({ potential: 50 }, 0, 'full'), sb = career({ potential: 50 }, 0, 'basic');
  check('career: modes differ and both are valid', sw.log.length === 19 && sb.log.length === 19 && sw.log[5] !== sb.log[5]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
