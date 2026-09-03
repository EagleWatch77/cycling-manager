import { BalanceConfig } from '../config/balance.js';
import {
  Group,
  RiderState,
  RiderSnapshot,
  Segment,
  StageTemplate,
  WorkMode,
  ContactState,
} from '../types/domain.js';
import { StageSnapshot, energyPenalty } from './snapshot.js';
import { baseSegmentSkill } from '../config/segmentSkills.js';
import {
  computeGroupPace,
  PaceMember,
  PaceResult,
  resolveWorkMode,
} from './groupPace.js';
import { gapSec, mergeGroups, dropLossSecPerKm } from './splitMerge.js';
import {
  ProvisionalAttackGroup, PendingResponse, EffortWindow, AttackKind, ResponseKind,
  attackProfile, responseProfile, PAG_MODE, reactionDelaySec, newEffortWindow,
  responseActiveFraction, interceptsTarget, interpolateTargetGap,
  effortModifier, advanceEffortWindow, windowExhausted, pagIsReabsorbed,
  pagsShouldMerge, pagShouldMaterialise,
} from './attack.js';
import { energyBurnForTick, clampEnergy } from './energy.js';
import {
  RequiredPerformancePort,
  UNSPECIFIED_REQUIRED_PERFORMANCE,
  CANONICAL_REQUIRED_PERFORMANCE,
  struggleDeltaPerKm,
  deficit as calcDeficit,
} from './struggle.js';

/**
 * Segment loop.
 *
 * Groups advance by TICK_KM of COURSE DISTANCE, each accumulating its OWN
 * elapsed time. Gaps are derived (t_behind - t_ahead at the same km).
 * The Group Time invariant therefore holds by construction.
 */

export interface SimulationOptions {
  /**
   * paceOnly = true  : Group Pace only. No Struggle, no splits, no drops.
   * paceOnly = false : full race — Struggle, drop initiation, 16 s handover,
   *                    split creation and merge.
   */
  readonly paceOnly: boolean;
  readonly requiredPerformance?: RequiredPerformancePort;
  /** Struggle disabled for these rider ids. Used by benchmark B7b. */
  readonly freezeStruggleFor?: ReadonlySet<string>;
  /** Record per-rider Energy charge accounting. Test/diagnostic only. */
  readonly auditEnergy?: boolean;
}

export interface AttackEvent {
  readonly km: number;
  readonly riderId: string;
  readonly kind: 'LAUNCH' | 'RESPOND' | 'MATERIALISE' | 'REABSORB' | 'PAG_MERGE';
  /** RESPOND only: where inside the tick the response began. AF-01c. */
  readonly startFraction?: number;
  readonly startOffsetSec?: number;
  /** RESPOND only: the gap the responder had opened by the END of that tick. */
  readonly responderGapSec?: number;
  readonly gapSec: number;
}

export interface SplitEvent {
  readonly km: number;
  readonly riderId: string;
  readonly fromGroupId: number;
  readonly toGroupId: number;
}

export interface TickRecord {
  readonly km: number;
  readonly groups: readonly {
    id: number;
    size: number;
    riderIds: readonly string[];
    mode: WorkMode;
    timeSec: number;
    speedKmh: number;
    secPerKm: number;
    pacePower: number;
    paceEP: number;
    requiredPerformance: number;
    workerCount: number;
    clamped: boolean;
  }[];
  readonly gapsSec: readonly number[];
}

export interface EnergyAudit {
  /** Ticks in which this rider was charged Energy. */
  readonly charges: number;
  /** Ticks in which this rider was active at tick start. */
  readonly activeTicks: number;
  /** Group size used for the tick in which this rider split, if any. */
  readonly splitTickGroupSize: number | null;
}

export interface SimulationResult {
  readonly snapshot: StageSnapshot;
  readonly groups: readonly Group[];
  readonly riders: ReadonlyMap<string, RiderState>;
  readonly timeline: readonly TickRecord[];
  readonly splits: readonly SplitEvent[];
  readonly attacks: readonly AttackEvent[];
  /** Max gap any PAG reached without materialising, for diagnostics. */
  readonly maxProvisionalGapSec: number;
  readonly totalKm: number;
  readonly clampHits: number;
  readonly finishGroupCount: number;
  /** Per-tick provisional gap trace of the FIRST PAG, for AF diagnostics. */
  readonly provisionalGaps: readonly { km: number; gapSec: number }[];
  /** Present only when auditEnergy was requested. */
  readonly energyAudit?: ReadonlyMap<string, EnergyAudit>;
  /** AF-01g: per-tick trace of the EP actually used by pace and by Struggle. */
  readonly epTrace: readonly {
    km: number; riderId: string; paceEP: number; struggleEP: number;
  }[];
  /** TC-01B: peak Struggle each rider ever reached. Final Struggle is 0 by
   * SP-01 (reset on materialisation), so only the peak is informative. */
  readonly peakStruggle: ReadonlyMap<string, number>;
  /** AF-01f: per-tick trace of each rider's live EffortWindow. */
  readonly windowTrace: readonly {
    km: number; riderId: string; burstLeft: number; recoveryLeft: number;
    contact: ContactState; groupId: number; modifier: number;
  }[];
}

function segmentAtKm(stage: StageTemplate, km: number): Segment {
  for (const seg of stage.segments) {
    if (km >= seg.startKm && km < seg.startKm + seg.lengthKm) return seg;
  }
  return stage.segments[stage.segments.length - 1];
}

/**
 * Effective Performance for one rider on one segment.
 *
 * Blocking rule 1: chase intensity and breakaway effort are NOT inputs.
 * SmallVariance intentionally omitted (EP-01, non-blocking) so the first
 * balance benchmarks are fully deterministic.
 */
export function effectivePerformance(
  rider: RiderSnapshot,
  state: RiderState,
  segment: Segment,
  effortMod = 0,
): number {
  return (
    baseSegmentSkill(rider.attributes, segment.terrain) *
    rider.condition *
    (1 + energyPenalty(state.energy)) *
    rider.setup *
    rider.weather *
    (1 + effortMod)
  );
}

export function simulateStage(params: {
  snapshot: StageSnapshot;
  stage: StageTemplate;
  initialGroups: readonly (readonly string[])[];
  /** Seconds each group starts behind the group in front of it. */
  initialGapSec?: number;
  balance: BalanceConfig;
  options: SimulationOptions;
  recordTimeline?: boolean;
}): SimulationResult {
  const {
    snapshot,
    stage,
    initialGroups,
    initialGapSec = 0,
    balance,
    options,
    recordTimeline = false,
  } = params;

  if (
    snapshot.balance !== undefined &&
    snapshot.balance.version !== balance.version
  ) {
    throw new Error(
      `balance version mismatch: snapshot was built with ` +
        `${snapshot.balance.version}, simulate called with ${balance.version}. ` +
        `Use replaySnapshot() to reproduce a historical stage.`,
    );
  }

  const rpPort = options.paceOnly
    ? CANONICAL_REQUIRED_PERFORMANCE
    : (options.requiredPerformance ?? UNSPECIFIED_REQUIRED_PERFORMANCE);

  if (!options.paceOnly && rpPort === UNSPECIFIED_REQUIRED_PERFORMANCE) {
    rpPort({} as never);
  }

  const ridersById = new Map<string, RiderSnapshot>();
  for (const r of snapshot.riders) ridersById.set(r.id, r);

  const state = new Map<string, RiderState>();
  initialGroups.forEach((ids, gi) => {
    for (const id of ids) {
      const snap = ridersById.get(id);
      if (!snap) throw new Error(`unknown rider ${id}`);
      state.set(id, {
        id,
        energy: snap.startEnergy,
        fatigue: 0,
        struggle: 0,
        groupId: gi,
        contact: ContactState.IN_GROUP,
        detachedGapSec: 0,
        finished: false,
        finishTimeSec: null,
        pagId: null,
        attackLaunched: false,
      });
    }
  });

  const groups: Group[] = initialGroups.map((ids, gi) => ({
    id: gi,
    riderIds: [...ids],
    posKm: 0,
    timeSec: gi * initialGapSec,
    active: ids.length > 0,
  }));
  let nextGroupId = groups.length;

  const totalKm = stage.segments.reduce((a, s) => a + s.lengthKm, 0);
  const timeline: TickRecord[] = [];
  const splits: SplitEvent[] = [];
  const provisionalGaps: { km: number; gapSec: number; pagId: number }[] = [];
  const epTrace: { km: number; riderId: string; paceEP: number; struggleEP: number }[] = [];
  const peakStruggle = new Map<string, number>();
  const windowTrace: {
    km: number; riderId: string; burstLeft: number; recoveryLeft: number;
    contact: ContactState; groupId: number; modifier: number;
  }[] = [];
  const attacks: AttackEvent[] = [];
  const pags: ProvisionalAttackGroup[] = [];
  const pending: PendingResponse[] = [];
  const windows = new Map<string, EffortWindow>();
  let nextPagId = 1;
  let maxProvisionalGapSec = 0;
  const charges = new Map<string, number>();
  const activeTicks = new Map<string, number>();
  const splitTickSize = new Map<string, number>();
  let clampHits = 0;

  const tick = balance.TICK_KM;
  const steps = Math.round(totalKm / tick);
  const freeze = options.freezeStruggleFor;

  for (let step = 0; step < steps; step++) {
    const km = step * tick;
    const segment = segmentAtKm(stage, km);
    const pRef = snapshot.pRef[segment.terrain];

    const active = groups.filter((g) => g.active && g.riderIds.length > 0);
    active.sort((a, b) => a.timeSec - b.timeSec);

    const results: PaceResult[] = [];
    const requiredByGroup = new Map<number, number>();
    const modeByGroup = new Map<number, WorkMode>();
    const sizeByGroup = new Map<number, number>();

    /**
     * Snapshot of every group's clock BEFORE any group advances this tick.
     *
     * Gaps and work modes MUST be evaluated against a single consistent
     * instant. Reading `group.timeSec` directly while iterating would mix
     * already-advanced groups with not-yet-advanced ones, understating the
     * gap seen by later groups by exactly one tick of travel time.
     */
    /**
     * Every rider active at the START of this tick, bound to the group they
     * actually rode it in. Energy is charged against THIS roster, so a rider
     * who materialises into a new group mid-tick is still charged exactly
     * once, using the pre-split group size, work mode and drafting context.
     */
    const activePags = pags.filter((p) => p.active && p.riderIds.length > 0);
    const tickRoster: {
      riderId: string;
      groupId: number;
      pagSize: number | null;
    }[] = [];
    const seenThisTick = new Set<string>();
    const enrol = (id: string, groupId: number, pagSize: number | null) => {
      if (seenThisTick.has(id)) {
        throw new Error(
          `rider ${id} appears in more than one active entity at km ${km}`,
        );
      }
      seenThisTick.add(id);
      tickRoster.push({ riderId: id, groupId, pagSize });
      if (options.auditEnergy) {
        activeTicks.set(id, (activeTicks.get(id) ?? 0) + 1);
      }
    };
    for (const g of active) for (const id of g.riderIds) enrol(id, g.id, null);
    for (const p of activePags)
      for (const id of p.riderIds) enrol(id, p.parentGroupId, p.riderIds.length);

    /** AF-01f: riders whose EffortWindow already advanced this interval. */
    const windowsAdvanced = new Set<string>();
    /**
     * AF-01g: each rider's Effective Performance for THIS interval, captured
     * BEFORE any EffortWindow is advanced. Pace, Struggle and the drop model
     * must all observe the same phase of the same window.
     */
    const tickEP = new Map<string, number>();
    /** AF-01g: each group's elapsed time for this interval. */
    const dtByGroup = new Map<number, number>();

    const preTickTime = new Map<number, number>();
    for (const g of active) preTickTime.set(g.id, g.timeSec);
    const preGap = (lead: Group, chase: Group): number =>
      preTickTime.get(chase.id)! - preTickTime.get(lead.id)!;

    for (let i = 0; i < active.length; i++) {
      const g = active[i];
      const ahead = i > 0 ? active[i - 1] : null;
      const behind = i < active.length - 1 ? active[i + 1] : null;

      const mode = resolveWorkMode({
        gapToGroupAheadSec: ahead ? preGap(ahead, g) : null,
        gapToGroupBehindSec: behind ? preGap(g, behind) : null,
        balance,
      });

      // Riders losing contact no longer set the group's pace.
      const attached = g.riderIds.filter(
        (id) => state.get(id)!.contact === ContactState.IN_GROUP,
      );
      const paceIds = attached.length > 0 ? attached : g.riderIds;

      // AF-01g: snapshot EP for EVERY rider attached to this group, including
      // riders in LOSING_CONTACT who are excluded from the pace set. This is
      // the single EP used by pace, Struggle and the drop model this interval.
      for (const id of g.riderIds) {
        if (tickEP.has(id)) continue;
        const snap = ridersById.get(id)!;
        const st = state.get(id)!;
        // AF-01f: an EffortWindow belongs to the RIDER. A real Group applies it
        // exactly as a PAG does, otherwise an attack's recovery tax vanishes
        // the moment the rider is caught or materialises.
        tickEP.set(
          id,
          effectivePerformance(snap, st, segment, effortModifier(windows.get(id) ?? null)),
        );
      }

      const members: PaceMember[] = paceIds.map((id) => {
        const snap = ridersById.get(id)!;
        return {
          id,
          ep: tickEP.get(id)!,
          breakawayEffort: snap.tactics.breakawayEffort,
          chaseIntensity: snap.tactics.chaseIntensity,
        };
      });

      const pace = computeGroupPace({
        members,
        mode,
        pRef,
        fieldSize: snapshot.fieldSize,
        referenceSpeedKmh: segment.referenceSpeedKmh,
        balance,
      });

      if (pace.clamped) clampHits++;
      results.push(pace);

      const required = rpPort({
        members,
        mode,
        terrain: segment.terrain,
        pRef,
        fieldSize: snapshot.fieldSize,
        pacePower: pace.pacePower,
        paceEP: pace.paceEP,
        workFactor: pace.workFactor,
        sizeFactor: pace.sizeFactor,
      });
      requiredByGroup.set(g.id, required);
      modeByGroup.set(g.id, mode);
      // Pre-split size: recorded before the Struggle pass can remove anyone.
      sizeByGroup.set(g.id, g.riderIds.length);

      const dtGroup = (3600 * tick) / pace.speedKmh;
      dtByGroup.set(g.id, dtGroup);
      g.timeSec += dtGroup;
      g.posKm += tick;

      // AF-01f: advance each active window exactly once per race interval,
      // using the elapsed time of the entity the rider actually rode in.
      if (!options.paceOnly) {
        for (const id of paceIds) {
          if (windowsAdvanced.has(id)) continue;
          const w = windows.get(id);
          if (!w) continue;
          advanceEffortWindow(w, dtGroup);
          windowsAdvanced.add(id);
          if (windowExhausted(w)) windows.delete(id);
        }
      }
    }

    const pagGapBefore = new Map<number, number>();
    /** AF-01d: riders whose Response began part way through THIS tick. */
    /** AF-01e: relative gap to the target at the ACTUAL Response start. */
    const responseStartRelGap = new Map<number, number>();
    const responseBlendedBurn = new Map<
      string,
      { parentWeight: number; pagWeight: number; parentGroupId: number }
    >();
    if (!options.paceOnly) {
      /* ================= AF-01: Provisional Attack Groups ================= */
      const parentSecPerKm = new Map<number, number>();
      active.forEach((g, i) => parentSecPerKm.set(g.id, results[i].secPerKm));

      // 1. advance existing PAGs
      for (const pag of activePags) {
        const parentSpk = parentSecPerKm.get(pag.parentGroupId);
        if (parentSpk === undefined) continue;
        const members: PaceMember[] = pag.riderIds.map((id) => {
          const snap = ridersById.get(id)!;
          const st = state.get(id)!;
          return {
            id,
            ep: (() => {
              if (!tickEP.has(id)) {
                tickEP.set(id, effectivePerformance(
                  snap, st, segment, effortModifier(windows.get(id) ?? null)));
              }
              return tickEP.get(id)!;
            })(),
            breakawayEffort: snap.tactics.breakawayEffort,
            chaseIntensity: snap.tactics.chaseIntensity,
          };
        });
        // Breakaway Effort is ACTIVE from formation: PAGs always ride ESCAPE.
        const pace = computeGroupPace({
          members, mode: PAG_MODE, pRef,
          fieldSize: snapshot.fieldSize,
          referenceSpeedKmh: segment.referenceSpeedKmh,
          balance,
        });
        if (pace.clamped) clampHits++;

        // AF-01d: nothing is deferred. A Response that begins mid-tick is
        // fully resolved in that tick, so every PAG reaching this pass rides
        // a whole tick at its own pace.
        const dtPagFull = (3600 * tick) / pace.speedKmh;
        const dtOwn = dtPagFull;

        const gapBefore = pag.gapSec;
        pag.timeSec += dtPagFull;
        pag.gapSec += (parentSpk - pace.secPerKm) * tick;
        pag.ticks++;
        pagGapBefore.set(pag.id, gapBefore);
        if (pag.id === 0 || provisionalGaps.length === 0 || provisionalGaps[0].pagId === pag.id) {
          provisionalGaps.push({ km: km + tick, gapSec: pag.gapSec, pagId: pag.id });
        }
        if (pag.gapSec > maxProvisionalGapSec) maxProvisionalGapSec = pag.gapSec;
        // Burst/recovery advance ONLY by the simulated time after the response
        // actually started, never by the whole tick.
        for (const id of pag.riderIds) {
          if (windowsAdvanced.has(id)) continue;
          const w = windows.get(id);
          if (w) {
            advanceEffortWindow(w, dtOwn);
            windowsAdvanced.add(id);
            if (windowExhausted(w)) windows.delete(id);
          }
        }
      }

      // 2. scheduled attack launches
      for (const g of active) {
        for (const id of [...g.riderIds]) {
          const snap = ridersById.get(id)!;
          const st = state.get(id)!;
          if (st.attackLaunched || snap.tactics.attackAtKm === undefined) continue;
          if (km + tick < snap.tactics.attackAtKm) continue;
          if (st.contact !== ContactState.IN_GROUP) continue;

          const kind = snap.tactics.attackKind ?? AttackKind.NORMAL;
          const profile = attackProfile(kind, balance);
          st.attackLaunched = true;
          st.energy = clampEnergy(st.energy - profile.energyCost);
          windows.set(id, newEffortWindow(profile, true, balance));

          const pag: ProvisionalAttackGroup = {
            id: nextPagId++, riderIds: [id], gapSec: 0,
            timeSec: g.timeSec, parentGroupId: g.id, active: true, ticks: 0,
          };
          pags.push(pag);
          g.riderIds = g.riderIds.filter((x) => x !== id);
          st.contact = ContactState.ATTACKING;
          st.pagId = pag.id;
          st.struggle = 0;
          attacks.push({ km: km + tick, riderId: id, kind: 'LAUNCH', gapSec: 0 });

          // everyone else in the group who has a Response declares it now
          for (const other of g.riderIds) {
            const os = ridersById.get(other)!;
            const ost = state.get(other)!;
            const rk = os.tactics.response ?? ResponseKind.NONE;
            if (rk === ResponseKind.NONE) continue;
            if (ost.contact !== ContactState.IN_GROUP) continue;
            if (pending.some((p) => p.riderId === other)) continue;
            pending.push({
              riderId: other, groupId: g.id, kind: rk,
              remainingDelaySec: reactionDelaySec(os.attributes.reaction, balance),
              targetPagId: pag.id,
              // AF-01e: the Attack launched at km + TICK_KM, i.e. AFTER the
              // parent had already completed this tick. The delay starts at
              // the launch instant, so it must not consume that past tick.
              startsNextTick: true,
            });
          }
        }
      }

      // 3. pending responses: count the delay down on the PARENT clock
      for (let i = pending.length - 1; i >= 0; i--) {
        const pr = pending[i];
        const g = groups.find((x) => x.id === pr.groupId);
        const st = state.get(pr.riderId);
        if (!g || !st || !g.riderIds.includes(pr.riderId)) { pending.splice(i, 1); continue; }
        const parentSpk = parentSecPerKm.get(g.id);
        if (parentSpk === undefined) continue;
        const dtParent = parentSpk * tick;

        // AF-01e: a Response created by an Attack that launched at the END of
        // this tick does not consume it. Reaction 200 therefore begins exactly
        // at the launch boundary and its movement belongs to the NEXT interval,
        // never retroactively to the interval before the Attack existed.
        if (pr.startsNextTick) {
          pr.startsNextTick = false;
          continue;
        }

        // AF-01c: the delay may expire PART WAY through this tick.
        if (pr.remainingDelaySec >= dtParent) {
          pr.remainingDelaySec -= dtParent;
          continue;
        }
        const activeFraction = responseActiveFraction(pr.remainingDelaySec, dtParent);
        const startOffsetSec = pr.remainingDelaySec;

        // ONE Response action -> ONE response burst. No auto-refire.
        pending.splice(i, 1);
        const profile = responseProfile(pr.kind, balance);
        // Fixed cost charged exactly once, at the logical Response start.
        st.energy = clampEnergy(st.energy - profile.energyCost);
        const win = newEffortWindow(profile, false, balance);
        windows.set(pr.riderId, win);

        // AF-01d: the waiting fraction AND the Response fraction are consumed
        // inside THIS tick. Nothing is deferred to the next one.
        const respMembers: PaceMember[] = [{
          id: pr.riderId,
          ep: effectivePerformance(
            ridersById.get(pr.riderId)!, st, segment, effortModifier(win),
          ),
          breakawayEffort: ridersById.get(pr.riderId)!.tactics.breakawayEffort,
          chaseIntensity: ridersById.get(pr.riderId)!.tactics.chaseIntensity,
        }];
        const respPace = computeGroupPace({
          members: respMembers, mode: PAG_MODE, pRef,
          fieldSize: snapshot.fieldSize,
          referenceSpeedKmh: segment.referenceSpeedKmh,
          balance,
        });
        if (respPace.clamped) clampHits++;

        const f = activeFraction;
        const dtPagFull = (3600 * tick) / respPace.speedKmh;
        const dtRider = (1 - f) * dtParent + f * dtPagFull;
        const gapEnd = f * (parentSpk - respPace.secPerKm) * tick;

        // Effort window advances ONLY by the Response-active simulated time.
        advanceEffortWindow(win, f * dtPagFull);
        windowsAdvanced.add(pr.riderId);
        if (windowExhausted(win)) windows.delete(pr.riderId);

        // Fractionally blended Energy for this tick, plus the fixed charge above.
        responseBlendedBurn.set(pr.riderId, {
          parentWeight: 1 - f,
          pagWeight: f,
          parentGroupId: g.id,
        });

        const targetPag = pags.find((x) => x.id === pr.targetPagId);
        const pag: ProvisionalAttackGroup = {
          id: nextPagId++, riderIds: [pr.riderId], gapSec: gapEnd,
          // The parent clock has already advanced this tick, so the PAG's own
          // clock is the parent's minus the gap it just opened. dtRider is the
          // rider's own elapsed time for the tick and is equal to
          // (parentTime + dtParent) - gapEnd by construction.
          timeSec: g.timeSec - gapEnd,
          parentGroupId: g.id, active: true, ticks: 1,
          targetPagId: pr.targetPagId,
        };
        void dtRider;
        pagGapBefore.set(pag.id, 0);
        // AF-01e: judge interception from the target's gap INTERPOLATED to the
        // instant the Response actually began, not its gap at tick start.
        if (targetPag) {
          const tBefore = pagGapBefore.get(targetPag.id) ?? targetPag.gapSec;
          responseStartRelGap.set(
            pag.id,
            interpolateTargetGap(tBefore, targetPag.gapSec, startOffsetSec, dtParent),
          );
        }
        if (gapEnd > maxProvisionalGapSec) maxProvisionalGapSec = gapEnd;
        pags.push(pag);
        g.riderIds = g.riderIds.filter((x) => x !== pr.riderId);
        st.contact = ContactState.ATTACKING;
        st.pagId = pag.id;
        st.struggle = 0;
        // AF-01d: the gap of the SPECIFIC PAG being answered, not the max of
        // any PAG against this parent. AF-01e: reported at the ACTUAL start.
        const targetGap = targetPag && targetPag.active
          ? (responseStartRelGap.get(pag.id) ?? targetPag.gapSec)
          : 0;
        attacks.push({
          km: km + tick, riderId: pr.riderId, kind: 'RESPOND',
          gapSec: targetGap, startFraction: activeFraction,
          startOffsetSec, responderGapSec: gapEnd,
        });
      }

      // 3b. AF-01c response-target interception.
      //
      // A Response targets a specific PAG. Treat the relative gap as a
      // CONTINUOUS interval across the tick: if it intersects the merge band
      // at any point, the responder reached the target and latches. Crossing
      // from behind to ahead in one tick therefore counts as a latch, not an
      // overshoot. Under a Response action an overpowered responder does NOT
      // become a counterattacker; passing needs a later explicit Attack.
      for (const rp of pags) {
        if (!rp.active || rp.targetPagId === undefined) continue;
        const target = pags.find((x) => x.id === rp.targetPagId);
        if (!target || !target.active) { rp.targetPagId = undefined; continue; }
        if (target.parentGroupId !== rp.parentGroupId) continue;

        // AF-01e: for a Response that began mid-tick, the interval starts at
        // the interpolated target gap at the ACTUAL response start, with the
        // responder at parent-relative gap 0. For every later tick it is the
        // ordinary tick-start comparison.
        const startRel = responseStartRelGap.get(rp.id);
        const rBefore = pagGapBefore.get(rp.id) ?? rp.gapSec;
        const tBefore = pagGapBefore.get(target.id) ?? target.gapSec;
        const relStart = startRel ?? (tBefore - rBefore);
        const relEnd = target.gapSec - rp.gapSec;

        if (interceptsTarget(relStart, relEnd, balance)) {
          target.riderIds = [...target.riderIds, ...rp.riderIds];
          // Latch, never overshoot: the merged PAG keeps the TARGET's gap.
          for (const id of rp.riderIds) state.get(id)!.pagId = target.id;
          attacks.push({
            km: km + tick, riderId: rp.riderIds[0], kind: 'PAG_MERGE',
            gapSec: target.gapSec,
          });
          rp.riderIds = []; rp.active = false; rp.targetPagId = undefined;
        }
      }

      // 4. PAG-to-PAG merge for INDEPENDENT attacks (unchanged 2 s threshold)
      const live = pags.filter((p) => p.active && p.riderIds.length > 0)
        .sort((a, b) => b.gapSec - a.gapSec);
      for (let i = 0; i < live.length - 1; i++) {
        const a = live[i], b = live[i + 1];
        if (!a.active || !b.active) continue;
        if (a.parentGroupId !== b.parentGroupId) continue;
        if (a.targetPagId !== undefined || b.targetPagId !== undefined) continue;
        if (pagsShouldMerge(a, b, balance)) {
          a.riderIds = [...a.riderIds, ...b.riderIds];
          a.gapSec = Math.max(a.gapSec, b.gapSec);
          for (const id of b.riderIds) state.get(id)!.pagId = a.id;
          b.riderIds = []; b.active = false;
          attacks.push({ km: km + tick, riderId: a.riderIds[0], kind: 'PAG_MERGE', gapSec: a.gapSec });
        }
      }

      // 5. materialise at 16 s, reabsorb at gap <= 0 (NOT <= 2 s)
      for (const pag of pags) {
        if (!pag.active || pag.riderIds.length === 0) continue;
        const parent = groups.find((x) => x.id === pag.parentGroupId);
        if (!parent) continue;

        if (pagShouldMaterialise(pag, balance)) {
          const ng: Group = {
            id: nextGroupId++, riderIds: [...pag.riderIds],
            posKm: parent.posKm, timeSec: parent.timeSec - pag.gapSec, active: true,
          };
          groups.push(ng);
          for (const id of pag.riderIds) {
            const st = state.get(id)!;
            st.groupId = ng.id; st.pagId = null;
            st.contact = ContactState.IN_GROUP;
            st.struggle = 0;               // SP-01, mirrored
            st.detachedGapSec = 0;
            // AF-01f: the window survives materialisation. It expires only when
            // its own simulated duration reaches zero.
          }
          attacks.push({ km: km + tick, riderId: pag.riderIds[0], kind: 'MATERIALISE', gapSec: pag.gapSec });
          pag.riderIds = []; pag.active = false;
          continue;
        }

        if (pagIsReabsorbed(pag)) {
          for (const id of pag.riderIds) {
            const st = state.get(id)!;
            st.groupId = parent.id; st.pagId = null;
            st.contact = ContactState.IN_GROUP;
            st.struggle = 0;
            if (!parent.riderIds.includes(id)) parent.riderIds.push(id);
            // AF-01f: the window survives reabsorption too, so a caught
            // attacker keeps paying his recovery tax inside the peloton.
          }
          attacks.push({ km: km + tick, riderId: pag.riderIds[0], kind: 'REABSORB', gapSec: pag.gapSec });
          pag.riderIds = []; pag.active = false;
        }
      }

      /* ---- Struggle driver, drop initiation, 16 s handover ---- */
      for (const g of active) {
        const required = requiredByGroup.get(g.id)!;
        for (const id of [...g.riderIds]) {
          const st = state.get(id)!;
          if (freeze?.has(id)) continue;

          const snap = ridersById.get(id)!;
          // AF-01g: the SAME EP the pace pass used, captured before the window
          // advanced. Attack burst and recovery tax are individual EP modifiers
          // and must move the deficit against RequiredPerformance too.
          const ep = tickEP.get(id) ?? effectivePerformance(
            snap, st, segment, effortModifier(windows.get(id) ?? null));
          const d = calcDeficit(required, ep);
          if (recordTimeline) {
            epTrace.push({
              km: km + tick, riderId: id,
              paceEP: tickEP.get(id) ?? NaN, struggleEP: ep,
            });
          }

          if (st.contact === ContactState.ATTACKING) continue;
          if (st.contact === ContactState.IN_GROUP) {
            st.struggle += struggleDeltaPerKm(ep, required) * tick;
            if (st.struggle < 0) st.struggle = 0;
            if (st.struggle > (peakStruggle.get(id) ?? 0)) {
              peakStruggle.set(id, st.struggle);
            }
            if (st.struggle >= balance.STRUGGLE_SPLIT) {
              st.contact = ContactState.LOSING_CONTACT;
              st.detachedGapSec = 0;
            }
          } else if (st.contact === ContactState.LOSING_CONTACT) {
            // Drop model ONLY. Group Pace does not apply to this rider.
            const dropDelta = dropLossSecPerKm(d, balance) * tick;
            st.detachedGapSec += dropDelta;

            // AF-01g: a LOSING_CONTACT rider is excluded from paceIds, so his
            // window would otherwise freeze. His own elapsed time for the
            // interval is the group's plus the seconds the drop model just
            // added. The guard keeps this to exactly one advance.
            if (!windowsAdvanced.has(id)) {
              const w = windows.get(id);
              if (w) {
                advanceEffortWindow(w, (dtByGroup.get(g.id) ?? 0) + dropDelta);
                windowsAdvanced.add(id);
                if (windowExhausted(w)) windows.delete(id);
              }
            }

            if (st.detachedGapSec >= balance.GAP_SEPARATE_MIN) {
              const newGroup: Group = {
                id: nextGroupId++,
                riderIds: [id],
                posKm: g.posKm,
                timeSec: g.timeSec + st.detachedGapSec,
                active: true,
              };
              groups.push(newGroup);
              g.riderIds = g.riderIds.filter((x) => x !== id);

              splits.push({
                km: km + tick,
                riderId: id,
                fromGroupId: g.id,
                toGroupId: newGroup.id,
              });
              if (options.auditEnergy && !splitTickSize.has(id)) {
                splitTickSize.set(id, sizeByGroup.get(g.id) ?? g.riderIds.length);
              }

              st.groupId = newGroup.id;
              st.detachedGapSec = 0;
              // SP-01: re-attached to a new group with a different Required.
              // Struggle accumulated against the OLD threshold no longer
              // applies. Without this the state machine cannot terminate.
              st.struggle = 0;
              st.contact = ContactState.IN_GROUP;
            }
          }
        }
        if (g.riderIds.length === 0) g.active = false;
      }
    }

    if (!options.paceOnly) {
      /* ---- EN-01 Energy burn, applied AFTER the tick is resolved ----
       *
       * Charged against tickRoster, so every rider active at the start of the
       * tick is charged exactly once, in the group context they actually rode
       * — including riders who materialised into a new group this tick and are
       * therefore no longer in their original group's rider list.
       */
      for (const { riderId, groupId, pagSize } of tickRoster) {
        const st = state.get(riderId);
        if (!st) continue;
        const snap = ridersById.get(riderId)!;
        const common = {
          tickKm: tick,
          terrain: segment.terrain,
          breakawayEffort: snap.tactics.breakawayEffort,
          chaseIntensity: snap.tactics.chaseIntensity,
          stageApproach: snap.tactics.stageApproach,
          weatherEnergyMultiplier: segment.weatherEnergyMultiplier,
        };

        // AF-01d: a Response that began mid-tick rode part of the tick in the
        // parent and part in its own PAG, so its burn is blended by the same
        // fraction that drove its movement.
        const blend = responseBlendedBurn.get(riderId);
        let burn: number;
        if (blend) {
          const parentBurn = energyBurnForTick({
            ...common,
            groupSize: sizeByGroup.get(blend.parentGroupId) ?? 1,
            mode: modeByGroup.get(blend.parentGroupId) ?? WorkMode.NEUTRAL,
          });
          const pagBurn = energyBurnForTick({
            ...common, groupSize: 1, mode: PAG_MODE,
          });
          burn = blend.parentWeight * parentBurn + blend.pagWeight * pagBurn;
        } else {
          burn = energyBurnForTick({
            ...common,
            groupSize: pagSize ?? sizeByGroup.get(groupId) ?? 1,
            mode: pagSize === null
              ? (modeByGroup.get(groupId) ?? WorkMode.NEUTRAL)
              : PAG_MODE,
          });
        }
        st.energy = clampEnergy(st.energy - burn);
        if (options.auditEnergy) {
          charges.set(riderId, (charges.get(riderId) ?? 0) + 1);
        }
      }
    }

    if (!options.paceOnly && recordTimeline) {
      for (const [rid, w] of windows) {
        const st = state.get(rid);
        if (!st) continue;
        windowTrace.push({
          km: km + tick, riderId: rid,
          burstLeft: w.burstRemainingSec, recoveryLeft: w.recoveryRemainingSec,
          contact: st.contact, groupId: st.groupId,
          modifier: effortModifier(w),
        });
      }
    }

    /* ---- Merge ---- */
    const live = groups
      .filter((x) => x.active && x.riderIds.length > 0)
      .sort((a, b) => a.timeSec - b.timeSec);
    for (let i = live.length - 1; i > 0; i--) {
      const lead = live[i - 1];
      const chase = live[i];
      if (!lead.active || !chase.active) continue;
      if (Math.abs(gapSec(lead, chase)) <= balance.GAP_MERGE_MAX) {
        mergeGroups(lead, chase);
        for (const id of lead.riderIds) {
          const st = state.get(id);
          if (st) st.groupId = lead.id;
        }
      }
    }

    if (recordTimeline) {
      const shown = groups
        .filter((x) => x.active && x.riderIds.length > 0)
        .sort((a, b) => a.timeSec - b.timeSec);
      const gaps: number[] = [];
      for (let i = 1; i < shown.length; i++) {
        gaps.push(gapSec(shown[i - 1], shown[i]));
      }
      timeline.push({
        km: km + tick,
        groups: shown.map((g) => {
          const idx = active.indexOf(g);
          const r = idx >= 0 ? results[idx] : null;
          return {
            id: g.id,
            size: g.riderIds.length,
            riderIds: [...g.riderIds],
            mode: r?.mode ?? WorkMode.NEUTRAL,
            timeSec: g.timeSec,
            speedKmh: r?.speedKmh ?? 0,
            secPerKm: r?.secPerKm ?? 0,
            pacePower: r?.pacePower ?? 0,
            paceEP: r?.paceEP ?? 0,
            requiredPerformance: requiredByGroup.get(g.id) ?? 0,
            workerCount: r?.workerCount ?? 0,
            clamped: r?.clamped ?? false,
          };
        }),
        gapsSec: gaps,
      });
    }
  }

  let finishGroupCount = 0;
  for (const g of groups) {
    if (g.riderIds.length === 0) continue;
    finishGroupCount++;
    for (const id of g.riderIds) {
      const st = state.get(id);
      if (st) {
        st.finished = true;
        st.finishTimeSec = g.timeSec + st.detachedGapSec;
      }
    }
  }

  const energyAudit = options.auditEnergy
    ? new Map(
        [...state.keys()].map((id) => [
          id,
          {
            charges: charges.get(id) ?? 0,
            activeTicks: activeTicks.get(id) ?? 0,
            splitTickGroupSize: splitTickSize.get(id) ?? null,
          },
        ]),
      )
    : undefined;

  return {
    snapshot,
    groups,
    riders: state,
    timeline,
    splits,
    attacks,
    maxProvisionalGapSec,
    totalKm,
    clampHits,
    finishGroupCount,
    provisionalGaps,
    peakStruggle,
    epTrace,
    windowTrace,
    energyAudit,
  };
}

/**
 * Replay a historical stage snapshot using the exact balance values it was
 * built with, regardless of what the current BALANCE_V1 says.
 */
export function replaySnapshot(params: {
  snapshot: StageSnapshot;
  stage: StageTemplate;
  initialGroups: readonly (readonly string[])[];
  initialGapSec?: number;
  options: SimulationOptions;
  recordTimeline?: boolean;
}): SimulationResult {
  return simulateStage({ ...params, balance: params.snapshot.balance });
}
