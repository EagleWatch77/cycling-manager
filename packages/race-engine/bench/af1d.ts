import { Terrain, ZERO_ATTRIBUTES, Attributes } from '../src/types/terrain.js';
import { RiderSnapshot } from '../src/types/domain.js';
import { BALANCE_V1, BreakawayEffort, ChaseIntensity } from '../src/config/balance.js';
import { buildStageSnapshot } from '../src/core/snapshot.js';
import { simulateStage } from '../src/core/segmentLoop.js';
import { experimentalHoldingThreshold } from '../src/core/struggle.js';
import { AttackKind, ResponseKind, reactionDelaySec } from '../src/core/attack.js';

const B = BALANCE_V1, RP = experimentalHoldingThreshold(B.HOLDING_K);
const V = 42, MEAN = 130, FIELD = 40;

function mk(id: string, lvl: number, rx: number, t: Partial<RiderSnapshot['tactics']>): RiderSnapshot {
  const a: Attributes = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = lvl;
  a.reaction = rx;
  return { id, attributes: a, condition: 1, setup: 1, weather: 1, startEnergy: 100,
    tactics: { breakawayEffort: BreakawayEffort.HARD, chaseIntensity: ChaseIntensity.NONE, ...t } };
}

/** Attacker gap at a given elapsed second, read off the provisional timeline. */
function gapAtSec(ev: readonly { km: number; gapSec: number }[], parentSpkPerKm: number, sec: number): number | null {
  const targetKm = 1 + (sec / parentSpkPerKm);
  let best: number | null = null;
  for (const e of ev) if (e.km <= targetKm + 1e-9) best = e.gapSec;
  return best;
}

const f = (v: number | null, d = 2) => v === null ? '  n/a' : v.toFixed(d).padStart(6);

console.log('\nAF1d  corrected Reaction sweep, NORMAL vs ALL_OUT');
console.log('TICK_KM, REACTION_MAX_DELAY_SEC, merge threshold, attack and response values all UNCHANGED\n');

const agg: Record<string, { n: number; latched: number; mat: number[] }> = {};
const byRx: Record<string, { n: number; latched: number; gaps: number[] }> = {};
for (const [an, ak] of [['NORMAL ', AttackKind.NORMAL], ['ALL_OUT', AttackKind.ALL_OUT]] as const) {
  console.log(`\n=== Attack ${an} ===`);
  console.log('  Rx  Resp  dEP   delay  startF  gapAtStart  latch  latchKm  g@15s  g@30s  g@45s  peakGap  matKm   atkE   rspE');
  console.log('  ' + '-'.repeat(118));
  for (const [rn, rk] of [['N', ResponseKind.NORMAL], ['H', ResponseKind.HIGH]] as const) {
    for (const dEP of [-15, -5, 0, 5, 15]) {
      for (const rx of [0, 40, 80, 120, 160, 200]) {
        const riders = [
          mk('atk', MEAN, 200, { attackAtKm: 1, attackKind: ak }),
          mk('rsp', MEAN + dEP, rx, { response: rk }),
          ...Array.from({ length: FIELD - 2 }, (_, i) => mk(`p${i}`, MEAN, 100, {})),
        ];
        const snap = buildStageSnapshot({ stageId: 'af1d', seed: 1, riders, balance: B });
        const r = simulateStage({ snapshot: snap,
          stage: { id: 'af1d', segments: [{ startKm: 0, lengthKm: 60, terrain: Terrain.FLAT, referenceSpeedKmh: V }] },
          initialGroups: [riders.map(x => x.id)], balance: B,
          options: { paceOnly: false, requiredPerformance: RP }, recordTimeline: true });

        const resp = r.attacks.find(a => a.kind === 'RESPOND');
        const merge = r.attacks.find(a => a.kind === 'PAG_MERGE' && a.riderId === 'rsp');
        const mat = r.attacks.find(a => a.kind === 'MATERIALISE');
        const prov = r.provisionalGaps;
        const spk = 85.797;
        const peak = prov.length ? Math.max(...prov.map(p => p.gapSec)) : null;
        console.log(
          `  ${String(rx).padStart(3)}  ${rn}    ${String(dEP).padStart(3)}` +
          `  ${reactionDelaySec(rx, B).toFixed(1).padStart(5)}s` +
          `  ${f(resp?.startFraction ?? null, 3)}  ${f(resp?.gapSec ?? null)}` +
          `     ${merge ? 'yes' : ' no'}  ${f(merge?.km ?? null, 1)}` +
          `  ${f(gapAtSec(prov, spk, 15))}  ${f(gapAtSec(prov, spk, 30))}  ${f(gapAtSec(prov, spk, 45))}` +
          `  ${f(peak)}  ${f(mat?.km ?? null, 1)}` +
          `  ${r.riders.get('atk')!.energy.toFixed(1).padStart(5)}  ${r.riders.get('rsp')!.energy.toFixed(1).padStart(5)}`);
        const key = `${an}|${rn}`;
        agg[key] ??= { n: 0, latched: 0, mat: [] };
        agg[key].n++;
        if (merge) agg[key].latched++;
        if (mat) agg[key].mat.push(mat.km);
        const rk2 = `${an}|Rx${String(rx).padStart(3)}`;
        byRx[rk2] ??= { n: 0, latched: 0, gaps: [] };
        byRx[rk2].n++;
        if (merge) byRx[rk2].latched++;
        if (resp?.gapSec !== undefined) byRx[rk2].gaps.push(resp.gapSec);
      }
    }
  }
}

console.log('\n\nAGGREGATE (30 cells per row: 6 Reaction x 5 EP deltas)');
console.log('  attack    resp   latch rate   materialised   median matKm');
console.log('  ' + '-'.repeat(60));
for (const [k, v] of Object.entries(agg)) {
  const [an, rn] = k.split('|');
  const m = [...v.mat].sort((a, b) => a - b);
  console.log(`  ${an}   ${rn}      ${(v.latched / v.n * 100).toFixed(1).padStart(6)} %   ` +
    `${String(v.mat.length).padStart(7)}/${v.n}      ` +
    `${m.length ? m[Math.floor(m.length / 2)].toFixed(1) : 'n/a'}`);
}

console.log('\n\nLATCH RATE AND TARGET GAP AT ACTUAL RESPONSE START, BY REACTION');
console.log('  attack    Reaction   latch rate   mean target gap at start   n');
console.log('  ' + '-'.repeat(68));
for (const [k, v] of Object.entries(byRx).sort()) {
  const [an, rx] = k.split('|');
  const mean = v.gaps.length ? v.gaps.reduce((a, b) => a + b, 0) / v.gaps.length : NaN;
  console.log(`  ${an}   ${rx}      ${(v.latched / v.n * 100).toFixed(1).padStart(6)} %   ` +
    `${(Number.isNaN(mean) ? 0 : mean).toFixed(3).padStart(20)}   ${String(v.n).padStart(3)}`);
}
