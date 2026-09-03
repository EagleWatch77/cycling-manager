# Design gaps and decisions

Current working models first. Superseded decisions are in section HISTORY at
the end and are NOT the current rule.

## Current RequiredPerformance model — HoldingFactor

    HoldingFactor(K, n)     = 1 - K * (1 - DraftEnergyMultiplier(n))
    RequiredPerformance(G)  = PaceEP(G) * HoldingFactor(K, |G|)

`WorkFactor`, `ChaseWork`, `EscapeWork`, `SizeFactor` and the descent speed
modifier are excluded from RequiredPerformance. They affect group speed and/or
Energy, never the Struggle threshold.

`HOLDING_K = 0.40` is **RATIFIED for V1** (TC-01E). Implemented as
`experimentalHoldingThreshold(k)` in `src/core/struggle.ts`; the parameterised
form is kept so a later integrated benchmark can re-test it, not because it is
open. Guarded by TC01E-1 and TC01E-2.

Do not sweep or tune it again unless a later integrated race benchmark exposes a
regression.

## Struggle dead zone — CANONICAL

    0 <= deficit   < 1 EP  ->  0 Struggle gain
    0 <= advantage < 1 EP  ->  0 Struggle recovery

Spec bands start at exactly 1 EP. `STRUGGLE_DEAD_ZONE_EP = 1`. Tests T56-T58.

## SP-01 — RATIFIED

When a rider materialises into a separate group entity at the 16 s handover,
`struggle` resets to 0. Applied only on materialisation after a split, never on
merge. Without it the approved state machine cannot terminate: a solo rider has
deficit 0, so `dropLossSecPerKm(0) = 0`, `detachedGapSec` never grows, and he is
pinned in LOSING_CONTACT with Group Pace never applying to him.

## EN-01 — Energy consumption, working V1 model

    energyBurn = tickKm
               * BASE_ROAD_ENERGY_PER_KM (0.2125)
               * draftingEnergyMultiplier(groupSize)
               * stageApproachEnergyMultiplier
               * workEnergyMultiplier
               * terrainEnergyMultiplier
               * weatherEnergyMultiplier

Terrain: FLAT/HILLY/MOUNTAIN/CLASSICS = 1.00, DESCENT = 0.35. Burn applied after
the tick is resolved; Energy at tick start drives Effective Performance. Clamped
to [0, 100]. Charged against `tickRoster`, so every rider active at tick start is
charged exactly once in pre-split context (tests T63-T68).

Calibration verified: Safe 23.1, Normal 27.2, Aggressive 32.6, All-out 38.1,
5-rider break at Hard 36.9, Medium chase worker 29.9.

### Still open inside EN-01

- Weather Energy multiplier: spec gives only "+3-5 %", no table. Injected
  per-segment input, defaults to 1.00.
- Gradient-dependent terrain multipliers not specified. HILLY, MOUNTAIN and
  CLASSICS burn at the FLAT rate, which is certainly wrong but is not invented.
- Stage approach performance column recorded but NOT wired into Effective
  Performance. Wiring it would move PaceEP and every balance number.
- Fatigue is never generated. `fatigueMult` recorded, unused.

## AF-01 — implemented; ratified items

- Breakaway Effort active from PAG formation (A13).
- PAG reabsorbed at `gapSec <= 0`, never at 2 s. The 2 s threshold stays correct
  for PAG-to-PAG and Group-to-Group merging (A05, A05b, A05c).
- Response: Normal +3 % / -2 Energy, High +5 % / -4 Energy, no recovery tax.
  Working values, provisional until AF4.
- **AF7 RATIFIED:** a normal solo rider generally cannot bridge from a competent
  actively chasing peloton to an established breakaway.
- All attack/response numbers live in the versioned `BalanceConfig`, and the full
  frozen config travels inside each `StageSnapshot`, so historical stages stay
  reproducible. `replaySnapshot()` uses the embedded config.

### AF-01g — tick EP consistency, implemented. AF-01 CLOSED.

A per-interval `tickEP` map is filled BEFORE any EffortWindow is advanced and
reused by Group Pace membership EP, Struggle and the drop-model deficit, so pace
and Struggle never observe different phases of the same window. Riders in
`LOSING_CONTACT` advance their window by `dtGroup + dropGapIncreaseThisTick`,
guarded to exactly one advance per interval. Tests A39-A44.

Reachability note: with the accepted values a window lasts 135 s (1.575 km) while
Struggle 100 needs 2.50 km even at the maximum +40/km, so a rider starting from
Struggle 0 cannot be LOSING_CONTACT with a live window. A41/A42 are invariant
guards rather than demonstrated regression catches.

### AF-01f — rider EffortWindow persistence, implemented.

An EffortWindow belongs to the RIDER, not the PAG. It is no longer deleted on
materialisation or reabsorption and expires only when its own simulated duration
reaches zero. Real Group `EffectivePerformance` applies the modifier exactly as
PAG EP does, so a caught attacker keeps paying his recovery tax inside the
peloton. A per-interval guard set advances each window exactly once, by the
elapsed time of the entity the rider actually rode in. Tests A32-A38.

**Accepted working V1 values:** Reaction, `GAP_MERGE_MAX`, Response costs,
Normal Attack and All-out Attack are accepted as-is. All-out has a valid
tactical niche: it breaks responses Normal cannot, at higher Energy cost and a
heavier recovery tax.

**The 60 % latch figure is NOT a player-facing probability.** It is the fraction
of deterministic benchmark cells across EP and Response configurations. The
engine has no RNG in this path; `SmallVariance` is zero.

### AF-01e — launch causality and interception start, implemented

A `PendingResponse` created by an Attack that launched at `km + TICK_KM` no
longer consumes that already-completed tick (`startsNextTick`). Interception is
judged from the target's gap INTERPOLATED to the actual Response-start instant,
`targetGapBefore + (startOffsetSec/dtParent) * (targetGapAfter - targetGapBefore)`,
with the responder at parent-relative gap 0. Tests A25-A31.

**This changed both AF conclusions.** Latch rate is now graded by Reaction
(60 % at Rx 0-40 rising to 100 % at Rx 120+), and all-out attack has a real
niche: at Rx 80 normal is latched 100 % but all-out only 60 %, and all-out
materialises 24/30 vs 22/30. The previous "Reaction inert" and "all-out
dominated" findings were artefacts of judging interception against a gap the
target had already left.

### AF-01d — same-tick Response transition, implemented

A Response whose delay expires inside a tick is now fully resolved in THAT
tick: the PAG is created already at its end-of-tick gap, the effort window
advances by `f * dtPagFull` only, Energy is blended
`(1-f) * parentContext + f * pagContext` plus the fixed charge once, and
`startFraction` no longer exists. `RESPOND.gapSec` reports the specific
`targetPagId` gap. Parent pace still uses the tick-start roster for the whole
tick (allowed V1 approximation). Tests A20-A24.

### AF-01c — sub-tick Reaction, implemented

A pending Response may begin fractionally inside a 0.2 km tick:
`activeFraction = clamp((dtParent - remainingDelaySec) / dtParent, 0, 1)`.
The rider stays with the parent for `(1 - f)` of the tick and rides Response
pace for `f`; the effort window advances only by `f * dtPag`. Fixed Response
Energy is charged once at start. No new balance constant; `TICK_KM` and
`REACTION_MAX_DELAY_SEC` unchanged.

Response-target interception: the relative gap to the target PAG is treated as
a continuous interval across the tick and latches if it intersects
`[-GAP_MERGE_MAX, +GAP_MERGE_MAX]`. Crossing the target inside one tick is a
latch, not an overshoot, and the merged PAG keeps the target's gap so an
overpowered responder does not become a counterattacker. Tests A15-A19.

### AF-01 accepted values

Reaction, Response, Normal Attack and All-out Attack are **ACCEPTED working V1
values**. Nothing in AF-01 is open. Not to be revisited unless a later
integrated benchmark exposes a regression.

The only carry-over is not an AF-01 defect: **no Struggle inside a PAG** remains
a provisional V1 simplification. AF9 showed the 2 s PAG-to-PAG merge window
already filters weak followers, so the risk is lower than feared, but a rider
who weakens *after* joining a PAG is still unmodelled.

## FIN-01 — stage time cut / OTL / grupetto — DEFERRED, non-blocking

Not a physics problem. `GROUP_SPEED_MIN = 0.60 * v_ref` already bounds group
speed and TC-01B recorded zero clamp hits, so nothing is mathematically
unbounded. The 111-minute TC-01B figure came from a stress fixture: a +/-40 swing
on a 52 %-weighted MOUNTAIN attribute accumulated over 160 km of continuous
mountain. At 40 km the same fixture gives 23:32 and a realistic mixed stage gives
0:00.

Deferred until realistic mixed stages and the 5-stage Tour benchmark. If a time
cut is added later it is a **post-stage result rule**, not a cap on group time
loss. Do not add a grupetto mechanic or change the speed clamp for it.

**Scope extended (TC-01E):** tail-gap evaluation belongs here too. The 23-minute
maximum tail gap seen on the synthetic mountain-finish fixture is not a
Holding-K problem and must be judged on realistic Tour stages and rider
distributions, with race pressure applied.

## TC-01 Holding calibration — CLOSED. K = 0.40 RATIFIED.

### Correction to the earlier acceptance framing

My criterion that a no-attack / no-chase mountain-finish fixture must produce
Top10 GC gaps **was wrong**. Under the Group Time model riders attached to the
same group correctly receive the same time, and a stronger GC rider should not
gain seconds automatically without higher pace, work or an attack. A neutral
group is supposed to finish together.

The 23-minute maximum **tail** gap is therefore **not a Holding-K blocker**. It
is deferred to FIN-01 and must be evaluated on realistic Tour stages and
distributions, not on a synthetic neutral fixture.

Future mountain-GC validation must include actual race pressure — Stage Approach
work, Attack and Response — rather than requiring a neutral group to split
spontaneously.

### Ratification evidence (K = 0.40, same-league field)

- FLAT: 34 of 35 remain in the main group
- HILLY: moderate additional selection
- MOUNTAIN: clearly stronger selection
- terrain and archetype ordering correct on every terrain
- lowering K worsens FLAT and HILLY without solving the tail-gap issue

**Do not add an artificial front-group splitting mechanism.**

## TC-01E — same-league K sweep data, see TC01E_REPORT.md

Same-league field: 7 archetype shapes x quality {-5, -2.5, 0, +2.5, +5}. The
+/-12 field is retired to inter-league / stress territory; a separate +/-8 stress
fixture is reference only.

At **K = 0.40**, three of four acceptance criteria pass cleanly: FLAT stays
together (1 split, 34/35), HILLY gives moderate selection (3 splits, 32/35),
MOUNTAIN gives clear selection (6 splits, 29/35), with correct shape ordering on
every terrain.

The fourth fails: the mixed mountain finish gives a **23:16 max gap**, and it is
**insensitive to K** (23:36 / 23:53 / 23:16 at 0.350 / 0.375 / 0.400).

Cause is structural, not K: **Top10 spread is 0:00 in all twelve cells** — the
leading group never fragments internally. Selection happens only by shedding off
the back, so a mountain finish gives zero separation among leaders and a long
tail. K = 0.40 is the recommended value (highest K with useful mountain
selection) but stays **PROVISIONAL**; the open item is that nothing splits the
front group.

## TC-01D — K sweep with quality spread, see TC01D_REPORT.md

Swept K = 0.30 / 0.325 / 0.35 / 0.375 / 0.40 over 5 fixtures with 7 archetype
shapes x benchmark-only quality offsets {-12,-6,0,+6,+12}. Nothing tuned.

Terrain ordering is correct at every K (FLAT < HILLY < MOUNTAIN splits, correct
shape ordering per terrain). **But no K in the range meets the goals**: FLAT
fragments at every K, mountain-finish max gaps run 62-74 min, and the flat-finish
mixed stage produces 31-48 splits.

Cause: `tolerance = mean * K * 0.20 + 1` is 8.8-11.4 EP across the sweep, while
the quality axis alone puts a -12 rider 12 EP below the mean by construction.
Holding a pure -12 quality rider needs **K >= 0.423**; holding -12 quality plus
the worst MOUNTAIN shape needs **K >= 0.862**, which would remove all selection.

The sweep does not answer "which K" — it says the benchmark field is
over-dispersed for any K. The open question is the intended intra-league
overall-quality spread, not K.

## TC-01C — CLASSICS candidate, see TC01C_REPORT.md

CLASSICS replaced with a CANDIDATE table (hills 25, endurance 20, flat 15,
acceleration 10, positioning 10, roughSurface 10, packRiding 5, bikeHandling 5).
Climbing deliberately excluded. New `roughSurface` attribute affects CLASSICS
only. Not frozen. MOUNTAIN and DESCENT verified unchanged.

The candidate works: the Classics specialist is now top on CLASSICS and spread
below mean rose from 2.00 to 4.24 EP. Ordering is correct on every terrain.

**But the corrected benchmark exposes the opposite problem from TC-01B.** Under
realistic multi-attribute profiles at K = 0.40 a realistic mixed 160 km stage
produces **zero splits, one group, all archetypes on the same time**. Tolerance
(10.9-11.7 EP) sits at or above the spread realistic riders produce (3.4-11.4
EP), so nothing is selected. HILLY misses splitting by 0.06 EP.

SP-02 calibrated K against synthetic uniform sigma fields, where a weak rider was
weak on every axis. Realistic profiles are compensated, so the effective spread
is much smaller. **K = 0.40 was calibrated against the wrong shape of field.**
Nothing changed; re-deriving K against realistic profiles is a balance decision.

## TC-01 — first diagnostics, see TC01_REPORT.md

TC-01A passes: weight arithmetic is exactly correct on all five terrains.
TC-01B found that the split threshold matches SP-02's closed form in every cell,
so neither the weights nor K is malfunctioning. Three real findings:

1. **CLASSICS contains neither `flat` nor `climbing`**, so it cannot
   differentiate the two most common specialisations at all (spread 2.0 EP even
   at a ±40 attribute swing). Weight-table question.
2. **HILLY is the most forgiving road terrain** (spread 6.88 EP at ±40) and
   produces no selection under K = 0.40.
3. **Post-split time loss is unbounded**: 39 min on FLAT, 111 min on MOUNTAIN in
   one 160 km stage. No grupetto, time limit or autobus mechanic exists. Spec
   §20 expects a badly managed rider to usually finish a 5-stage Tour. This is
   not a terrain issue and should probably be decided before any weight is
   tuned.

Nothing changed. Terrain-boundary invariants all pass: group time and gaps stay
continuous, Energy and Struggle do not reset, and `P_ref[terrain]` is
bit-identical to an isolated single-terrain snapshot.

## TC-01 — weight tables, original note

FLAT / HILLY / CLASSICS `BaseSegmentSkill` weights are unvalidated placeholders
(`frozen: false`). Spec §05 leaves them as tuning constants. MOUNTAIN and DESCENT
are frozen. No balance conclusion may be drawn from a benchmark running on the
three placeholder terrains.

## EP-01 — open, non-blocking

`SmallVariance` has no per-segment amplitude in the spec. Currently omitted
entirely so balance benchmarks are fully deterministic.

## EP-02 — note only

`Condition` composite is not decomposed in the spec. Sidestepped: it is a scalar
input to the race engine, computed outside this package.

---

# HISTORY — superseded decisions

These are NOT current. Recorded so the reasoning is not lost.

## RP-01 (first form) — SUPERSEDED

`RequiredPerformance(G) = PaceEP(G)` was ratified, implemented, and then
**empirically falsified** by benchmark SP-02. Because PaceEP is a central
tendency, roughly half of any group sat below its own threshold permanently, and
the fixed point of the rule was a field of singleton groups: a 40-rider field
whose strongest and weakest riders differed by 2 EP points shattered into 22
groups. Replaced by the HoldingFactor model above.

`CANONICAL_REQUIRED_PERFORMANCE` remains exported for regression tests only.

## Pre/post-tick work-mode defect — FIXED

Group clocks were advanced inside each group's own loop iteration, so later
groups read already-advanced clocks and saw gaps understated by one tick. The
16 s threshold behaved as ~32.6 s, producing a CHASE/NEUTRAL limit cycle that
parked every race at a 31-33 s gap. Fixed with a `preTickTime` snapshot; test
T62. All benchmark numbers produced before that fix are invalid.

## Energy split-tick defect — FIXED

`sizeByGroup` was declared but never populated, and riders materialising
mid-tick were charged no Energy at all for that tick. Fixed with `tickRoster`;
tests T63-T68.

