# Validation report — established-breakaway chase model

**No constant was tuned.** `GROUP_PACE_EXP`, `CHASE_MAX`, `CHASE_SAT`,
`HOLDING_K = 0.40` (provisional) and all Energy constants unchanged.

Tests: **82 / 82 passing.** `tsc --noEmit` clean.
10 000 runs (2 000 per scenario), 558.7 s total.

---

## 1. Energy bookkeeping on split ticks — FIXED

Both defects confirmed in the source before fixing.

**`sizeByGroup` was never populated.** Declared at line 193, read at line 328,
with no `.set()` anywhere. The `?? g.riderIds.length` fallback silently
supplied a POST-split size on every tick.

**Riders splitting mid-tick were charged nothing.** The Struggle pass removed a
materialising rider from `g.riderIds` before the Energy pass ran, and the new
group was not part of the tick's `active` snapshot. That rider received **zero**
Energy burn for the tick in which he split.

### Fix

A `tickRoster` is built before any group is touched: every rider active at the
start of the tick, bound to the group they actually rode it in. Energy is
charged against that roster rather than against the mutated group lists, so a
rider is charged exactly once, in pre-split context, whatever happens to him
during the tick. `sizeByGroup` is now populated inside the group loop, before
the Struggle pass can remove anyone. A guard throws if a rider ever appears in
two active groups in the same tick.

### Regression tests

| Test | Covers | Fails on old code? |
|---|---|---|
| T63 | every active rider charged exactly once per tick | **yes** |
| T64 | rider splitting this tick charged exactly once | **yes** |
| T65 | split tick uses PRE-split group size | no |
| T66 | no zero or double burn across split and merge | **yes** |
| T67 | `sizeByGroup` populated, not silently falling back | no |
| T68 | determinism intact with the roster-based pass | no |

Verified by temporarily reinstating the old Energy pass: T63, T64 and T66 fail
against it. T65 and T67 guard the invariant going forward but would not have
caught the original defect on their own.

---

## 2. Time formatting — FIXED

`Math.round(s % 60)` rounded the remainder independently of the minutes, so
179.6 s rendered as `2:60`. The total seconds are now rounded first.

Verified: 179.4 -> `2:59`, 179.6 -> `3:00`, 180 -> `3:00`, 239.7 -> `4:00`,
59.6 -> `1:00`. Applied in `bench/chase.ts`, `bench/race.ts`, `bench/sp02.ts`.

---

## 3. Validation run — 180 s fixture, 2 000 runs per scenario

| ID | scenario | survival | 95 % CI (Wilson) | batches (4 x 500) | runtime |
|---|---|---:|---|---|---:|
| B0 | zero chase | **100.00 %** | [99.81, 100.00] | 100.0 / 100.0 / 100.0 / 100.0 | 109.3 s |
| B1 | weak 2x Medium | **98.55 %** | [97.93, 98.99] | 99.0 / 98.8 / 98.2 / 98.2 | 110.9 s |
| B2 | normal 6x Medium | **24.35 %** | [22.52, 26.28] | 23.2 / 27.2 / 22.8 / 24.2 | 113.8 s |
| B3 | strong 12x High | **0.05 %** | [0.01, 0.28] | 0.0 / 0.0 / 0.2 / 0.0 | 114.9 s |
| B4 | team 4x High | **19.25 %** | [17.58, 21.04] | 18.8 / 21.0 / 18.4 / 18.8 | 109.8 s |

### Catch km, max gap, finish gap

| ID | catch km (median, IQR, n) | max gap (median, IQR) | finish gap (median, IQR, n) |
|---|---|---|---|
| B0 | never caught | 12:19 [10:51, 13:52] | 12:19 [10:51, 13:52] n=2000 |
| B1 | 142.4 [134.0, 151.8] n=29 | 5:26 [4:15, 6:49] | 5:19 [3:49, 6:51] n=1971 |
| B2 | 114.8 [95.0, 134.6] n=1513 | 3:00 [3:00, 3:00] | 1:06 [0:32, 2:04] n=487 |
| B3 | 51.6 [47.6, 56.6] n=1999 | 2:59 [2:59, 2:59] | 0:05 n=1 |
| B4 | 109.8 [91.0, 130.2] n=1615 | 3:00 [3:00, 3:00] | 1:05 [0:27, 2:00] n=385 |

### Energy, splits, cohesion, clamp

| ID | break Energy | chaser Energy | diff | splits | largest pel. grp | clamp |
|---|---|---|---:|---|---|---|
| B0 | 66.55 +/- 0.01 | n/a | n/a | 7.27 +/- 1.81 | 27.73 +/- 1.81 | 7.46 (98.5 % runs clean) |
| B1 | 66.56 +/- 0.10 | 72.89 +/- 0.05 | -6.33 | 7.98 +/- 1.94 | 27.09 +/- 2.04 | 7.46 |
| B2 | 67.70 +/- 0.91 | 73.31 +/- 0.61 | -5.60 | 9.13 +/- 2.84 | 29.66 +/- 3.58 | 7.46 |
| B3 | 69.96 +/- 0.17 | 74.09 +/- 0.53 | -4.14 | 11.50 +/- 3.92 | 28.51 +/- 3.90 | 7.46 |
| B4 | 67.89 +/- 0.92 | 72.06 +/- 0.97 | -4.18 | 9.21 +/- 2.85 | 29.84 +/- 3.49 | 7.46 |

---

## 4. Stability

Survival is stable across sub-batches. Widest spread is B2 at 4.4 pp across
four batches of 500 (22.8 to 27.2), which is consistent with binomial noise at
that sample size. B3 produced a single survivor in 2 000 runs.

Energy is extremely tight: B0 break Energy 66.55 +/- 0.01 across 2 000 runs
with different fields, because a breakaway that is never caught always rides
the same Hard-effort five-man profile end to end. Scenarios where the break
gets caught show larger spread (+/- 0.9) precisely because the catch km varies.

Clamp fires in 1.5 % of runs and never in the other 98.5 %. When it fires it
fires in bursts (43 to 119 hits in a run), which is a blown grupetto riding
near the floor for a stretch. Identical to two decimal places across scenarios
because fields are generated per-seed independently of chase configuration, so
the same weak riders blow up the same way regardless of what happens at the
front. 1 996 of 2 000 runs have the identical clamp count in B0 and B3.

---

## 5. Verdict

| Criterion | Result | Verdict |
|---|---|---|
| B0 survival very high | 100.00 % | MET |
| B1 clearly above the normal target | 98.55 % | MET |
| B2 in 15-25 % band | **24.35 %** | **MET** |
| B3 single-digit survival | **0.05 %** | **MET** |
| B4 no team-specific advantage | see below | MET |

**B4 check.** B4 is 4 riders at High = `ChaseInput` 20 points; B2 is 6 riders at
Medium = 18 points. B4 has the stronger chase and produces the lower survival
(19.25 % vs 24.35 %) and the earlier catch (109.8 km vs 114.8 km). The ordering
follows `ChaseInput` alone. No team bonus exists in the model and none appears
in the data.

### One qualification worth recording

B2's point estimate of 24.35 % is inside the band, but its 95 % confidence
interval is [22.52, 26.28] and therefore **crosses the 25 % upper bound**. The
model sits at the top edge of the target rather than in the middle of it.

The stated criterion is met. But if the intent is for B2 to be comfortably
inside 15-25 % rather than resting on the boundary, that is worth knowing
before `HOLDING_K` is ratified, and it is a reason to re-check B2 after any
future change rather than assume headroom that is not there.

No constant was changed on the strength of this observation.

---

## 6. Reporting bug found and fixed in this cycle

B0's chaser Energy initially printed as `0.00 +/- 0.00` with a diff of 66.55.
B0 has no chasers, so the mean of an empty array is NaN; `JSON.stringify`
serialises NaN as `null`, and `Number.isNaN(null)` is false, so the nulls
passed a NaN filter and averaged as zero. Filtering on `Number.isFinite`
instead now correctly reports `n/a`.

---

## 7. Status

The established-breakaway chase model meets every stated expectation at the
primary calibration point, with no constant tuned, over 10 000 runs.

`HOLDING_K = 0.40` remains PROVISIONAL. Attack and Breakaway Formation remain
undesigned and unimplemented, as instructed.
