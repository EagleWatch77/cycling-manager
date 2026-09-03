# TC-01 — Terrain Skill Validation, diagnostics

**No weight and no constant changed.** MOUNTAIN and DESCENT untouched,
`HOLDING_K = 0.40` still PROVISIONAL, weather / Fatigue / SmallVariance /
gradient Energy / Stage Approach performance all still out of scope.

Tests: **134 / 134 passing.** `tsc --noEmit` clean.

Documentation cleanup done: the stale `AF-01 open` section is rewritten as
`AF-01 accepted values`, and the README test count is corrected to 128 (now 134
after TC-01A).

---

## 1. TC-01A — the weight tables as they actually are in source

Every table stores percentages summing to **100**; `baseSegmentSkill` divides by
100, so the effective weights sum to exactly **1**.

| terrain | status | weights |
|---|---|---|
| **MOUNTAIN** | **FROZEN** — spec §05 canonical v1 | climbing 52, endurance 20, energyManagement 10, acceleration 8, positioning 5, experience 5 |
| **DESCENT** | **FROZEN** — terrain enum freeze | descending 60, bikeHandling 25, cornering 15 |
| FLAT | PLACEHOLDER | flat 40, endurance 22, energyManagement 12, positioning 10, packRiding 8, experience 8 |
| HILLY | PLACEHOLDER | hills 38, endurance 20, climbing 12, acceleration 10, energyManagement 10, positioning 5, experience 5 |
| CLASSICS | PLACEHOLDER | hills 25, endurance 22, packRiding 12, positioning 12, acceleration 10, bikeHandling 10, experience 9 |

### Tests added

| Test | Asserts |
|---|---|
| TC01A-1 | every table sums to 100 raw and exactly 1 normalised |
| TC01A-2 | frozen set is exactly {MOUNTAIN, DESCENT}; placeholders exactly {FLAT, HILLY, CLASSICS} |
| TC01A-3 | +10 on any attribute moves BaseSegmentSkill by exactly `10 × weight / 100`, checked for every attribute of every terrain |
| TC01A-4 | any attribute absent from a table has exactly zero effect |
| TC01A-5 | equal-budget archetypes order correctly per terrain |
| TC01A-6 | an all-rounder scores identically on every terrain |

TC01A-6 is what makes TC01A-5 a specialisation test rather than a quality test:
with all attributes equal and weights summing to 1, BaseSegmentSkill equals the
attribute level on every terrain, so any ordering difference is pure
specialisation.

**TC-01A passes cleanly. The weight arithmetic is exactly correct.**

---

## 2. TC-01B — integrated terrain benchmark

Stage Approach Normal, weather 1.00, SmallVariance 0, Fatigue off, EN-01
Energy, `HOLDING_K = 0.40`, no attacks, no chase. 40 riders, five equal-budget
archetypes (±40 on one attribute, −40 on another), 160 km.

| stage | splits | first split | finish groups | largest | Top10 spread | Energy min/med/max | peak Struggle p50/p90/max | clamp | ms |
|---|---:|---:|---:|---:|---:|---|---|---:|---:|
| FLAT | 16 | 29.0 km | 2 | 24 | 0:00 | 71.7 / 72.8 / 72.8 | 0 / 101 / 101 | 0 | 190 |
| HILLY | **0** | none | 1 | 40 | 0:00 | 72.8 / 72.8 / 72.8 | 0 / 0 / 0 | 0 | 154 |
| CLASSICS | **0** | none | 1 | 40 | 0:00 | 72.8 / 72.8 / 72.8 | 0 / 0 / 0 | 0 | 202 |
| MOUNTAIN | 16 | 7.6 km | 2 | 24 | 0:00 | 71.5 / 72.8 / 72.8 | 0 / 101 / 101 | 0 | 195 |
| MIXED F+H+M+D | 32 | 29.0 km | 2 | 24 | 0:00 | 76.8 / 76.8 / 77.2 | 101 / 101 / 101 | 0 | 112 |

Archetype finishing order (gap to first):

- **FLAT** rouleur = descender = allround 0 s, then **climber and puncheur +2359 s (39 min)**
- **MOUNTAIN** climber = puncheur = allround 0 s, then **rouleur and descender +6645 s (111 min)**
- **MIXED** climber = puncheur = allround 0 s, then rouleur and descender +1283 s (21 min)
- **HILLY, CLASSICS** all five archetypes identical, 0 s apart

Note: final Struggle is 0 by SP-01 design, so the table reports **peak**
Struggle. I had originally measured the final value, which was uninformative.

### Terrain-boundary invariants on the mixed stage — all PASS

| boundary | front-group time | lead gap |
|---|---|---|
| km 40 | +20.05 s continuous | 211.0 -> 210.0 |
| km 80 | +30.24 s continuous | 0.0 -> 0.0 |
| km 120 | +13.17 s continuous | 1422.2 -> 1421.5 |

`P_ref` from the mixed-stage snapshot is **bit-identical** to `P_ref` computed
in an isolated single-terrain stage for all four terrains (FLAT 126.8000,
HILLY 132.0800, MOUNTAIN 125.8400, DESCENT 134.8000), and `snapshot.pRef` is a
frozen object. Changing terrain does **not** recompute `P_ref` from the
surviving group; only the new segment's terrain inputs take effect. Energy and
Struggle do not reset at a boundary.

---

## 3. Diagnosis: weights, K, or the test?

You asked me to separate these before changing either. The sensitivity sweep
answers it precisely.

### The split threshold behaves exactly as SP-02's closed form predicts

`tolerance = mean × K × 0.20 + 1` ≈ 11.1–11.6 EP for a 40-rider bunch at
K = 0.40.

| terrain | archetype swing | spread below mean | tolerance | split predicted | split observed |
|---|---:|---:|---:|---|---|
| FLAT | ±30 | 9.60 | 11.21 | no | **0 splits** |
| FLAT | ±40 | 12.80 | 11.14 | yes | **16 splits** |
| MOUNTAIN | ±20 | 8.32 | 11.23 | no | **0 splits** |
| MOUNTAIN | ±30 | 12.48 | 11.15 | yes | **16 splits** |
| HILLY | ±40 | 6.88 | 11.57 | no | **0 splits** |
| CLASSICS | ±40 | 2.00 | 11.56 | no | **0 splits** |

Prediction matches observation in every cell. **Neither the weights nor K is
malfunctioning.** The engine is doing exactly what the validated model says.

### What the benchmark actually exposed

**Finding 1 — CLASSICS cannot differentiate flat/climbing riders at all.** Its
table contains **neither `flat` nor `climbing`**. Climber, rouleur, descender
and all-rounder all score exactly 130.0 on CLASSICS at every swing; only the
puncheur moves, via `hills 25`. Spread below mean is 2.00 EP even at ±40. For a
classics profile that is almost certainly wrong, and it is a weight-table
question, not a K question.

**Finding 2 — HILLY is the most forgiving road terrain.** Its top weight is 38
against MOUNTAIN's 52 and FLAT's 40, and it also carries `climbing 12`, which
partly compensates a climber. Spread below mean 6.88 at ±40, so it produces no
selection at all under K = 0.40. Directionally plausible for a hilly stage, but
worth confirming it is intended.

**Finding 3, and the one I would act on first — post-split time loss is
unbounded.** This is not a terrain issue. Once dropped, a 16-rider group at
EP 109 against `P_ref` 126 loses 11–14 s/km for the rest of the stage with no
floor: 39 min on FLAT, **111 min on MOUNTAIN**, on a single 160 km stage. Spec
§20 states that even a badly managed rider should usually finish a 5-stage Tour.
There is no grupetto, no time limit and no autobus mechanic, so nothing bounds
this. A 111-minute loss would exceed any realistic time cut.

**Finding 4 — the archetype swing itself is extreme.** A ±40 raw swing through
a 52 % weight is a ±20.8 EP gap, 16 % of the field mean. No holding threshold
that still permits attrition can absorb that: absorbing it on MOUNTAIN would
need K ≥ 0.83, which would eliminate attrition entirely. So the shattering at
±40 is partly a property of my test construction, not only of the engine.

### Recommendation

Do **not** tune K. Its behaviour is exactly as validated and the closed form
predicts every cell.

The two things worth deciding, in order:

1. Whether unbounded post-split time loss is acceptable, or whether a grupetto /
   time-limit mechanic is needed before terrain weights can be judged at all.
   Any weight table will look catastrophic while a dropped rider can lose 111
   minutes.
2. Whether CLASSICS should include `flat` and/or `climbing`. As it stands it is
   inert for the two most common specialisations.

I have changed neither.
