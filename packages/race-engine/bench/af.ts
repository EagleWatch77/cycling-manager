import { performance } from 'node:perf_hooks';
import { Terrain, ZERO_ATTRIBUTES, Attributes } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import { BALANCE_V1, BreakawayEffort, ChaseIntensity } from '../src/config/balance.js';
import { buildStageSnapshot, Rng } from '../src/core/snapshot.js';
import { simulateStage } from '../src/core/segmentLoop.js';
import { experimentalHoldingThreshold } from '../src/core/struggle.js';
import { AttackKind, ResponseKind, reactionDelaySec } from '../src/core/attack.js';

const B = BALANCE_V1, RP = experimentalHoldingThreshold(B.HOLDING_K);
const V = 42, MEAN = 130, FIELD = 40;
const t0 = performance.now();

function mk(id: string, lvl: number, reaction: number, t: Partial<RiderSnapshot['tactics']>): RiderSnapshot {
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = lvl;
  a.reaction = reaction;
  return { id, attributes: a, condition: 1, setup: 1, weather: 1, startEnergy: 100,
    tactics: { breakawayEffort: BreakawayEffort.HARD, chaseIntensity: ChaseIntensity.NONE, ...t } };
}
function run(riders: RiderSnapshot[], lengthKm = 60) {
  const snap = buildStageSnapshot({ stageId: 'af', seed: 1, riders, balance: B });
  return simulateStage({ snapshot: snap,
    stage: { id: 'af', segments: [{ startKm: 0, lengthKm, terrain: Terrain.FLAT, referenceSpeedKmh: V }] },
    initialGroups: [riders.map(r => r.id)], balance: B,
    options: { paceOnly: false, requiredPerformance: RP }, recordTimeline: true });
}
const matKm = (r: ReturnType<typeof run>) => r.attacks.find(a => a.kind === 'MATERIALISE')?.km ?? null;
const f = (v: number | null, d = 1) => v === null ? '   n/a' : v.toFixed(d).padStart(6);

console.log('\nAF-01 BENCHMARKS   (K=0.40 provisional, Energy active, B.REACTION_MAX_DELAY_SEC=30)\n');

/* AF0 solo attack, no response */
console.log('AF0  solo attack, no response');
for (const kind of [AttackKind.NORMAL, AttackKind.ALL_OUT]) {
  const riders = Array.from({ length: FIELD }, (_, i) =>
    mk(`r${i}`, MEAN, 200, i === 0 ? { attackAtKm: 1, attackKind: kind } : {}));
  const r = run(riders, 60);
  const e = r.riders.get('r0')!;
  console.log(`     ${kind.padEnd(8)} materialise at ${f(matKm(r))} km   escape distance ${f(matKm(r) === null ? null : matKm(r)! - 1)} km` +
    `   attacker E ${e.energy.toFixed(2)}   bunch E ${r.riders.get('r10')!.energy.toFixed(2)}`);
}

/* AF1 reaction cliff */
console.log('\nAF1  attack vs 1 responder, by Reaction');
console.log('     Reaction   delay      latched   materialise km   PAG size at 16 s');
for (const rx of [200, 150, 100, 60, 40, 0]) {
  const riders = Array.from({ length: FIELD }, (_, i) =>
    mk(`r${i}`, MEAN, i === 1 ? rx : 200,
      i === 0 ? { attackAtKm: 1, attackKind: AttackKind.NORMAL }
      : i === 1 ? { response: ResponseKind.HIGH } : {}));
  const r = run(riders, 60);
  const latched = r.attacks.some(a => a.kind === 'PAG_MERGE');
  const m = r.attacks.find(a => a.kind === 'MATERIALISE');
  const grp = m ? r.groups.filter(g => g.riderIds.includes('r0'))[0]?.riderIds.length ?? 1 : 0;
  console.log(`     ${String(rx).padStart(8)}   ${reactionDelaySec(rx, B).toFixed(1).padStart(5)} s   ` +
    `${(latched ? 'yes' : 'no').padStart(7)}   ${f(m?.km ?? null).padStart(14)}   ${String(grp).padStart(16)}`);
}

/* AF2 five responders */
console.log('\nAF2  attack vs 5 responders (Reaction 150, High)');
{
  const riders = Array.from({ length: FIELD }, (_, i) =>
    mk(`r${i}`, MEAN, i >= 1 && i <= 5 ? 150 : 200,
      i === 0 ? { attackAtKm: 1, attackKind: AttackKind.NORMAL }
      : i >= 1 && i <= 5 ? { response: ResponseKind.HIGH } : {}));
  const r = run(riders, 60);
  const m = r.attacks.find(a => a.kind === 'MATERIALISE');
  const lead = r.groups.filter(g => g.riderIds.length > 0).sort((a, b) => a.timeSec - b.timeSec)[0];
  console.log(`     materialise at ${f(m?.km ?? null)} km   escape group size ${lead.riderIds.length}` +
    `   PAG merges ${r.attacks.filter(a => a.kind === 'PAG_MERGE').length}`);
}

/* AF3/AF4 normal vs all-out, unopposed and opposed */
console.log('\nAF3/AF4  normal vs all-out attack');
for (const [label, resp] of [['unopposed', ResponseKind.NONE], ['opposed (3x High, Rx 100)', ResponseKind.HIGH]] as const) {
  for (const kind of [AttackKind.NORMAL, AttackKind.ALL_OUT]) {
    const riders = Array.from({ length: FIELD }, (_, i) =>
      mk(`r${i}`, MEAN, i >= 1 && i <= 3 ? 100 : 200,
        i === 0 ? { attackAtKm: 1, attackKind: kind }
        : i >= 1 && i <= 3 && resp !== ResponseKind.NONE ? { response: resp } : {}));
    const r = run(riders, 60);
    const m = r.attacks.find(a => a.kind === 'MATERIALISE');
    console.log(`     ${label.padEnd(26)} ${kind.padEnd(8)} materialise ${f(m?.km ?? null)} km   ` +
      `attacker E ${r.riders.get('r0')!.energy.toFixed(2)}`);
  }
}

/* AF5 repeated attacks */
console.log('\nAF5  serial attacking, 5 riders attacking in sequence');
{
  const riders = Array.from({ length: FIELD }, (_, i) =>
    mk(`r${i}`, MEAN, 200, i < 5 ? { attackAtKm: 1 + i * 4, attackKind: AttackKind.ALL_OUT } : {}));
  const r = run(riders, 60);
  const es = [0, 1, 2, 3, 4].map(i => r.riders.get(`r${i}`)!.energy.toFixed(1)).join(' / ');
  console.log(`     attacker Energies ${es}   bunch ${r.riders.get('r20')!.energy.toFixed(1)}` +
    `   materialisations ${r.attacks.filter(a => a.kind === 'MATERIALISE').length}` +
    `   reabsorptions ${r.attacks.filter(a => a.kind === 'REABSORB').length}`);
}

/* AF6 counter-attack after a failure */
console.log('\nAF6  counter-attack after a failed attack');
{
  const riders = Array.from({ length: FIELD }, (_, i) =>
    mk(`r${i}`, MEAN, 200,
      i === 0 ? { attackAtKm: 1, attackKind: AttackKind.NORMAL, breakawayEffort: BreakawayEffort.NORMAL }
      : i === 1 ? { attackAtKm: 12, attackKind: AttackKind.NORMAL } : {}));
  const r = run(riders, 60);
  console.log('     ' + r.attacks.map(a => `${a.km.toFixed(1)}km ${a.riderId} ${a.kind}`).join('  |  '));
}

/* AF7 bridge to an established breakaway */
console.log('\nAF7  attack into an existing 16 s+ breakaway');
{
  const riders = Array.from({ length: FIELD }, (_, i) =>
    mk(`r${i}`, MEAN, 200,
      i < 5 ? { breakawayEffort: BreakawayEffort.HARD }
            : i === 5 ? { attackAtKm: 2, attackKind: AttackKind.ALL_OUT }
            : i < 12 ? { chaseIntensity: ChaseIntensity.MEDIUM }
                     : {}));
  const snap = buildStageSnapshot({ stageId: 'af7', seed: 1, riders, balance: B });
  const r = simulateStage({ snapshot: snap,
    stage: { id: 'af7', segments: [{ startKm: 0, lengthKm: 60, terrain: Terrain.FLAT, referenceSpeedKmh: V }] },
    initialGroups: [riders.slice(0, 5).map(x => x.id), riders.slice(5).map(x => x.id)],
    initialGapSec: 180, balance: B,
    options: { paceOnly: false, requiredPerformance: RP }, recordTimeline: true });
  const m = r.attacks.find(a => a.kind === 'MATERIALISE');
  console.log(`     bridger materialise ${f(m?.km ?? null)} km   ` +
    `groups at finish ${r.finishGroupCount}   events ${r.attacks.length}`);
}

console.log(`\nwall time ${((performance.now() - t0) / 1000).toFixed(1)} s`);

/* ================================================================== */
/* AF1b  Reaction diagnostic sweep                                    */
/*                                                                    */
/* The original AF1 gave every rider BreakawayEffort.HARD, so a       */
/* responder combined a Response burst with Hard PAG effort. This     */
/* sweep varies responder effort and quality to isolate Reaction.     */
/* ================================================================== */
console.log('\nAF1c  sub-tick Reaction sweep   (TICK_KM=0.2 and REACTION_MAX_DELAY_SEC=30 UNCHANGED)');
console.log('  Rx  Resp  respEffort  dEP   delay   gapAtResp  latch  latchKm  matKm  attackerE  responderE');
console.log('  ' + '-'.repeat(100));
{
  const efforts: [string, BreakawayEffort][] = [
    ['Normal', BreakawayEffort.NORMAL],
    ['Work  ', BreakawayEffort.WORK],
    ['Hard  ', BreakawayEffort.HARD],
  ];
  for (const [rn, rk] of [['N', ResponseKind.NORMAL], ['H', ResponseKind.HIGH]] as const) {
    for (const [en, ek] of efforts) {
      for (const dEP of [-15, -10, -5, 0, 5, 15]) {
        for (const rx of [0, 40, 80, 120, 160, 200]) {
          const riders = [
            mk('atk', MEAN, 200, { attackAtKm: 1, attackKind: AttackKind.NORMAL }),
            mk('rsp', MEAN + dEP, rx, { response: rk, breakawayEffort: ek }),
            ...Array.from({ length: FIELD - 2 }, (_, i) => mk(`p${i}`, MEAN, 100, {})),
          ];
          const r = run(riders, 60);
          const ev = r.attacks;
          const respLaunch = ev.find(a => a.riderId === 'rsp' && a.kind === 'RESPOND');
          // Latch = the responder actually merged with the target PAG.
          // Final co-location is NOT the same thing: a latched pair can split
          // again later inside the escape group.
          const merge = ev.find(a => a.kind === 'PAG_MERGE' && a.riderId === 'rsp');
          const latched = merge !== undefined;
          const mat = ev.find(a => a.kind === 'MATERIALISE');
          const st = r.riders;
          console.log(
            `  ${String(rx).padStart(3)}  ${rn}     ${en}     ${String(dEP).padStart(3)}` +
            `  ${reactionDelaySec(rx, B).toFixed(1).padStart(5)}s` +
            `  ${f(respLaunch?.startFraction ?? null, 3)}  ${f(respLaunch?.startOffsetSec ?? null, 2)}` +
            `  ${f(respLaunch?.gapSec ?? null, 2)}     ${latched ? 'yes' : ' no'}` +
            `  ${f(merge?.km ?? null)}  ${f(mat?.km ?? null)}` +
            `   ${st.get('atk')!.energy.toFixed(1).padStart(6)}     ${st.get('rsp')!.energy.toFixed(1).padStart(6)}`);
        }
      }
    }
  }
}

/* ================================================================== */
/* AF5b  the actual §13 "respond to everything and cook yourself" test */
/* ================================================================== */
console.log('\nAF5b  one rider responds High to N sequential attacks');
console.log('  attacks  responses fired  fixed cost  finish E  still able to respond');
console.log('  ' + '-'.repeat(72));
{
  for (const n of [1, 2, 3, 5, 8, 12]) {
    const riders = [
      mk('rsp', MEAN, 100, { response: ResponseKind.HIGH, breakawayEffort: BreakawayEffort.NORMAL }),
      ...Array.from({ length: n }, (_, i) =>
        mk(`a${i}`, MEAN, 200, { attackAtKm: 2 + i * 4, attackKind: AttackKind.NORMAL,
          breakawayEffort: BreakawayEffort.NORMAL })),
      ...Array.from({ length: FIELD - 1 - n }, (_, i) => mk(`p${i}`, MEAN, 100, {})),
    ];
    const r = run(riders, 60);
    const fired = r.attacks.filter(a => a.riderId === 'rsp' && a.kind === 'RESPOND').length;
    const reabs = r.attacks.filter(a => a.kind === 'REABSORB').length;
    const e = r.riders.get('rsp')!.energy;
    void reabs;
    console.log(
      `  ${String(n).padStart(7)}  ${String(fired).padStart(15)}  ${(fired * B.RESPONSE_HIGH_ENERGY).toFixed(0).padStart(10)}` +
      `  ${e.toFixed(2).padStart(8)}  ${e > B.RESPONSE_HIGH_ENERGY ? 'yes' : 'NO — cooked'}`);
  }
}

/* ================================================================== */
/* AF9  heterogeneous PAG — do weak followers drag the group?         */
/* ================================================================== */
console.log('\nAF9  heterogeneous PAG (no Struggle inside a PAG is a V1 simplification)');
console.log('  PAG make-up                       matKm   PAG PaceEP   weakest rider EP');
console.log('  ' + '-'.repeat(72));
{
  const cases: [string, number[]][] = [
    ['4 strong (EP 140)', [140, 140, 140, 140]],
    ['3 strong + 1 at EP 130', [140, 140, 140, 130]],
    ['3 strong + 1 at EP 115', [140, 140, 140, 115]],
    ['3 strong + 1 at EP 100', [140, 140, 140, 100]],
    ['3 strong + 1 at EP  85', [140, 140, 140, 85]],
  ];
  for (const [label, eps] of cases) {
    const riders = [
      ...eps.map((ep, i) => mk(`b${i}`, ep, 200,
        { attackAtKm: 1, attackKind: AttackKind.NORMAL, breakawayEffort: BreakawayEffort.HARD })),
      ...Array.from({ length: FIELD - eps.length }, (_, i) => mk(`p${i}`, MEAN, 100, {})),
    ];
    const r = run(riders, 80);
    const mean = eps.reduce((a, b) => a + b, 0) / eps.length;
    const mat = r.attacks.find(a => a.kind === 'MATERIALISE');
    const lead = [...r.groups].filter(g => g.riderIds.length > 0).sort((a, b) => a.timeSec - b.timeSec)[0];
    const size = mat ? lead.riderIds.length : 0;
    console.log(`  ${label.padEnd(32)} ${f(matKm(r))}   ${mean.toFixed(1).padStart(14)}   ${String(size).padStart(11)}   ${Math.min(...eps).toFixed(0).padStart(10)}`);
  }
}

console.log(`\ntotal wall time ${((performance.now() - t0) / 1000).toFixed(1)} s`);
