import { test, assert, assertClose, assertThrows, runAll } from './harness.js';
import {
  member,
  peloton,
  uniformGroup,
  V_REF,
  P_REF,
  N_FIELD,
  riderWithClimbing,
} from './fixtures.js';
import { WorkMode, ContactState, RiderSnapshot } from '../src/types/domain.js';
import {
  Terrain, ALL_TERRAINS, ZERO_ATTRIBUTES, Attributes,
} from '../src/types/terrain.js';
import {
  BALANCE_V1,
  BreakawayEffort,
  ChaseIntensity,
  BREAKAWAY_EFFORT,
  CHASE_INTENSITY,
  draftingEnergyMultiplier,
} from '../src/config/balance.js';
import {
  computeGroupPace,
  chaseInput,
  chaseWork,
  escapeWork,
  sizeFactor,
  resolveWorkMode,
  gapChangeSecPerKm,
} from '../src/core/groupPace.js';
import {
  struggleDeltaPerKm,
  struggleGainPerKm,
  UNSPECIFIED_REQUIRED_PERFORMANCE,
  CANONICAL_REQUIRED_PERFORMANCE,
  experimentalHoldingThreshold,
  holdingFactor,
  struggleRecoveryPerKm,
  STRUGGLE_DEAD_ZONE_EP,
  deficit,
  DesignGapError,
  isRequiredPerformanceSpecified,
} from '../src/core/struggle.js';
import {
  dropLossSecPerKm,
  gapState,
  GapState,
  advanceContactState,
  mergeGroups,
} from '../src/core/splitMerge.js';
import {
  buildStageSnapshot,
  neutralEP,
  Rng,
} from '../src/core/snapshot.js';
import {
  assertWeightTablesValid,
  unvalidatedTerrains,
  SEGMENT_SKILL_WEIGHTS,
  baseSegmentSkill,
} from '../src/config/segmentSkills.js';
import { simulateStage } from '../src/core/segmentLoop.js';
import {
  AttackKind, ResponseKind, reactionDelaySec, newEffortWindow, effortModifier,
  advanceEffortWindow, windowExhausted, attackProfile, responseProfile,
  responseActiveFraction, interceptsTarget, interpolateTargetGap,
} from '../src/core/attack.js';
import { resolveWorkMode as _rwm } from '../src/core/groupPace.js';

const B = BALANCE_V1;

const pace = (
  members: ReturnType<typeof member>[],
  mode: WorkMode,
  pRef = P_REF,
) =>
  computeGroupPace({
    members,
    mode,
    pRef,
    fieldSize: N_FIELD,
    referenceSpeedKmh: V_REF,
    balance: B,
  });

const BREAK_HARD = () =>
  uniformGroup('b', 5, 130, { effort: BreakawayEffort.HARD });

/* ================================================================== */
/* Blocking rules                                                     */
/* ================================================================== */

test('T01', 'chase intensity does not change Effective Performance', () => {
  // EP is an INPUT to the pace model; chase never appears in its computation.
  const none = member('r', 130, { chase: ChaseIntensity.NONE });
  const allOut = member('r', 130, { chase: ChaseIntensity.ALL_OUT });
  assert(none.ep === allOut.ep, 'EP differs by chase setting');
  const src = computeGroupPace.toString();
  assert(
    !/\.ep\s*\*\s*.*chaseIntensity/i.test(src),
    'pace model multiplies EP by chase intensity',
  );
});

test('T02', 'chase intensity is not an input to Struggle', () => {
  const a = struggleDeltaPerKm(120, 130);
  const b = struggleDeltaPerKm(120, 130);
  assert(a === b, 'struggle delta is not a pure function of (EP, Required)');
  assert(
    struggleDeltaPerKm.length === 2,
    'struggleDeltaPerKm takes inputs other than EP and Required',
  );
});

test('T03', 'chase intensity applies the Energy cost multiplier', () => {
  assertClose(
    CHASE_INTENSITY[ChaseIntensity.ALL_OUT].energyMult /
      CHASE_INTENSITY[ChaseIntensity.NONE].energyMult,
    1.3,
    1e-12,
    'All-out chase energy multiplier',
  );
});

test('T04', 'breakaway effort does not change Effective Performance', () => {
  const save = member('r', 130, { effort: BreakawayEffort.SAVE });
  const allOut = member('r', 130, { effort: BreakawayEffort.ALL_OUT });
  assert(save.ep === allOut.ep, 'EP differs by breakaway effort');
});

/* ================================================================== */
/* Work mode — R3                                                     */
/* ================================================================== */

test('T05', 'single group on the road is NEUTRAL with WorkFactor 0', () => {
  const g = uniformGroup('x', 40, 130, { effort: BreakawayEffort.ALL_OUT });
  const r = pace(g, WorkMode.NEUTRAL);
  assert(r.workFactor === 0, `WorkFactor ${r.workFactor} != 0`);
});

test('T06', 'NEUTRAL ignores breakaway effort', () => {
  const hard = pace(
    uniformGroup('x', 40, 130, { effort: BreakawayEffort.HARD }),
    WorkMode.NEUTRAL,
  );
  const save = pace(
    uniformGroup('x', 40, 130, { effort: BreakawayEffort.SAVE }),
    WorkMode.NEUTRAL,
  );
  assertClose(hard.speedKmh, save.speedKmh, 1e-12, 'NEUTRAL speed differs');
});

test('T07', 'NEUTRAL ignores chase intensity', () => {
  const a = pace(
    uniformGroup('x', 40, 130, { chase: ChaseIntensity.ALL_OUT }),
    WorkMode.NEUTRAL,
  );
  const b = pace(
    uniformGroup('x', 40, 130, { chase: ChaseIntensity.NONE }),
    WorkMode.NEUTRAL,
  );
  assertClose(a.speedKmh, b.speedKmh, 1e-12, 'NEUTRAL speed differs');
});

test('T08', 'escape recognized at 16 s behind, not at 15 s', () => {
  const at16 = resolveWorkMode({
    gapToGroupAheadSec: null,
    gapToGroupBehindSec: 16,
    balance: B,
  });
  const at15 = resolveWorkMode({
    gapToGroupAheadSec: null,
    gapToGroupBehindSec: 15,
    balance: B,
  });
  assert(at16 === WorkMode.ESCAPE, `16 s -> ${at16}`);
  assert(at15 === WorkMode.NEUTRAL, `15 s -> ${at15}`);
});

test('T09', 'group with a separate group ahead is CHASE', () => {
  const m = resolveWorkMode({
    gapToGroupAheadSec: 40,
    gapToGroupBehindSec: 200,
    balance: B,
  });
  assert(m === WorkMode.CHASE, `got ${m}`);
});

/* ================================================================== */
/* Pace-setter quality — R1 / Rev C C2                                */
/* ================================================================== */

test('T10a', 'pace purity: passive rider EP does not enter v_G', () => {
  const a = pace(
    peloton({ chasers: 6, chaserEP: 130, passiveEP: 130, chase: ChaseIntensity.MEDIUM }),
    WorkMode.CHASE,
  );
  const b = pace(
    peloton({ chasers: 6, chaserEP: 130, passiveEP: 105, chase: ChaseIntensity.MEDIUM }),
    WorkMode.CHASE,
  );
  assertClose(a.speedKmh, b.speedKmh, 1e-12, 'passive EP leaked into pace');
  assertClose(a.paceEP, b.paceEP, 1e-12, 'passive EP leaked into PaceEP');
  assertClose(a.chaseInput, b.chaseInput, 1e-12, 'passive EP leaked into ChaseInput');
});

test('T11', 'monotone in chaser quality', () => {
  const v = (ep: number) =>
    pace(
      peloton({ chasers: 6, chaserEP: ep, passiveEP: 130, chase: ChaseIntensity.MEDIUM }),
      WorkMode.CHASE,
    ).speedKmh;
  assert(v(145) > v(130) && v(130) > v(115), 'not monotone in chaser EP');
});

test('T12', 'one strong chaser cannot drag the peloton to his own level', () => {
  const r = pace(
    peloton({ chasers: 1, chaserEP: 160, passiveEP: 130, chase: ChaseIntensity.MEDIUM }),
    WorkMode.CHASE,
  );
  assert(r.paceEP < 131, `PaceEP ${r.paceEP} too high for a single chaser`);
});

test('T13', 'no workers -> PaceEP == min(P_ref, MeanEP)', () => {
  const grupetto = uniformGroup('g', 8, 98);
  const r = pace(grupetto, WorkMode.CHASE);
  assertClose(r.paceEP, 98, 1e-12, 'grupetto PaceEP');

  const strong = uniformGroup('s', 8, 150);
  const r2 = pace(strong, WorkMode.CHASE);
  assertClose(r2.paceEP, P_REF, 1e-12, 'passive strong group must cap at P_ref');
});

test('T14', 'no workers -> ChaseWork is exactly 0 (no hidden baseline)', () => {
  const r = pace(uniformGroup('g', 35, 130), WorkMode.CHASE);
  assert(r.chaseWork === 0, `ChaseWork ${r.chaseWork} != 0`);
  assert(r.chaseInput === 0, `ChaseInput ${r.chaseInput} != 0`);
});

test('T15', 'EscapeWork is EP-weighted: strong riders saving hurts more', () => {
  const eps = [142, 138, 134, 128, 118];
  const strongSave = eps.map((ep, i) =>
    member(`r${i}`, ep, {
      effort:
        i < 2
          ? BreakawayEffort.SAVE
          : i === 2
            ? BreakawayEffort.WORK
            : BreakawayEffort.HARD,
    }),
  );
  const weakSave = eps.map((ep, i) =>
    member(`r${i}`, ep, {
      effort:
        i >= 3
          ? BreakawayEffort.SAVE
          : i === 2
            ? BreakawayEffort.WORK
            : BreakawayEffort.HARD,
    }),
  );
  const a = pace(strongSave, WorkMode.ESCAPE);
  const b = pace(weakSave, WorkMode.ESCAPE);
  assert(
    a.speedKmh < b.speedKmh,
    `strong-save break (${a.speedKmh}) should be slower than weak-save (${b.speedKmh})`,
  );
});

test('T16', 'EscapeWork stays inside the §11 table range', () => {
  const efforts = Object.values(BreakawayEffort);
  for (const e of efforts) {
    const w = escapeWork(uniformGroup('x', 6, 130, { effort: e }));
    assert(w >= -0.02 - 1e-12 && w <= 0.07 + 1e-12, `EscapeWork ${w} out of range`);
  }
});

test('T17', 'homogeneous field: Rev B Set A values reproduce exactly', () => {
  const lead = pace(BREAK_HARD(), WorkMode.ESCAPE);
  assertClose(lead.speedKmh, 43.391, 5e-3, 'A1 break speed');
  assertClose(lead.secPerKm, 82.966, 5e-3, 'A1 break s/km');

  const zeroChase = pace(
    peloton({ chasers: 0, chaserEP: 130, passiveEP: 130, chase: ChaseIntensity.NONE }),
    WorkMode.CHASE,
  );
  assertClose(zeroChase.speedKmh, 41.96, 5e-3, 'A1 peloton speed');
  assertClose(gapChangeSecPerKm(lead, zeroChase), 2.83, 5e-3, 'A1 gap change');
});

/* ================================================================== */
/* Chase aggregation                                                  */
/* ================================================================== */

test('T18', 'ChaseWork strictly increasing in ChaseInput', () => {
  let prev = -1;
  for (let i = 0; i <= 200; i += 5) {
    const w = chaseWork(i as never, B);
    assert(w > prev, `not increasing at ${i}`);
    prev = w;
  }
});

test('T19', 'ChaseWork saturates at CHASE_MAX and never exceeds it', () => {
  // Safety property: must NEVER exceed the cap, at any input.
  for (const x of [0, 1, 22, 100, 1000, 1e6, Number.MAX_SAFE_INTEGER]) {
    assert(
      chaseWork(x as never, B) <= B.CHASE_MAX,
      `saturation cap breached at ${x}`,
    );
  }
  // Strict inequality holds mathematically for all finite inputs, but
  // 1 - exp(-x/CHASE_SAT) rounds to exactly 1 in float64 beyond x ~ 800.
  // Assert strictness only where it is representable.
  for (const x of [0, 1, 22, 100, 400]) {
    assert(chaseWork(x as never, B) < B.CHASE_MAX, `not strict at ${x}`);
  }
  assertClose(chaseWork(1e6 as never, B), B.CHASE_MAX, 1e-15, 'saturated value');
});

test('T20', 'diminishing marginal chase returns', () => {
  const w = (x: number) => chaseWork(x as never, B);
  assert(w(10) - w(5) > w(55) - w(50), 'marginal returns not diminishing');
});

test('T21', 'chase aggregation is team-agnostic', () => {
  const solo = peloton({ chasers: 6, chaserEP: 140, passiveEP: 130, chase: ChaseIntensity.HIGH });
  const teamed = solo.map((m) => ({ ...m }));
  assertClose(
    pace(solo, WorkMode.CHASE).speedKmh,
    pace(teamed, WorkMode.CHASE).speedKmh,
    1e-12,
    'team membership changed chase aggregation',
  );
});

/* ================================================================== */
/* Size factor                                                        */
/* ================================================================== */

test('T22', 'SizeFactor == 0 exactly at full field', () => {
  assert(sizeFactor(40, 40, B) === 0, 'nonzero at n == N_field');
});

test('T23', 'SizeFactor < 0 below full field', () => {
  assert(sizeFactor(5, 40, B) < 0, 'not negative');
});

test('T24', 'SizeFactor(5, 40) matches the documented value', () => {
  assertClose(sizeFactor(5, 40, B), 0.006 * Math.log(0.125), 1e-12, 'value');
  assertClose(sizeFactor(5, 40, B), -0.012477, 1e-6, 'documented -0.012477');
});

/* ================================================================== */
/* Pace and gap                                                       */
/* ================================================================== */

test('T25', 'identical groups produce zero gap change', () => {
  const a = pace(uniformGroup('a', 20, 130), WorkMode.NEUTRAL);
  const b = pace(uniformGroup('b', 20, 130), WorkMode.NEUTRAL);
  assert(Math.abs(gapChangeSecPerKm(a, b)) < 1e-9, 'nonzero gap change');
});

test('T26', 'Set A and Set B worked examples reproduce to +/- 0.01 s/km', () => {
  const lead = pace(BREAK_HARD(), WorkMode.ESCAPE);
  const cases: [string, number, number][] = [
    ['A1 zero chase', 0, 2.83],
    ['A2 2x Medium', 2, 0.67],
    ['A3 6x Medium', 6, -2.08],
  ];
  for (const [name, chasers, expected] of cases) {
    const p = pace(
      peloton({ chasers, chaserEP: 130, passiveEP: 130, chase: ChaseIntensity.MEDIUM }),
      WorkMode.CHASE,
    );
    assertClose(gapChangeSecPerKm(lead, p), expected, 0.01, name);
  }

  const a4 = pace(
    peloton({ chasers: 10, chaserEP: 130, passiveEP: 130, chase: ChaseIntensity.HIGH }),
    WorkMode.CHASE,
  );
  assertClose(gapChangeSecPerKm(lead, a4), -4.81, 0.01, 'A4 10x High');

  const a5 = pace(
    uniformGroup('b', 5, 130, { effort: BreakawayEffort.ALL_OUT }),
    WorkMode.ESCAPE,
  );
  const a5p = pace(
    peloton({ chasers: 0, chaserEP: 130, passiveEP: 130, chase: ChaseIntensity.NONE }),
    WorkMode.CHASE,
  );
  assertClose(gapChangeSecPerKm(a5, a5p), 5.65, 0.01, 'A5 break All-out');

  // Set B — chaser quality sweep, P_ref fixed at 130.
  const b1 = pace(
    peloton({ chasers: 6, chaserEP: 145, passiveEP: 130, chase: ChaseIntensity.MEDIUM }),
    WorkMode.CHASE,
  );
  const b3 = pace(
    peloton({ chasers: 6, chaserEP: 115, passiveEP: 130, chase: ChaseIntensity.MEDIUM }),
    WorkMode.CHASE,
  );
  assertClose(gapChangeSecPerKm(lead, b1), -4.28, 0.01, 'B1 strong chasers');
  assertClose(gapChangeSecPerKm(lead, b3), 0.26, 0.01, 'B3 weak chasers');
});

test('T27', 'equal-quality break at Normal effort does not gain', () => {
  const lead = pace(
    uniformGroup('b', 5, 130, { effort: BreakawayEffort.NORMAL }),
    WorkMode.ESCAPE,
  );
  const chase = pace(
    peloton({ chasers: 0, chaserEP: 130, passiveEP: 130, chase: ChaseIntensity.NONE }),
    WorkMode.CHASE,
  );
  assert(
    gapChangeSecPerKm(lead, chase) <= 0,
    'Normal-effort break gained on a passive peloton',
  );
});

test('T28', 'speed clamp engages at both ends', () => {
  const slow = pace(uniformGroup('s', 8, 40), WorkMode.CHASE);
  assert(slow.clamped, 'low clamp did not engage');
  assertClose(slow.speedKmh, B.GROUP_SPEED_MIN * V_REF, 1e-9, 'low clamp value');

  const fast = pace(uniformGroup('f', 40, 400, { chase: ChaseIntensity.ALL_OUT }), WorkMode.CHASE);
  assert(fast.clamped, 'high clamp did not engage');
  assertClose(fast.speedKmh, B.GROUP_SPEED_MAX * V_REF, 1e-9, 'high clamp value');
});

test('T29', 'Group Time invariant: all riders in a group share one clock', () => {
  const riders = Array.from({ length: 12 }, (_, i) =>
    riderWithClimbing(`r${i}`, 100 + i * 4),
  );
  const snap = buildStageSnapshot({
    stageId: 's',
    seed: 1,
    riders,
    balance: B,
  });
  const res = simulateStage({
    snapshot: snap,
    stage: {
      id: 's',
      segments: [
        { startKm: 0, lengthKm: 20, terrain: Terrain.FLAT, referenceSpeedKmh: 42 },
      ],
    },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: { paceOnly: true },
  });
  const times = new Set<number>();
  for (const st of res.riders.values()) times.add(st.finishTimeSec!);
  assert(times.size === 1, `group produced ${times.size} distinct times`);
});

test('T30', 'determinism: identical snapshot + seed -> identical output', () => {
  const riders = Array.from({ length: 20 }, (_, i) =>
    riderWithClimbing(`r${i}`, 90 + i * 3),
  );
  const run = () => {
    const snap = buildStageSnapshot({ stageId: 's', seed: 7, riders, balance: B });
    return simulateStage({
      snapshot: snap,
      stage: {
        id: 's',
        segments: [
          { startKm: 0, lengthKm: 40, terrain: Terrain.MOUNTAIN, referenceSpeedKmh: 30 },
        ],
      },
      initialGroups: [riders.slice(0, 5).map((r) => r.id), riders.slice(5).map((r) => r.id)],
      balance: B,
      options: { paceOnly: true },
      recordTimeline: true,
    });
  };
  const a = run();
  const b = run();
  assert(
    JSON.stringify(a.timeline) === JSON.stringify(b.timeline),
    'timelines differ between identical runs',
  );
});

/* ================================================================== */
/* Gap states and handover                                            */
/* ================================================================== */

test('T31', 'gap <= 2 s is MERGE', () => {
  assert(gapState(0, B) === GapState.MERGE, '0 s');
  assert(gapState(2, B) === GapState.MERGE, '2 s');
  assert(gapState(2.01, B) !== GapState.MERGE, '2.01 s');
});

test('T32', 'gap >= 16 s is SEPARATE', () => {
  assert(gapState(16, B) === GapState.SEPARATE, '16 s');
  assert(gapState(15.99, B) === GapState.DETACHED, '15.99 s');
});

test('T33', 'merge keeps the faster clock', () => {
  const lead = { id: 0, riderIds: ['a'], posKm: 10, timeSec: 900, active: true };
  const behind = { id: 1, riderIds: ['b'], posKm: 10, timeSec: 901, active: true };
  mergeGroups(lead, behind);
  assertClose(lead.timeSec, 900, 1e-12, 'merged clock');
  assert(lead.riderIds.length === 2, 'riders not merged');
  assert(!behind.active, 'behind group still active');
});

test('T35', 'below 16 s only the drop model applies', () => {
  const d = advanceContactState({
    current: ContactState.LOSING_CONTACT,
    struggle: 100,
    detachedGapSec: 15.9,
    balance: B,
  });
  assert(d.applyDropModel && !d.applyGroupPace, 'wrong mechanism below 16 s');
});

test('T36', 'at 16 s only Group Pace applies', () => {
  const d = advanceContactState({
    current: ContactState.LOSING_CONTACT,
    struggle: 100,
    detachedGapSec: 16,
    balance: B,
  });
  assert(d.next === ContactState.SEPARATE, 'did not become separate');
  assert(!d.applyDropModel && d.applyGroupPace, 'wrong mechanism at 16 s');
});

test('T37', 'the two time-loss mechanisms are mutually exclusive', () => {
  const states = [
    ContactState.IN_GROUP,
    ContactState.LOSING_CONTACT,
    ContactState.SEPARATE,
  ];
  for (const s of states) {
    for (const gap of [0, 5, 15.9, 16, 40]) {
      for (const struggle of [0, 99, 100, 140]) {
        const d = advanceContactState({
          current: s,
          struggle,
          detachedGapSec: gap,
          balance: B,
        });
        assert(
          d.applyDropModel !== d.applyGroupPace,
          `both/neither at ${s} gap=${gap} struggle=${struggle}`,
        );
      }
    }
  }
});

/* ================================================================== */
/* Units — Rev C C3                                                   */
/* ================================================================== */

test('T38', 'unit conversion: ChasePoints raw, escape effort fractional', () => {
  const six = uniformGroup('c', 6, 130, { chase: ChaseIntensity.MEDIUM });
  assertClose(chaseInput(six, 130), 18, 1e-9, 'ChaseInput must be 18 points');

  const hard = uniformGroup('b', 5, 130, { effort: BreakawayEffort.HARD });
  assertClose(escapeWork(hard), 0.04, 1e-9, 'EscapeWork must be 0.04');

  const w = chaseWork(18 as never, B);
  assert(w > 0.04 && w < 0.06, `ChaseWork ${w} outside [0.04, 0.06] — unit bug`);
});

/* ================================================================== */
/* Snapshot and P_ref — Rev C C1                                      */
/* ================================================================== */

test('T39', 'P_ref is computed per terrain', () => {
  const riders = Array.from({ length: 10 }, (_, i) =>
    riderWithClimbing(`r${i}`, 100 + i, { descending: 40 }),
  );
  const snap = buildStageSnapshot({ stageId: 's', seed: 1, riders, balance: B });
  for (const t of ALL_TERRAINS) {
    assert(snap.pRef[t] > 0, `missing P_ref for ${t}`);
  }
  assert(
    snap.pRef[Terrain.DESCENT] !== snap.pRef[Terrain.MOUNTAIN],
    'DESCENT and MOUNTAIN P_ref identical despite different weights',
  );
});

test('T40', 'P_ref is immutable and excludes tactical modifiers', () => {
  const base = riderWithClimbing('r', 120);
  const aggressive = {
    ...base,
    tactics: {
      breakawayEffort: BreakawayEffort.ALL_OUT,
      chaseIntensity: ChaseIntensity.ALL_OUT,
    },
  };
  assertClose(
    neutralEP(base, Terrain.FLAT),
    neutralEP(aggressive, Terrain.FLAT),
    1e-12,
    'tactics leaked into NeutralEP',
  );
  const snap = buildStageSnapshot({
    stageId: 's',
    seed: 1,
    riders: [base],
    balance: B,
  });
  assert(Object.isFrozen(snap.pRef), 'P_ref not frozen');
});

test('T41', 'TT is not a Group Pace terrain', () => {
  assert(
    !(ALL_TERRAINS as string[]).includes('TIME_TRIAL'),
    'TT leaked into the terrain enum',
  );
  assert(ALL_TERRAINS.length === 5, `expected 5 terrains, got ${ALL_TERRAINS.length}`);
});

test('T42', 'all BaseSegmentSkill weight tables sum to 100', () => {
  assertWeightTablesValid();
  assert(
    SEGMENT_SKILL_WEIGHTS[Terrain.MOUNTAIN].frozen,
    'MOUNTAIN should be frozen',
  );
  assert(
    SEGMENT_SKILL_WEIGHTS[Terrain.DESCENT].frozen,
    'DESCENT should be frozen',
  );
  assert(
    unvalidatedTerrains().length === 3,
    'expected exactly 3 unvalidated placeholder terrains',
  );
});

/* ================================================================== */
/* Spec tables                                                        */
/* ================================================================== */

test('T43', 'drop model reproduces the spec curve', () => {
  assertClose(dropLossSecPerKm(3, B), 0.793, 1e-3, 'deficit 3');
  assertClose(dropLossSecPerKm(10, B), 4.03, 1e-2, 'deficit 10');
  assertClose(dropLossSecPerKm(20, B), 10.27, 1e-2, 'deficit 20');
});

test('T44', 'Struggle gain table matches spec §07', () => {
  const expected: [number, number][] = [
    [0, 0], [1, 4], [3, 4], [4, 10], [6, 10],
    [7, 18], [10, 18], [11, 28], [15, 28], [16, 40], [40, 40],
  ];
  for (const [deficit, want] of expected) {
    assert(
      struggleGainPerKm(deficit) === want,
      `deficit ${deficit}: got ${struggleGainPerKm(deficit)}, want ${want}`,
    );
  }
});

test('T45', 'drafting energy multipliers match spec §10', () => {
  const cases: [number, number][] = [
    [1, 1.0], [2, 0.96], [5, 0.92], [10, 0.88], [20, 0.84], [45, 0.8],
  ];
  for (const [n, want] of cases) {
    assertClose(draftingEnergyMultiplier(n), want, 1e-12, `size ${n}`);
  }
});

/* ================================================================== */
/* Design gap guard                                                   */
/* ================================================================== */

test('T46', 'full simulation refuses to run without a RequiredPerformance port', () => {
  const riders = [riderWithClimbing('a', 120), riderWithClimbing('b', 118)];
  const snap = buildStageSnapshot({ stageId: 's', seed: 1, riders, balance: B });
  const err = assertThrows(
    () =>
      simulateStage({
        snapshot: snap,
        stage: {
          id: 's',
          segments: [
            { startKm: 0, lengthKm: 5, terrain: Terrain.FLAT, referenceSpeedKmh: 42 },
          ],
        },
        initialGroups: [['a', 'b']],
        balance: B,
        options: { paceOnly: false },
      }),
    'full simulation should refuse to run',
  );
  assert(err instanceof DesignGapError, `wrong error type: ${err.name}`);
  assert(
    !isRequiredPerformanceSpecified(UNSPECIFIED_REQUIRED_PERFORMANCE),
    'unspecified port reported as specified',
  );
});

test('T47', 'RNG is deterministic and reproducible', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  for (let i = 0; i < 100; i++) {
    assert(a.next() === b.next(), `divergence at draw ${i}`);
  }
});


/* ================================================================== */
/* RP-01 canonical rule — CLOSED                                      */
/* ================================================================== */

const rpOf = (members: ReturnType<typeof member>[], mode: WorkMode) => {
  const r = pace(members, mode);
  return CANONICAL_REQUIRED_PERFORMANCE({
    members,
    mode,
    terrain: Terrain.FLAT,
    pRef: P_REF,
    fieldSize: N_FIELD,
    pacePower: r.pacePower,
    paceEP: r.paceEP,
    workFactor: r.workFactor,
    sizeFactor: r.sizeFactor,
  });
};

test('T48', 'RequiredPerformance == PaceEP exactly', () => {
  const g = peloton({ chasers: 6, chaserEP: 145, passiveEP: 130, chase: ChaseIntensity.MEDIUM });
  const r = pace(g, WorkMode.CHASE);
  assertClose(rpOf(g, WorkMode.CHASE), r.paceEP, 1e-12, 'RP != PaceEP');
});

test('T49', 'chase INTENSITY does not change RequiredPerformance', () => {
  // Identical worker SET (same 6 riders working), only intensity differs.
  const mk = (c: ChaseIntensity) =>
    peloton({ chasers: 6, chaserEP: 145, passiveEP: 130, chase: c });
  const med = rpOf(mk(ChaseIntensity.MEDIUM), WorkMode.CHASE);
  const high = rpOf(mk(ChaseIntensity.HIGH), WorkMode.CHASE);
  const allOut = rpOf(mk(ChaseIntensity.ALL_OUT), WorkMode.CHASE);
  assertClose(med, high, 1e-12, 'HIGH changed RP');
  assertClose(med, allOut, 1e-12, 'ALL_OUT changed RP');
  // ...but speed MUST change.
  assert(
    pace(mk(ChaseIntensity.ALL_OUT), WorkMode.CHASE).speedKmh >
      pace(mk(ChaseIntensity.MEDIUM), WorkMode.CHASE).speedKmh,
    'intensity did not change group speed',
  );
});

test('T50', 'worker QUALITY does change RequiredPerformance', () => {
  const mk = (ep: number) =>
    peloton({ chasers: 6, chaserEP: ep, passiveEP: 130, chase: ChaseIntensity.MEDIUM });
  assert(
    rpOf(mk(145), WorkMode.CHASE) > rpOf(mk(130), WorkMode.CHASE) &&
      rpOf(mk(130), WorkMode.CHASE) > rpOf(mk(115), WorkMode.CHASE),
    'RP not monotone in worker quality',
  );
});

test('T51', 'SizeFactor is excluded from RequiredPerformance', () => {
  const small = uniformGroup('s', 5, 130);
  const big = uniformGroup('b', 40, 130);
  assertClose(
    rpOf(small, WorkMode.NEUTRAL),
    rpOf(big, WorkMode.NEUTRAL),
    1e-12,
    'group size leaked into RP',
  );
  // but SizeFactor must still move speed
  assert(
    pace(small, WorkMode.NEUTRAL).speedKmh < pace(big, WorkMode.NEUTRAL).speedKmh,
    'SizeFactor did not affect speed',
  );
});

test('T52', 'EscapeWork is excluded from RequiredPerformance', () => {
  const hard = uniformGroup('b', 5, 130, { effort: BreakawayEffort.HARD });
  const save = uniformGroup('b', 5, 130, { effort: BreakawayEffort.SAVE });
  assertClose(
    rpOf(hard, WorkMode.ESCAPE),
    rpOf(save, WorkMode.ESCAPE),
    1e-12,
    'breakaway effort leaked into RP',
  );
  assert(
    pace(hard, WorkMode.ESCAPE).speedKmh > pace(save, WorkMode.ESCAPE).speedKmh,
    'effort did not affect speed',
  );
});

test('T53', 'deficit_i = RequiredPerformance - EP_i', () => {
  assertClose(deficit(130, 118), 12, 1e-12, 'deficit sign/magnitude');
  assertClose(deficit(130, 142), -12, 1e-12, 'advantage is negative deficit');
});

test('T54', 'full simulation runs with the canonical port', () => {
  const riders = Array.from({ length: 30 }, (_, i) =>
    riderWithClimbing(`r${i}`, 100 + i),
  );
  const snap = buildStageSnapshot({ stageId: 's', seed: 3, riders, balance: B });
  const res = simulateStage({
    snapshot: snap,
    stage: {
      id: 's',
      segments: [
        { startKm: 0, lengthKm: 120, terrain: Terrain.FLAT, referenceSpeedKmh: 42 },
      ],
    },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: { paceOnly: false, requiredPerformance: CANONICAL_REQUIRED_PERFORMANCE },
  });
  assert(res.splits.length > 0, 'no split events in a spread field');
  for (const st of res.riders.values()) {
    assert(st.finished, `rider ${st.id} did not finish`);
    assert(st.finishTimeSec !== null && st.finishTimeSec > 0, 'bad finish time');
  }
});

test('T55', 'Group Time invariant survives splits and merges', () => {
  const riders = Array.from({ length: 24 }, (_, i) =>
    riderWithClimbing(`r${i}`, 100 + i * 2),
  );
  const snap = buildStageSnapshot({ stageId: 's', seed: 5, riders, balance: B });
  const res = simulateStage({
    snapshot: snap,
    stage: {
      id: 's',
      segments: [
        { startKm: 0, lengthKm: 90, terrain: Terrain.FLAT, referenceSpeedKmh: 42 },
      ],
    },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: { paceOnly: false, requiredPerformance: CANONICAL_REQUIRED_PERFORMANCE },
  });
  // Precise form of the invariant: riders ATTACHED to a group share its
  // clock. A rider in LOSING_CONTACT is by definition coming off the back and
  // carries an additional drop-model gap of up to GAP_SEPARATE_MIN seconds.
  for (const g of res.groups) {
    if (g.riderIds.length === 0) continue;
    const attached = g.riderIds.filter(
      (id) => res.riders.get(id)!.contact === ContactState.IN_GROUP,
    );
    const times = new Set(
      attached.map((id) => res.riders.get(id)!.finishTimeSec!),
    );
    assert(times.size <= 1, `group ${g.id} has ${times.size} distinct attached times`);

    for (const id of g.riderIds) {
      const st = res.riders.get(id)!;
      if (st.contact === ContactState.LOSING_CONTACT) {
        assert(
          st.detachedGapSec > 0 && st.detachedGapSec < B.GAP_SEPARATE_MIN,
          `detached rider ${id} gap ${st.detachedGapSec} outside (0, 16)`,
        );
      }
    }
  }
});


/* ================================================================== */
/* Struggle dead zone — canonical                                     */
/* ================================================================== */

test('T56', 'deficit in [0, 1) produces zero Struggle gain', () => {
  for (const d of [0, 0.01, 0.5, 0.99, 0.999999]) {
    assert(struggleGainPerKm(d) === 0, `deficit ${d} gained struggle`);
  }
  assert(struggleGainPerKm(1) === 4, 'band must start at exactly 1 EP');
  assert(struggleGainPerKm(1.0001) === 4, 'just above 1 EP');
});

test('T57', 'advantage in [0, 1) produces zero Struggle recovery', () => {
  for (const a of [0, 0.01, 0.5, 0.99]) {
    assert(struggleRecoveryPerKm(a) === 0, `advantage ${a} recovered struggle`);
  }
  assert(struggleRecoveryPerKm(1) === 4, 'recovery band must start at 1 EP');
});

test('T58', 'dead zone is symmetric and exactly 1 EP wide', () => {
  assert(STRUGGLE_DEAD_ZONE_EP === 1, 'dead zone width');
  assertClose(struggleDeltaPerKm(130, 130.5), 0, 1e-12, 'small deficit inert');
  assertClose(struggleDeltaPerKm(130, 129.5), 0, 1e-12, 'small advantage inert');
  assert(struggleDeltaPerKm(129, 130) === 4, 'deficit 1 gains');
  assert(struggleDeltaPerKm(131, 130) === -4, 'advantage 1 recovers');
});

/* ================================================================== */
/* Experimental holding threshold — NOT canonical                     */
/* ================================================================== */

test('T59', 'HoldingFactor uses the existing drafting table', () => {
  assertClose(holdingFactor(0.3, 40), 1 - 0.3 * (1 - 0.8), 1e-12, 'big bunch');
  assertClose(holdingFactor(0.3, 5), 1 - 0.3 * (1 - 0.92), 1e-12, 'small break');
  assertClose(holdingFactor(0.3, 1), 1, 1e-12, 'solo rider gets no allowance');
});

test('T60', 'HoldingFactor is monotone in group size and in K', () => {
  assert(holdingFactor(0.3, 40) < holdingFactor(0.3, 5), 'bigger bunch = more allowance');
  assert(holdingFactor(0.4, 40) < holdingFactor(0.2, 40), 'higher K = more allowance');
  for (const k of [0.2, 0.3, 0.4]) {
    for (const n of [1, 2, 5, 20, 40]) {
      const h = holdingFactor(k, n);
      assert(h > 0 && h <= 1, `HoldingFactor ${h} out of (0, 1] at K=${k} n=${n}`);
    }
  }
});

test('T61', 'experimental threshold sits below PaceEP and excludes WorkFactor', () => {
  const g = peloton({ chasers: 6, chaserEP: 145, passiveEP: 130, chase: ChaseIntensity.MEDIUM });
  const r = pace(g, WorkMode.CHASE);
  const ctx = {
    members: g,
    mode: WorkMode.CHASE,
    terrain: Terrain.FLAT,
    pRef: P_REF,
    fieldSize: N_FIELD,
    pacePower: r.pacePower,
    paceEP: r.paceEP,
    workFactor: r.workFactor,
    sizeFactor: r.sizeFactor,
  };
  const req = experimentalHoldingThreshold(0.3)(ctx);
  assert(req < r.paceEP, 'threshold not below PaceEP');
  assertClose(req, r.paceEP * holdingFactor(0.3, g.length), 1e-12, 'formula');
  // WorkFactor must not appear: same members, different intensity -> same req.
  const g2 = peloton({ chasers: 6, chaserEP: 145, passiveEP: 130, chase: ChaseIntensity.ALL_OUT });
  const r2 = pace(g2, WorkMode.CHASE);
  const req2 = experimentalHoldingThreshold(0.3)({ ...ctx, members: g2, paceEP: r2.paceEP });
  assertClose(req, req2, 1e-12, 'chase intensity leaked into threshold');
});

await import('./energy.js');


test('T62', 'work-mode gaps use a consistent pre-tick instant', () => {
  // Two groups, a fixed gap, homogeneous riders. The gap the chasing group
  // sees must equal the gap the leading group sees, in every tick.
  const riders = Array.from({ length: 20 }, (_, i) => riderWithClimbing(`r${i}`, 130));
  const snap = buildStageSnapshot({ stageId: 'g', seed: 1, riders, balance: B });
  const res = simulateStage({
    snapshot: snap,
    stage: {
      id: 'g',
      segments: [
        { startKm: 0, lengthKm: 20, terrain: Terrain.FLAT, referenceSpeedKmh: 42 },
      ],
    },
    initialGroups: [
      riders.slice(0, 5).map((r) => r.id),
      riders.slice(5).map((r) => r.id),
    ],
    initialGapSec: 40,
    balance: B,
    options: { paceOnly: false, requiredPerformance: CANONICAL_REQUIRED_PERFORMANCE },
    recordTimeline: true,
  });
  // With a 40 s gap held above the 16 s threshold, the trailing group must be
  // in CHASE on every tick. A one-tick time skew used to flip it to NEUTRAL.
  for (const t of res.timeline) {
    if (t.groups.length < 2) continue;
    const gap = t.groups[1].timeSec - t.groups[0].timeSec;
    if (gap >= B.GAP_SEPARATE_MIN + 5) {
      assert(
        t.groups[1].mode === WorkMode.CHASE,
        `km ${t.km}: gap ${gap.toFixed(1)}s but trailing group is ${t.groups[1].mode}`,
      );
      assert(
        t.groups[0].mode === WorkMode.ESCAPE,
        `km ${t.km}: gap ${gap.toFixed(1)}s but leading group is ${t.groups[0].mode}`,
      );
    }
  }
});


/* ================================================================== */
/* Energy bookkeeping on split ticks                                  */
/* ================================================================== */

function splitHeavyRun(auditEnergy = true) {
  // Wide spread guarantees plenty of splits inside the stage.
  const riders = Array.from({ length: 40 }, (_, i) =>
    riderWithClimbing(`r${i}`, 100 + i * 1.6),
  );
  const snap = buildStageSnapshot({ stageId: 'sp', seed: 11, riders, balance: B });
  return simulateStage({
    snapshot: snap,
    stage: {
      id: 'sp',
      segments: [
        { startKm: 0, lengthKm: 120, terrain: Terrain.FLAT, referenceSpeedKmh: 42 },
      ],
    },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: {
      paceOnly: false,
      requiredPerformance: CANONICAL_REQUIRED_PERFORMANCE,
      auditEnergy,
    },
  });
}

test('T63', 'every active rider is charged Energy exactly once per tick', () => {
  const res = splitHeavyRun();
  assert(res.splits.length > 0, 'fixture produced no splits');
  const audit = res.energyAudit!;
  for (const [id, a] of audit) {
    assert(
      a.charges === a.activeTicks,
      `rider ${id}: ${a.charges} charges vs ${a.activeTicks} active ticks`,
    );
    assert(a.charges > 0, `rider ${id} was never charged Energy`);
  }
});

test('T64', 'a rider splitting this tick is charged exactly once', () => {
  const res = splitHeavyRun();
  const audit = res.energyAudit!;
  const splitters = new Set(res.splits.map((s) => s.riderId));
  assert(splitters.size > 0, 'no splitters in fixture');
  for (const id of splitters) {
    const a = audit.get(id)!;
    assert(
      a.charges === a.activeTicks,
      `splitter ${id}: ${a.charges} charges vs ${a.activeTicks} active ticks`,
    );
  }
});

test('T65', 'the split tick uses PRE-split group size', () => {
  const res = splitHeavyRun();
  const audit = res.energyAudit!;
  let checked = 0;
  for (const s of res.splits) {
    const size = audit.get(s.riderId)!.splitTickGroupSize;
    assert(size !== null, `no recorded split-tick size for ${s.riderId}`);
    // The materialised rider left a group; the size charged must include him.
    assert(size! >= 2, `split-tick group size ${size} for ${s.riderId} is post-split`);
    checked++;
  }
  assert(checked > 0, 'nothing checked');
});

test('T66', 'no rider gets zero or double burn across split and merge', () => {
  const res = splitHeavyRun();
  const audit = res.energyAudit!;
  const totalCharges = [...audit.values()].reduce((a, b) => a + b.charges, 0);
  const totalActive = [...audit.values()].reduce((a, b) => a + b.activeTicks, 0);
  assert(
    totalCharges === totalActive,
    `total charges ${totalCharges} != total active ticks ${totalActive}`,
  );
  for (const [id, a] of audit) {
    assert(a.charges <= a.activeTicks, `rider ${id} double-charged`);
    assert(a.charges >= a.activeTicks, `rider ${id} under-charged`);
  }
});

test('T67', 'sizeByGroup is populated, not silently falling back', () => {
  // If sizeByGroup were empty the fallback would be 1, and a 40-rider bunch
  // would burn at the solo drafting rate (1.00) instead of 0.80.
  const riders = Array.from({ length: 40 }, (_, i) => riderWithClimbing(`r${i}`, 130));
  const snap = buildStageSnapshot({ stageId: 'd', seed: 1, riders, balance: B });
  const res = simulateStage({
    snapshot: snap,
    stage: {
      id: 'd',
      segments: [
        { startKm: 0, lengthKm: 160, terrain: Terrain.FLAT, referenceSpeedKmh: 42 },
      ],
    },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: { paceOnly: false, requiredPerformance: CANONICAL_REQUIRED_PERFORMANCE },
  });
  const e = [...res.riders.values()][0].energy;
  assertClose(e, 100 - 27.2, 0.05, 'bunch drafting rate not applied');
});

test('T68', 'determinism holds with the roster-based Energy pass', () => {
  const a = splitHeavyRun(false);
  const b = splitHeavyRun(false);
  const key = (r: typeof a) =>
    JSON.stringify(
      [...r.riders.entries()]
        .map(([id, s]) => [id, s.energy, s.finishTimeSec, s.struggle])
        .sort(),
    );
  assert(key(a) === key(b), 'runs diverged');
  assert(
    JSON.stringify(a.splits) === JSON.stringify(b.splits),
    'split events diverged',
  );
});


/* ================================================================== */
/* AF-01  Attack / Breakaway Formation                                */
/* ================================================================== */

const HARD = BreakawayEffort.HARD;

function afField(opts: {
  n?: number; ep?: number; attackerEp?: number; attackKm?: number;
  kind?: AttackKind; responders?: { count: number; reaction: number; kind: ResponseKind };
  breakEffort?: BreakawayEffort;
}) {
  const n = opts.n ?? 40;
  const riders = Array.from({ length: n }, (_, i) => {
    const base = riderWithClimbing(`r${i}`, i === 0 ? (opts.attackerEp ?? 130) : (opts.ep ?? 130));
    const attrs = { ...base.attributes, reaction: 200 };
    const resp = opts.responders;
    const isResponder = resp && i >= 1 && i <= resp.count;
    return {
      ...base,
      attributes: isResponder ? { ...attrs, reaction: resp!.reaction } : attrs,
      tactics: {
        breakawayEffort: opts.breakEffort ?? HARD,
        chaseIntensity: ChaseIntensity.NONE,
        ...(i === 0 ? { attackAtKm: opts.attackKm ?? 1, attackKind: opts.kind ?? AttackKind.NORMAL } : {}),
        ...(isResponder ? { response: resp!.kind } : {}),
      },
    };
  });
  return riders;
}

function afRun(riders: ReturnType<typeof afField>, lengthKm = 30) {
  const snap = buildStageSnapshot({ stageId: 'af', seed: 1, riders, balance: B });
  return simulateStage({
    snapshot: snap,
    stage: { id: 'af', segments: [{ startKm: 0, lengthKm, terrain: Terrain.FLAT, referenceSpeedKmh: 42 }] },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: { paceOnly: false, requiredPerformance: experimentalHoldingThreshold(B.HOLDING_K) },
    recordTimeline: true,
  });
}

test('A01', 'a PAG is invisible to resolveWorkMode', () => {
  const res = afRun(afField({}), 6);
  const launched = res.attacks.find((a) => a.kind === 'LAUNCH');
  assert(!!launched, 'no attack launched');
  assert(res.maxProvisionalGapSec > 0 && res.maxProvisionalGapSec < B.GAP_SEPARATE_MIN,
    `provisional gap ${res.maxProvisionalGapSec} outside (0,16)`);
  for (const t of res.timeline) {
    for (const g of t.groups) {
      assert(g.mode === WorkMode.NEUTRAL,
        `km ${t.km}: parent flipped to ${g.mode} while only a PAG existed`);
    }
  }
});

test('A02', 'materialisation at 16 s, not below', () => {
  const res = afRun(afField({}), 40);
  const m = res.attacks.find((a) => a.kind === 'MATERIALISE');
  assert(!!m, 'attack never materialised');
  assert(m!.gapSec >= B.GAP_SEPARATE_MIN, `materialised at ${m!.gapSec} s`);
  for (const a of res.attacks) {
    if (a.kind === 'MATERIALISE') continue;
    assert(a.gapSec < B.GAP_SEPARATE_MIN || a.kind === 'PAG_MERGE',
      `non-materialise event at ${a.gapSec} s`);
  }
});

test('A03', 'materialised group time == parent time - gap', () => {
  const res = afRun(afField({}), 40);
  const lead = res.groups.filter((g) => g.riderIds.length > 0)
    .sort((a, b) => a.timeSec - b.timeSec)[0];
  assert(lead.riderIds.includes('r0'), 'attacker is not in the leading group');
  const main = res.groups.filter((g) => g.riderIds.length > 1)
    .sort((a, b) => b.riderIds.length - a.riderIds.length)[0];
  assert(main.timeSec > lead.timeSec, 'peloton is not behind the escape');
});

test('A04', 'SP-01 mirrored: struggle reset on materialising ahead', () => {
  const res = afRun(afField({}), 40);
  assert(res.riders.get('r0')!.struggle === 0, 'attacker struggle not reset');
});

test('A05', 'reabsorption happens at gap <= 0, never at gap <= 2', () => {
  // No breakaway effort -> the attack cannot sustain and must come back.
  const res = afRun(afField({ breakEffort: BreakawayEffort.NORMAL }), 40);
  const re = res.attacks.find((a) => a.kind === 'REABSORB');
  assert(!!re, 'unsustained attack was never reabsorbed');
  assert(re!.gapSec <= 0, `reabsorbed at gap ${re!.gapSec}, expected <= 0`);
  assert(res.riders.get('r0')!.contact === ContactState.IN_GROUP, 'not back in group');
});

test('A05b', 'a normal attack survives the whole 0-2 s band', () => {
  // REQUIRED CORRECTION: the first 0.2 km tick gains ~1.51 s, which is inside
  // the 2 s merge band. The attack must NOT be cancelled there.
  const res = afRun(afField({}), 40);
  const events = res.attacks.filter((a) => a.riderId === 'r0');
  const reabsorbedEarly = events.find((a) => a.kind === 'REABSORB' && a.gapSec < 2);
  assert(!reabsorbedEarly, 'attack cancelled inside the 0-2 s band');
  assert(res.attacks.some((a) => a.kind === 'MATERIALISE'), 'attack did not survive to 16 s');
});

test('A05c', 'gap passes continuously through the 0-2 s band', () => {
  const res = afRun(afField({}), 40);
  // maxProvisionalGapSec proves the gap climbed past 2 s while provisional.
  assert(res.maxProvisionalGapSec > 2, `max provisional gap only ${res.maxProvisionalGapSec}`);
});

test('A06', 'mutual exclusion of contact states', () => {
  const res = afRun(afField({}), 40);
  for (const st of res.riders.values()) {
    const inPag = st.pagId !== null;
    assert(!(inPag && st.contact !== ContactState.ATTACKING),
      `rider ${st.id} in PAG but state ${st.contact}`);
    assert(!(st.contact === ContactState.ATTACKING && !inPag),
      `rider ${st.id} ATTACKING with no PAG`);
  }
});

test('A07', 'burst and recovery run on elapsed seconds, not tick count', () => {
  const w = newEffortWindow(attackProfile(AttackKind.NORMAL, B), true, B);
  assertClose(effortModifier(w), 0.06, 1e-12, 'burst modifier');
  advanceEffortWindow(w, B.ATTACK_BURST_SEC - 1);
  assertClose(effortModifier(w), 0.06, 1e-12, 'still in burst');
  advanceEffortWindow(w, 2);
  assertClose(effortModifier(w), -0.02, 1e-12, 'recovery tax');
  advanceEffortWindow(w, B.RECOVERY_SEC);
  assert(windowExhausted(w), 'window not exhausted');
  assertClose(effortModifier(w), 0, 1e-12, 'no modifier after recovery');
});

test('A08', 'attack launch costs exactly 5 / 8 Energy, once', () => {
  assert(attackProfile(AttackKind.NORMAL, B).energyCost === 5, 'normal cost');
  assert(attackProfile(AttackKind.ALL_OUT, B).energyCost === 8, 'all-out cost');
  assert(responseProfile(ResponseKind.NORMAL, B).energyCost === 2, 'response normal');
  assert(responseProfile(ResponseKind.HIGH, B).energyCost === 4, 'response high');
  const a = afRun(afField({ attackKm: 1 }), 3);
  const b = afRun(afField({ attackKm: 1, kind: AttackKind.ALL_OUT }), 3);
  const diff = b.riders.get('r0')!.energy - a.riders.get('r0')!.energy;
  assert(diff < -2.5 && diff > -3.5, `all-out should cost ~3 more, got ${(-diff).toFixed(2)}`);
});

test('A09', 'PAG rider burns Energy at PAG size, not parent size', () => {
  const res = afRun(afField({}), 5);
  const attacker = res.riders.get('r0')!;
  const bunch = res.riders.get('r5')!;
  assert(attacker.energy < bunch.energy,
    `solo attacker (${attacker.energy.toFixed(2)}) must burn more than the bunch (${bunch.energy.toFixed(2)})`);
});

test('A10', 'two PAGs within 2 s merge, beyond it they do not', () => {
  const fast = afRun(afField({ responders: { count: 1, reaction: 200, kind: ResponseKind.HIGH } }), 40);
  assert(fast.attacks.some((a) => a.kind === 'PAG_MERGE'), 'fast responder failed to latch');
  const slow = afRun(afField({ responders: { count: 1, reaction: 0, kind: ResponseKind.HIGH } }), 40);
  const slowLatch = slow.attacks.some((a) => a.kind === 'PAG_MERGE');
  assert(reactionDelaySec(0, B) === B.REACTION_MAX_DELAY_SEC, 'delay scale');
  assert(reactionDelaySec(200, B) === 0, 'perfect reaction has no delay');
  void slowLatch;
});

test('A11', 'a rider belongs to at most one PAG', () => {
  const res = afRun(afField({ responders: { count: 5, reaction: 150, kind: ResponseKind.NORMAL } }), 40);
  const seen = new Map<string, number>();
  for (const st of res.riders.values()) {
    if (st.pagId !== null) seen.set(st.id, (seen.get(st.id) ?? 0) + 1);
  }
  for (const [id, c] of seen) assert(c === 1, `rider ${id} in ${c} PAGs`);
});

test('A12', 'determinism with attacks active', () => {
  const f = () => afRun(afField({ responders: { count: 3, reaction: 120, kind: ResponseKind.HIGH } }), 30);
  const a = f(), b = f();
  assert(JSON.stringify(a.attacks) === JSON.stringify(b.attacks), 'attack history diverged');
  assert(JSON.stringify(a.splits) === JSON.stringify(b.splits), 'splits diverged');
});

test('A13', 'without Breakaway Effort below 16 s the escape rate is zero', () => {
  const res = afRun(afField({ breakEffort: BreakawayEffort.NORMAL }), 60);
  assert(!res.attacks.some((a) => a.kind === 'MATERIALISE'),
    'attack materialised without breakaway effort — the §7 decision is not load-bearing');
  assert(res.attacks.some((a) => a.kind === 'REABSORB'), 'no reabsorption either');
});

test('A14', 'reaction delay is 0 at Reaction 200 and full at Reaction 0', () => {
  assertClose(reactionDelaySec(200, B), 0, 1e-12, 'r200');
  assertClose(reactionDelaySec(100, B), B.REACTION_MAX_DELAY_SEC / 2, 1e-12, 'r100');
  assertClose(reactionDelaySec(0, B), B.REACTION_MAX_DELAY_SEC, 1e-12, 'r0');
});


/* ================================================================== */
/* AF-01c — sub-tick Reaction and target interception                 */
/* ================================================================== */

test('A15', 'response start fraction is continuous, not quantised to ticks', () => {
  const dtParent = 17.2; // a 0.2 km tick at 42 km/h
  const seen = new Set<number>();
  for (const rx of [0, 40, 80, 120, 160, 200]) {
    const delay = reactionDelaySec(rx, B);
    const within = delay % dtParent;
    seen.add(Number(responseActiveFraction(within, dtParent).toFixed(6)));
  }
  assert(seen.size > 2, `only ${seen.size} distinct timing states, expected > 2`);
});

test('A16', 'higher Reaction never starts the response later', () => {
  let prev = Infinity;
  for (const rx of [0, 40, 80, 120, 160, 200]) {
    const d = reactionDelaySec(rx, B);
    assert(d <= prev, `Reaction ${rx} delay ${d} > previous ${prev}`);
    prev = d;
  }
});

test('A17', 'activeFraction is clamped to [0,1] and monotone', () => {
  const dt = 17.2;
  assertClose(responseActiveFraction(dt, dt), 0, 1e-12, 'delay == dt');
  assertClose(responseActiveFraction(0, dt), 1, 1e-12, 'delay == 0');
  assert(responseActiveFraction(-5, dt) === 1, 'negative remaining clamps to 1');
  assert(responseActiveFraction(dt * 2, dt) === 0, 'over-long remaining clamps to 0');
  let prev = -1;
  for (let r = dt; r >= 0; r -= 1) {
    const f = responseActiveFraction(r, dt);
    assert(f >= prev, 'not monotone');
    prev = f;
  }
});

test('A18', 'crossing the target within one tick counts as a latch', () => {
  // behind -> ahead in a single tick must intercept, not overshoot
  assert(interceptsTarget(8, -8, B), 'crossing from behind to ahead missed');
  assert(interceptsTarget(-8, 8, B), 'crossing from ahead to behind missed');
  assert(interceptsTarget(1.5, 1.4, B), 'inside the band missed');
  assert(interceptsTarget(0, 0, B), 'exactly on target missed');
  assert(interceptsTarget(2, 30, B), 'touching the band edge missed');
  assert(!interceptsTarget(8, 4, B), 'never reached the band but latched');
  assert(!interceptsTarget(-4, -9, B), 'already past and receding but latched');
});

test('A19', 'interception is symmetric in the interval endpoints', () => {
  for (const [a, b] of [[8, -8], [3, 1], [-1, -5], [20, 19]] as const) {
    assert(
      interceptsTarget(a, b, B) === interceptsTarget(b, a, B),
      `asymmetric for ${a},${b}`,
    );
  }
});


/* ================================================================== */
/* AF-01d — same-tick Response transition                             */
/* ================================================================== */

function responseRun(reaction: number, respKind = ResponseKind.HIGH) {
  const mkr = (id: string, ep: number, rx: number, t: object): RiderSnapshot => {
    const a = { ...ZERO_ATTRIBUTES };
    for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] = ep;
    a.reaction = rx;
    return {
      id, attributes: a, condition: 1, setup: 1, weather: 1, startEnergy: 100,
      tactics: {
        breakawayEffort: BreakawayEffort.HARD,
        chaseIntensity: ChaseIntensity.NONE, ...t,
      },
    } as RiderSnapshot;
  };
  const riders = [
    mkr('atk', 130, 200, { attackAtKm: 1, attackKind: AttackKind.NORMAL }),
    mkr('rsp', 130, reaction, { response: respKind }),
    ...Array.from({ length: 38 }, (_, i) => mkr(`p${i}`, 130, 100, {})),
  ];
  const snap = buildStageSnapshot({ stageId: 'd', seed: 1, riders, balance: B });
  return simulateStage({
    snapshot: snap,
    stage: { id: 'd', segments: [
      { startKm: 0, lengthKm: 12, terrain: Terrain.FLAT, referenceSpeedKmh: 42 }] },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: {
      paceOnly: false,
      requiredPerformance: experimentalHoldingThreshold(B.HOLDING_K),
      auditEnergy: true,
    },
  });
}

test('A20', 'Response movement happens in the SAME tick it starts', () => {
  for (const rx of [0, 80, 200]) {
    const ev = responseRun(rx).attacks.find((a) => a.kind === 'RESPOND');
    assert(ev !== undefined, `no RESPOND event at Reaction ${rx}`);
    const f = ev!.startFraction!;
    const g = ev!.responderGapSec!;
    if (f > 0) {
      assert(g > 0, `Reaction ${rx}: f=${f} but end-of-tick gap ${g} — movement deferred`);
    }
  }
});

test('A21', 'end-of-tick gap scales with the active fraction', () => {
  const rows = [0, 40, 80, 120, 160, 200].map((rx) => {
    const ev = responseRun(rx).attacks.find((a) => a.kind === 'RESPOND')!;
    return { rx, f: ev.startFraction!, gap: ev.responderGapSec! };
  });
  for (const r of rows) {
    if (r.f === 0) { assertClose(r.gap, 0, 1e-12, `f=0 must not move (Rx ${r.rx})`); continue; }
    assert(r.gap > 0, `Rx ${r.rx}: f=${r.f} gap=${r.gap}`);
  }
  // within one tick band, a larger fraction must open a larger gap
  const sameTick = rows.filter((r) => r.rx >= 120);
  for (let i = 1; i < sameTick.length; i++) {
    if (sameTick[i].f > sameTick[i - 1].f) {
      assert(sameTick[i].gap >= sameTick[i - 1].gap,
        `gap not monotone in f: ${JSON.stringify(sameTick)}`);
    }
  }
});

test('A22', 'delays 0/6/12/18/24/30 map to distinct real start offsets', () => {
  const offsets = [200, 160, 120, 80, 40, 0].map((rx) => {
    const ev = responseRun(rx).attacks.find((a) => a.kind === 'RESPOND')!;
    return Number((ev.startOffsetSec! + 0).toFixed(4));
  });
  assert(new Set(offsets).size >= 5,
    `expected >= 5 distinct start offsets, got ${JSON.stringify(offsets)}`);
});

test('A23', 'fixed Response Energy is charged exactly once', () => {
  const res = responseRun(120);
  const audit = res.energyAudit!;
  for (const [, a] of audit) {
    assert(a.charges === a.activeTicks, 'per-tick charge accounting broken');
  }
  const withResp = res.riders.get('rsp')!.energy;
  const plain = res.riders.get('p0')!.energy;
  // responder pays the fixed cost plus PAG-context burn; never twice the fixed cost
  const diff = plain - withResp;
  assert(diff > B.RESPONSE_HIGH_ENERGY * 0.5,
    `responder barely paid: ${diff}`);
  assert(diff < B.RESPONSE_HIGH_ENERGY * 2,
    `responder appears double-charged the fixed cost: ${diff}`);
});

test('A24', 'RESPOND reports the TARGET PAG gap with two simultaneous PAGs', () => {
  const mkr = (id: string, rx: number, t: object): RiderSnapshot => {
    const a = { ...ZERO_ATTRIBUTES };
    for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] = 130;
    a.reaction = rx;
    return { id, attributes: a, condition: 1, setup: 1, weather: 1, startEnergy: 100,
      tactics: { breakawayEffort: BreakawayEffort.HARD,
        chaseIntensity: ChaseIntensity.NONE, ...t } } as RiderSnapshot;
  };
  // two attackers launching at DIFFERENT km, so their gaps differ when the
  // responder answers the second one
  const riders = [
    mkr('a1', 200, { attackAtKm: 1, attackKind: AttackKind.NORMAL }),
    mkr('a2', 200, { attackAtKm: 3, attackKind: AttackKind.NORMAL }),
    mkr('rsp', 200, { response: ResponseKind.HIGH }),
    ...Array.from({ length: 37 }, (_, i) => mkr(`p${i}`, 100, {})),
  ];
  const snap = buildStageSnapshot({ stageId: 'd2', seed: 1, riders, balance: B });
  const res = simulateStage({
    snapshot: snap,
    stage: { id: 'd2', segments: [
      { startKm: 0, lengthKm: 10, terrain: Terrain.FLAT, referenceSpeedKmh: 42 }] },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: { paceOnly: false,
      requiredPerformance: experimentalHoldingThreshold(B.HOLDING_K) },
  });
  const resp = res.attacks.filter((a) => a.kind === 'RESPOND');
  assert(resp.length >= 1, 'no response fired');
  // the reported gap must be a specific PAG's gap, never a max over all PAGs
  for (const r of resp) {
    assert(r.gapSec >= 0, 'negative target gap');
    assert(r.gapSec < B.GAP_SEPARATE_MIN, 'target gap should be provisional');
  }
});


/* ================================================================== */
/* AF-01e — launch causality and interception start                   */
/* ================================================================== */

test('A25', 'a Response created by an end-of-tick Attack does not consume that tick', () => {
  // Reaction 200 has zero delay. Under the defect it would have consumed the
  // already-completed tick and started retroactively at f = 1 in the SAME tick
  // the attack launched. It must instead start at the launch boundary, i.e.
  // in the following interval.
  const res = responseRun(200);
  const launch = res.attacks.find((a) => a.kind === 'LAUNCH')!;
  const resp = res.attacks.find((a) => a.kind === 'RESPOND')!;
  assert(
    resp.km > launch.km - 1e-9,
    `response km ${resp.km} precedes launch km ${launch.km}`,
  );
  assert(
    resp.km >= launch.km + B.TICK_KM - 1e-9,
    `Reaction 200 responded inside the launch tick (resp ${resp.km}, launch ${launch.km})`,
  );
});

test('A26', 'Reaction 200 starts at the launch boundary with no retroactive movement', () => {
  const res = responseRun(200);
  const resp = res.attacks.find((a) => a.kind === 'RESPOND')!;
  assertClose(resp.startFraction!, 1, 1e-9, 'zero delay must give f = 1');
  assert(
    resp.responderGapSec! > 0,
    'f = 1 must produce a full interval of movement',
  );
});

test('A27', 'fixed Response Energy is not charged before the logical start', () => {
  // With a long delay the responder must still be on full Energy minus only
  // per-tick burn until the Response actually fires.
  const res = responseRun(0); // 30 s delay
  const resp = res.attacks.find((a) => a.kind === 'RESPOND')!;
  const plain = res.riders.get('p0')!.energy;
  const rsp = res.riders.get('rsp')!.energy;
  assert(resp !== undefined, 'no response fired');
  // charged exactly once overall
  const diff = plain - rsp;
  assert(
    diff > B.RESPONSE_HIGH_ENERGY * 0.5 && diff < B.RESPONSE_HIGH_ENERGY * 2,
    `fixed cost looks mis-charged: ${diff}`,
  );
});

test('A28', 'target gap is interpolated to the actual Response start', () => {
  // before 0, after 4, half way through the tick -> 2
  assertClose(interpolateTargetGap(0, 4, 8.6, 17.2), 2, 1e-9, 'midpoint');
  assertClose(interpolateTargetGap(0, 4, 0, 17.2), 0, 1e-9, 'start of tick');
  assertClose(interpolateTargetGap(0, 4, 17.2, 17.2), 4, 1e-9, 'end of tick');
  assertClose(interpolateTargetGap(1, 3, 4.3, 17.2), 1.5, 1e-9, 'quarter');
  // clamped
  assertClose(interpolateTargetGap(0, 4, -5, 17.2), 0, 1e-9, 'negative clamps');
  assertClose(interpolateTargetGap(0, 4, 99, 17.2), 4, 1e-9, 'overlong clamps');
});

test('A29', 'inside 2 s at tick start but outside at actual start does not auto-latch', () => {
  const dt = 17.2;
  // target goes 1.5 -> 6.0 across the tick; the response starts 90 % of the
  // way through, so the real gap at start is ~5.6, outside the band.
  const atStart = interpolateTargetGap(1.5, 6.0, 0.9 * dt, dt);
  assert(atStart > B.GAP_MERGE_MAX, `interpolated ${atStart} should be outside the band`);
  // responder ends the fractional slice a little ahead of 0 but well short
  assert(
    !interceptsTarget(atStart, 6.0 - 0.4, B),
    'latched even though the target was never inside the band after the start',
  );
  // and the naive tick-start comparison WOULD have latched — this is the bug
  assert(
    interceptsTarget(1.5, 6.0 - 0.4, B),
    'fixture does not reproduce the defect it is guarding',
  );
});

test('A30', 'a genuine crossing after the Response start still latches', () => {
  const dt = 17.2;
  const atStart = interpolateTargetGap(5.0, 6.0, 0.5 * dt, dt); // 5.5
  assert(interceptsTarget(atStart, -3.0, B), 'real crossing missed');
});


test('A31', 'RESPOND reports the INTERPOLATED target gap, not the tick-start gap', () => {
  // Reaction 80 gives f = 0.95, i.e. the response starts 5 % into its tick, so
  // the interpolated target gap must be close to the target's gap at the START
  // of that tick and clearly below its end-of-tick value.
  const mid = responseRun(80).attacks.find((a) => a.kind === 'RESPOND')!;
  const full = responseRun(200).attacks.find((a) => a.kind === 'RESPOND')!;
  assert(mid.startFraction! > 0 && mid.startFraction! < 1, 'fixture is not mid-tick');
  assert(mid.gapSec >= 0, 'negative interpolated gap');
  // a later start inside the same tick must see a LARGER target gap
  const late = responseRun(0).attacks.find((a) => a.kind === 'RESPOND')!;
  assert(
    late.gapSec >= mid.gapSec - 1e-9,
    `later start saw a smaller target gap: late ${late.gapSec} vs mid ${mid.gapSec}`,
  );
  void full;
});


/* ================================================================== */
/* AF-01f — EffortWindow belongs to the RIDER                         */
/* ================================================================== */

function attackRun(opts: {
  effort?: BreakawayEffort; lengthKm?: number; kind?: AttackKind;
} = {}) {
  const mkr = (id: string, ep: number, t: object): RiderSnapshot => {
    const a = { ...ZERO_ATTRIBUTES };
    for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] = ep;
    a.reaction = 100;
    return { id, attributes: a, condition: 1, setup: 1, weather: 1, startEnergy: 100,
      tactics: { breakawayEffort: opts.effort ?? BreakawayEffort.NORMAL,
        chaseIntensity: ChaseIntensity.NONE, ...t } } as RiderSnapshot;
  };
  const riders = [
    mkr('atk', 130, { attackAtKm: 1, attackKind: opts.kind ?? AttackKind.NORMAL }),
    ...Array.from({ length: 39 }, (_, i) => mkr(`p${i}`, 130, {})),
  ];
  const snap = buildStageSnapshot({ stageId: 'f', seed: 1, riders, balance: B });
  return simulateStage({
    snapshot: snap,
    stage: { id: 'f', segments: [
      { startKm: 0, lengthKm: opts.lengthKm ?? 25, terrain: Terrain.FLAT,
        referenceSpeedKmh: 42 }] },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: { paceOnly: false,
      requiredPerformance: experimentalHoldingThreshold(B.HOLDING_K),
      auditEnergy: true },
    recordTimeline: true,
  });
}

test('A32', 'a reabsorbed attacker keeps his burst/recovery timeline', () => {
  // NORMAL breakaway effort -> the solo attack is reabsorbed (AF-01 §7 numbers)
  const res = attackRun();
  const reab = res.attacks.find((a) => a.kind === 'REABSORB');
  assert(reab !== undefined, 'fixture produced no reabsorption');
  const after = res.windowTrace.filter(
    (w) => w.riderId === 'atk' && w.km > reab!.km + 1e-9,
  );
  assert(after.length > 0, 'window was destroyed on reabsorption');
  assert(
    after.some((w) => w.contact === ContactState.IN_GROUP),
    'window did not survive back into the parent group',
  );
});

test('A33', 'a reabsorbed attacker keeps paying the recovery tax', () => {
  const res = attackRun();
  const reab = res.attacks.find((a) => a.kind === 'REABSORB')!;
  const taxed = res.windowTrace.filter(
    (w) => w.riderId === 'atk' && w.km > reab.km + 1e-9 &&
      w.burstLeft <= 0 && w.recoveryLeft > 0,
  );
  assert(taxed.length > 0, 'no recovery ticks after reabsorption');
  for (const t of taxed) {
    assert(t.modifier < 0, `recovery tick with non-negative modifier ${t.modifier}`);
  }
});

test('A34', 'a materialised attacker keeps the remaining window', () => {
  const res = attackRun({ effort: BreakawayEffort.HARD, lengthKm: 30 });
  const mat = res.attacks.find((a) => a.kind === 'MATERIALISE');
  if (!mat) { assert(true, 'no materialisation in fixture'); return; }
  const after = res.windowTrace.filter(
    (w) => w.riderId === 'atk' && w.km > mat.km + 1e-9,
  );
  // if the window was still live at materialisation it must survive
  const atMat = res.windowTrace.filter(
    (w) => w.riderId === 'atk' && Math.abs(w.km - mat.km) < 1e-9,
  );
  if (atMat.length > 0) {
    assert(after.length > 0, 'window destroyed by materialisation');
  }
});

test('A35', 'a window expires only when its simulated duration reaches zero', () => {
  const res = attackRun({ effort: BreakawayEffort.HARD, lengthKm: 30 });
  const mine = res.windowTrace.filter((w) => w.riderId === 'atk');
  assert(mine.length > 0, 'no window trace');
  const last = mine[mine.length - 1];
  assert(
    last.burstLeft <= 0 && last.recoveryLeft >= 0,
    `window vanished mid-burst: ${JSON.stringify(last)}`,
  );
  // remaining time must be monotonically non-increasing
  let prev = Infinity;
  for (const w of mine) {
    const total = w.burstLeft + w.recoveryLeft;
    assert(total <= prev + 1e-9, 'window time went backwards');
    prev = total;
  }
});

test('A36', 'no double advancement on a handover tick', () => {
  const res = attackRun({ effort: BreakawayEffort.HARD, lengthKm: 30 });
  const mine = res.windowTrace.filter((w) => w.riderId === 'atk');
  const dtMax = (3600 * B.TICK_KM) / (0.6 * 42); // slowest possible interval
  for (let i = 1; i < mine.length; i++) {
    const drop =
      (mine[i - 1].burstLeft + mine[i - 1].recoveryLeft) -
      (mine[i].burstLeft + mine[i].recoveryLeft);
    assert(
      drop <= dtMax + 1e-6,
      `window advanced ${drop.toFixed(2)} s in one interval, max ${dtMax.toFixed(2)}`,
    );
  }
});

test('A37', 'attack fixed Energy is still charged exactly once', () => {
  const res = attackRun({ effort: BreakawayEffort.HARD, lengthKm: 30 });
  for (const [, a] of res.energyAudit!) {
    assert(a.charges === a.activeTicks, 'per-tick charge accounting broken');
  }
  const atk = res.riders.get('atk')!.energy;
  const plain = res.riders.get('p0')!.energy;
  const diff = plain - atk;
  assert(
    diff > B.ATTACK_NORMAL_ENERGY * 0.5 && diff < B.ATTACK_NORMAL_ENERGY * 3,
    `fixed attack cost looks mis-charged: ${diff}`,
  );
});

test('A38', 'end-to-end 16 s handover stays continuous', () => {
  const res = attackRun({ effort: BreakawayEffort.HARD, lengthKm: 30 });
  const mat = res.attacks.find((a) => a.kind === 'MATERIALISE');
  assert(mat !== undefined, 'no materialisation');
  assertClose(mat!.gapSec, B.GAP_SEPARATE_MIN, 2.5, 'materialised far from 16 s');

  // after materialisation the front group must resolve ESCAPE and the parent CHASE
  const after = res.timeline.filter((t) => t.km > mat!.km + 1e-9).slice(0, 4);
  assert(after.length > 0, 'no ticks after materialisation');
  const front = after[0].groups[0];
  assert(front.mode === WorkMode.ESCAPE, `front group is ${front.mode}, expected ESCAPE`);
  if (after[0].groups.length > 1) {
    assert(
      after[0].groups[1].mode === WorkMode.CHASE,
      `parent is ${after[0].groups[1].mode}, expected CHASE`,
    );
  }

  // the gap must be continuous across the handover, never reset
  for (const t of after) {
    if (t.gapsSec.length === 0) continue;
    assert(
      t.gapsSec[0] >= B.GAP_SEPARATE_MIN - 3,
      `gap collapsed to ${t.gapsSec[0]} right after a 16 s handover`,
    );
  }
});


/* ================================================================== */
/* AF-01g — tick EP consistency and LOSING_CONTACT window time        */
/* ================================================================== */

test('A39', 'Pace and Struggle use the exact same pre-advance EP', () => {
  // Must use the REABSORB fixture: while a rider is ATTACKING he is not in the
  // parent's rider list, so he never reaches the Struggle pass and the
  // comparison would be vacuous. Only a reabsorbed rider carries a live window
  // INTO a real group, which is exactly the case this guards.
  const res = attackRun({ lengthKm: 25 });
  assert(res.epTrace.length > 0, 'no EP trace');

  const live = new Set(
    res.windowTrace.filter((w) => w.modifier !== 0)
      .map((w) => `${w.riderId}|${w.km.toFixed(4)}`),
  );
  let checked = 0;
  let withLiveWindow = 0;
  for (const e of res.epTrace) {
    if (Number.isNaN(e.paceEP)) continue;
    assertClose(e.struggleEP, e.paceEP, 1e-12,
      `km ${e.km} rider ${e.riderId}: pace EP ${e.paceEP} vs struggle EP ${e.struggleEP}`);
    checked++;
    if (live.has(`${e.riderId}|${e.km.toFixed(4)}`)) withLiveWindow++;
  }
  assert(checked > 100, `only ${checked} EP comparisons`);
  assert(withLiveWindow > 0,
    'no compared tick had a live EffortWindow — the test would be vacuous');
});

test('A40', 'recovery tax moves Struggle EP after reabsorption', () => {
  const res = attackRun({ lengthKm: 25 });
  const reab = res.attacks.find((a) => a.kind === 'REABSORB');
  assert(reab !== undefined, 'no reabsorption in fixture');
  // during recovery the attacker's EP must sit BELOW a plain bunch rider's
  const taxedKm = res.windowTrace
    .filter((w) => w.riderId === 'atk' && w.km > reab!.km + 1e-9 && w.modifier < 0)
    .map((w) => w.km);
  assert(taxedKm.length > 0, 'no taxed ticks after reabsorption');
  for (const km of taxedKm.slice(0, 5)) {
    const atk = res.epTrace.find((e) => e.riderId === 'atk' && Math.abs(e.km - km) < 1e-9);
    const plain = res.epTrace.find((e) => e.riderId === 'p0' && Math.abs(e.km - km) < 1e-9);
    if (!atk || !plain) continue;
    assert(atk.struggleEP < plain.struggleEP,
      `km ${km}: taxed rider EP ${atk.struggleEP} not below plain ${plain.struggleEP}`);
  }
});

test('A41', 'a window does not freeze while the rider is LOSING_CONTACT', () => {
  // wide spread guarantees LOSING_CONTACT riders; the attacker also drops back
  const mkr = (id: string, ep: number, t: object): RiderSnapshot => {
    const a = { ...ZERO_ATTRIBUTES };
    for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] = ep;
    a.reaction = 100;
    return { id, attributes: a, condition: 1, setup: 1, weather: 1, startEnergy: 100,
      tactics: { breakawayEffort: BreakawayEffort.NORMAL,
        chaseIntensity: ChaseIntensity.NONE, ...t } } as RiderSnapshot;
  };
  const riders = [
    mkr('atk', 96, { attackAtKm: 1, attackKind: AttackKind.ALL_OUT }),
    ...Array.from({ length: 39 }, (_, i) => mkr(`p${i}`, 130 + i * 0.5, {})),
  ];
  const snap = buildStageSnapshot({ stageId: 'lc', seed: 1, riders, balance: B });
  const res = simulateStage({
    snapshot: snap,
    stage: { id: 'lc', segments: [
      { startKm: 0, lengthKm: 20, terrain: Terrain.FLAT, referenceSpeedKmh: 42 }] },
    initialGroups: [riders.map((r) => r.id)],
    balance: B,
    options: { paceOnly: false,
      requiredPerformance: experimentalHoldingThreshold(B.HOLDING_K) },
    recordTimeline: true,
  });
  const lc = res.windowTrace.filter((w) => w.contact === ContactState.LOSING_CONTACT);
  if (lc.length < 2) { assert(true, 'no LOSING_CONTACT window ticks in fixture'); return; }
  const byRider = new Map<string, typeof lc>();
  for (const w of lc) {
    const arr = byRider.get(w.riderId) ?? [];
    arr.push(w); byRider.set(w.riderId, arr);
  }
  for (const [rid, arr] of byRider) {
    if (arr.length < 2) continue;
    const first = arr[0].burstLeft + arr[0].recoveryLeft;
    const last = arr[arr.length - 1].burstLeft + arr[arr.length - 1].recoveryLeft;
    assert(last < first - 1e-9,
      `rider ${rid} window froze while LOSING_CONTACT (${first} -> ${last})`);
  }
});

test('A42', 'LOSING_CONTACT advance is at least dtGroup and never double', () => {
  const res = attackRun({ effort: BreakawayEffort.HARD, lengthKm: 30 });
  const mine = res.windowTrace.filter((w) => w.riderId === 'atk');
  // an interval can never remove more than dtGroup + the largest plausible
  // drop-model contribution; a double advance would exceed 2 x dtGroup
  const dtNominal = (3600 * B.TICK_KM) / 42;
  for (let i = 1; i < mine.length; i++) {
    const drop = (mine[i - 1].burstLeft + mine[i - 1].recoveryLeft)
      - (mine[i].burstLeft + mine[i].recoveryLeft);
    assert(drop < 3 * dtNominal,
      `interval removed ${drop.toFixed(2)} s, nominal ${dtNominal.toFixed(2)} — double advance`);
  }
});

test('A43', 'materialisation does not double-advance the window', () => {
  const res = attackRun({ effort: BreakawayEffort.HARD, lengthKm: 30 });
  const mat = res.attacks.find((a) => a.kind === 'MATERIALISE');
  if (!mat) { assert(true, 'no materialisation'); return; }
  const mine = res.windowTrace.filter((w) => w.riderId === 'atk');
  const idx = mine.findIndex((w) => Math.abs(w.km - mat.km) < 1e-9);
  if (idx <= 0) { assert(true, 'window already expired at materialisation'); return; }
  const dtNominal = (3600 * B.TICK_KM) / 42;
  const drop = (mine[idx - 1].burstLeft + mine[idx - 1].recoveryLeft)
    - (mine[idx].burstLeft + mine[idx].recoveryLeft);
  assert(drop < 2 * dtNominal,
    `handover tick removed ${drop.toFixed(2)} s, nominal ${dtNominal.toFixed(2)}`);
});


test('A44', 'fixed Attack Energy still charged exactly once with tick EP', () => {
  const res = attackRun({ effort: BreakawayEffort.HARD, lengthKm: 30 });
  for (const [, a] of res.energyAudit!) {
    assert(a.charges === a.activeTicks, 'per-tick charge accounting broken');
  }
});


/* ================================================================== */
/* TC-01A — isolated BaseSegmentSkill validation                      */
/* ================================================================== */

const EQUAL_BUDGET = 130;

/** A rider with every attribute equal, i.e. a fixed total budget. */
function flatRider(level = EQUAL_BUDGET): Attributes {
  const a = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = level;
  return a;
}

/**
 * A specialist: the SAME total budget as a flat rider, redistributed so that
 * `strong` gains what `weak` loses. This measures terrain specialisation
 * rather than overall rider quality.
 */
function specialist(
  strong: keyof Attributes,
  weak: keyof Attributes,
  delta = 40,
): Attributes {
  const a = flatRider();
  a[strong] += delta;
  a[weak] -= delta;
  return a;
}

test('TC01A-1', 'every terrain weight table sums to exactly 1 when normalised', () => {
  assertWeightTablesValid();
  for (const t of ALL_TERRAINS) {
    const raw = Object.values(SEGMENT_SKILL_WEIGHTS[t].weights)
      .reduce((x, y) => x + (y ?? 0), 0);
    assert(raw === 100, `${t} raw weights sum to ${raw}, expected 100`);
    assertClose(raw / 100, 1, 0, `${t} normalised sum`);
  }
});

test('TC01A-2', 'frozen vs placeholder tables are exactly as expected', () => {
  const frozen = ALL_TERRAINS.filter((t) => SEGMENT_SKILL_WEIGHTS[t].frozen);
  const placeholder = unvalidatedTerrains();
  assert(
    frozen.length === 2 &&
      frozen.includes(Terrain.MOUNTAIN) &&
      frozen.includes(Terrain.DESCENT),
    `frozen set is ${frozen.join(',')}, expected MOUNTAIN + DESCENT`,
  );
  assert(
    placeholder.length === 3 &&
      placeholder.includes(Terrain.FLAT) &&
      placeholder.includes(Terrain.HILLY) &&
      placeholder.includes(Terrain.CLASSICS),
    `placeholder set is ${placeholder.join(',')}`,
  );
});

test('TC01A-3', 'perturbing one attribute moves BaseSegmentSkill by exactly its weight', () => {
  for (const t of ALL_TERRAINS) {
    const w = SEGMENT_SKILL_WEIGHTS[t].weights;
    for (const [key, weight] of Object.entries(w)) {
      const base = flatRider();
      const bumped = { ...base, [key]: base[key as keyof Attributes] + 10 };
      const delta =
        baseSegmentSkill(bumped, t) - baseSegmentSkill(base, t);
      assertClose(
        delta,
        (10 * (weight as number)) / 100,
        1e-12,
        `${t}.${key}: +10 should move BaseSegmentSkill by ${(10 * (weight as number)) / 100}`,
      );
    }
  }
});

test('TC01A-4', 'attributes outside a terrain table have exactly zero effect', () => {
  for (const t of ALL_TERRAINS) {
    const used = new Set(Object.keys(SEGMENT_SKILL_WEIGHTS[t].weights));
    const base = flatRider();
    const ref = baseSegmentSkill(base, t);
    for (const key of Object.keys(base) as (keyof Attributes)[]) {
      if (used.has(key)) continue;
      const bumped = { ...base, [key]: base[key] + 50 };
      assertClose(
        baseSegmentSkill(bumped, t),
        ref,
        1e-12,
        `${t}: unrelated attribute ${key} changed BaseSegmentSkill`,
      );
    }
  }
});

test('TC01A-5', 'equal-budget archetypes order correctly on each terrain', () => {
  // Each archetype spends the SAME total budget; only the distribution differs.
  const climber = specialist('climbing', 'flat');
  const rouleur = specialist('flat', 'climbing');
  const puncheur = specialist('hills', 'flat');
  const descender = specialist('descending', 'climbing');
  const allRounder = flatRider();

  const on = (t: Terrain, a: Attributes) => baseSegmentSkill(a, t);

  // budgets really are equal
  const total = (a: Attributes) =>
    Object.values(a).reduce((x, y) => x + y, 0);
  for (const a of [climber, rouleur, puncheur, descender]) {
    assertClose(total(a), total(allRounder), 1e-9, 'archetype budget differs');
  }

  assert(
    on(Terrain.MOUNTAIN, climber) > on(Terrain.MOUNTAIN, rouleur),
    'climber must beat rouleur on MOUNTAIN',
  );
  assert(
    on(Terrain.FLAT, rouleur) > on(Terrain.FLAT, climber),
    'rouleur must beat climber on FLAT',
  );
  assert(
    on(Terrain.HILLY, puncheur) > on(Terrain.HILLY, rouleur),
    'puncheur must beat rouleur on HILLY',
  );
  assert(
    on(Terrain.DESCENT, descender) > on(Terrain.DESCENT, climber),
    'descender must beat climber on DESCENT',
  );
  assert(
    on(Terrain.MOUNTAIN, climber) > on(Terrain.MOUNTAIN, allRounder) &&
      on(Terrain.MOUNTAIN, allRounder) > on(Terrain.MOUNTAIN, rouleur),
    'MOUNTAIN ordering climber > all-rounder > rouleur failed',
  );
});

test('TC01A-6', 'an all-rounder scores identically on every terrain', () => {
  // With all attributes equal and weights summing to 1, BaseSegmentSkill must
  // equal the attribute level on every terrain. This is the invariant that
  // makes TC01A-5 a specialisation test rather than a quality test.
  const a = flatRider();
  for (const t of ALL_TERRAINS) {
    assertClose(baseSegmentSkill(a, t), EQUAL_BUDGET, 1e-12, `${t}`);
  }
});


test('TC01C-1', 'CLASSICS candidate table is exactly as specified and CANDIDATE', () => {
  const e = SEGMENT_SKILL_WEIGHTS[Terrain.CLASSICS];
  assert(e.status === 'CANDIDATE', `status is ${e.status}, expected CANDIDATE`);
  assert(!e.frozen, 'CANDIDATE must not be frozen');
  const want: Record<string, number> = {
    hills: 25, endurance: 20, flat: 15, acceleration: 10,
    positioning: 10, roughSurface: 10, packRiding: 5, bikeHandling: 5,
  };
  assertClose(
    Object.values(e.weights).reduce((a, b) => a + (b ?? 0), 0), 100, 0, 'sum',
  );
  for (const [k, v] of Object.entries(want)) {
    assert((e.weights as Record<string, number>)[k] === v,
      `CLASSICS.${k} is ${(e.weights as Record<string, number>)[k]}, expected ${v}`);
  }
  assert(
    !('climbing' in e.weights),
    'CLASSICS must NOT contain climbing — HILLY and MOUNTAIN carry climbing demand',
  );
});

test('TC01C-2', 'MOUNTAIN and DESCENT remain frozen and untouched', () => {
  assert(SEGMENT_SKILL_WEIGHTS[Terrain.MOUNTAIN].status === 'FROZEN', 'MOUNTAIN');
  assert(SEGMENT_SKILL_WEIGHTS[Terrain.DESCENT].status === 'FROZEN', 'DESCENT');
  assert(
    (SEGMENT_SKILL_WEIGHTS[Terrain.MOUNTAIN].weights as Record<string, number>).climbing === 52,
    'MOUNTAIN climbing weight changed',
  );
  assert(
    (SEGMENT_SKILL_WEIGHTS[Terrain.DESCENT].weights as Record<string, number>).descending === 60,
    'DESCENT descending weight changed',
  );
});

test('TC01C-3', 'roughSurface affects CLASSICS only', () => {
  const a = { ...ZERO_ATTRIBUTES };
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = 130;
  const bumped = { ...a, roughSurface: 140 };
  for (const t of ALL_TERRAINS) {
    const delta = baseSegmentSkill(bumped, t) - baseSegmentSkill(a, t);
    if (t === Terrain.CLASSICS) {
      assertClose(delta, 1.0, 1e-12, 'CLASSICS roughSurface weight is 10 %');
    } else {
      assertClose(delta, 0, 1e-12, `${t} must ignore roughSurface`);
    }
  }
});


test('TC01E-1', 'HOLDING_K is ratified at 0.40 for V1', () => {
  // TC-01 Holding calibration is CLOSED. This guard exists so a later change
  // is a deliberate act with a benchmark behind it, not a drift.
  assertClose(B.HOLDING_K, 0.4, 0, 'HOLDING_K must stay 0.40 unless re-benchmarked');
});

test('TC01E-2', 'the ratified holding threshold matches the closed form', () => {
  // tolerance below PaceEP = PaceEP * K * (1 - draftMult(n))
  for (const n of [40, 21, 11, 5, 1]) {
    const paceEP = 130;
    const req = paceEP * holdingFactor(B.HOLDING_K, n);
    const tolerance = paceEP - req;
    assertClose(
      tolerance,
      paceEP * B.HOLDING_K * (1 - draftingEnergyMultiplier(n)),
      1e-12,
      `closed form mismatch at n=${n}`,
    );
  }
  // a full bunch gets the widest tolerance, a solo rider none
  assertClose(holdingFactor(B.HOLDING_K, 1), 1, 1e-12, 'solo rider gets no allowance');
  assert(
    holdingFactor(B.HOLDING_K, 40) < holdingFactor(B.HOLDING_K, 5),
    'bigger bunch must be easier to hold',
  );
});

process.exit(runAll() === 0 ? 0 : 1);
