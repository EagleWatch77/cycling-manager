# Chase benchmark report — breakaway already established

**No constant was tuned.** `GROUP_PACE_EXP`, `CHASE_MAX`, `CHASE_SAT`,
`HOLDING_K = 0.40` (provisional) and all Energy constants are unchanged.

Tests: **76 / 76 passing.** `tsc --noEmit` clean.

---

## 1. Engine bug found and fixed: mixed pre/post-tick times

Setting up the fixture exposed a real defect in the segment loop, not in the
harness.

Instrumenting `resolveWorkMode` at km 28.2 of a two-group, zero-split run:

```
i=0 gid=0 (break, n=5)   t=2343.99   gapBehind=33.10  -> ESCAPE
i=1 gid=1 (peloton n=35) t=2377.09   gapAhead =16.45  -> NEUTRAL
```

Both numbers describe the same pair of groups in the same tick, so they must
be equal. The difference, 16.65 s, is exactly one tick of breakaway travel
time (0.2 km at 43.3 km/h).

**Cause.** The loop advanced each group's clock inside that group's own
iteration. Groups processed later therefore read the already-advanced clocks
of groups processed earlier, and saw a gap understated by one tick.

**Effect.** The 16 s recognized-separation threshold behaved as roughly
16 + 16.6 = 32.6 s for the trailing group. As soon as a chase closed to about
33 s, the peloton flipped itself to NEUTRAL, `WorkFactor` dropped to 0, speed
fell from 46.2 to 41.8 km/h, and the gap re-opened. The result was a stable
CHASE/NEUTRAL limit cycle parking every race at a gap of 31-33 s.

That is the single explanation for the "knife-edge" reported in the previous
two cycles: `maxGap p50 = 0:33` in the 30 s fixture, and a finish gap of
exactly 0:32 in the 120, 180 and 240 s fixtures regardless of where they
started.

**Fix.** All gaps and work modes are now evaluated against `preTickTime`, a
snapshot of every group's clock taken before any group advances in that tick.
Guarded by regression test T62.

**Consequence.** Every benchmark number produced before this fix is invalid,
including those in `BENCHMARK_REPORT.md`, `EN01_REPORT.md` and section 6 of
`SP02_REPORT.md`. The SP-02 K sweep is unaffected in substance because it runs
a single bunch with no second group, so no cross-group gap is ever read.

---

## 2. Fixture

Breakaway of 5 riders at Hard effort, **handed a finished gap at km 15**,
145 km raced, field 40, sigma(EP) 12, flat, `v_ref` 42, 150 runs per cell,
`K = 0.40` provisional, Energy active.

Chase settings apply from the first tick of the fixture. There is **no
artificial no-chase formation window**, and no canonical race-phase rule has
been introduced. This benchmark deliberately tests chase against an already
established breakaway and says nothing about how a breakaway forms.

---

## 3. Primary calibration case — 180 s

| ID | scenario | survival | catch km | max gap | finish gap | break E | chaser E | lg. pel. grp | splits |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| B0 | zero chase | **100.0 %** | none | 12:12 | 12:12 | 66.5 | n/a | 27.7 | 7.3 |
| B1 | weak 2x Medium | **99.3 %** | 157.4 | 5:35 | 5:27 | 66.6 | 72.9 | 27.2 | 7.9 |
| B2 | normal 6x Medium | **23.3 %** | 120.4 | 2:60 | 1:10 | 67.6 | 73.3 | 29.9 | 8.9 |
| B3 | strong 12x High | **0.0 %** | 52.6 | 2:59 | n/a | 69.9 | 74.1 | 28.7 | 11.3 |
| B4 | team 4x High | **20.0 %** | 113.0 | 2:60 | 0:52 | 67.8 | 72.0 | 30.0 | 9.0 |

### Against the stated expectations

| Expectation | Result | Verdict |
|---|---|---|
| B0 survival very high | 100.0 % | **MET** |
| B1 clearly above the normal target | 99.3 % | **MET** |
| B2 approximately 15-25 % | **23.3 %** | **MET** |
| B3 normally single-digit | **0.0 %** | **MET** |
| B4 no team-specific advantage | see below | **MET** |

**B4 check.** B4 is 4 riders at High = `ChaseInput` 20 points. B2 is 6 riders
at Medium = 18 points. B4 therefore has the slightly stronger chase, and it
produces the slightly lower survival (20.0 % vs 23.3 %) and the earlier catch
(113.0 km vs 120.4 km). The ordering follows `ChaseInput` alone. There is no
team bonus anywhere in the model, and none appears in the data.

---

## 4. All three fixtures

| ID | 120 s | 180 s | 240 s |
|---|---:|---:|---:|
| B0 | 100.0 % | 100.0 % | 100.0 % |
| B1 | 98.7 % | 99.3 % | 100.0 % |
| B2 | 12.7 % | **23.3 %** | 37.3 % |
| B3 | 0.0 % | 0.0 % | 0.0 % |
| B4 | 8.0 % | 20.0 % | 30.7 % |

Catch km (median): B2 95.8 / 120.4 / 135.8. B3 42.2 / 52.6 / 63.6.
B4 92.0 / 113.0 / 132.0.

Survival is monotone in the established gap for every scenario, and catch km
moves later as the gap grows. B3 never survives at any of the three gaps,
which is the intended behaviour for a committed twelve-rider chase.

The 120 s case sits just below the target band and the 240 s case above it, so
**180 s is a well-chosen calibration point**: it is the gap at which a normal
six-rider Medium chase produces the target survival rate.

---

## 5. Energy

Break finishes on 66.5-70.3, chase workers on 71.6-74.4, so the break pays
roughly 4 to 8 Energy for the escape. Passive peloton riders sit at 72.8,
which is exactly `100 - 27.2` from the EN-01 calibration.

One emergent detail worth noting: the B3 break finishes on the **highest**
Energy of any scenario (69.9 at 180 s). It is caught at km 52.6, after which
it rides the rest of the stage inside the bunch with better drafting and no
escape multiplier. That is the model behaving correctly rather than an
artefact.

Largest peloton group 27.2-30.0 of 35, splits 7.3-11.4. The bunch stays
coherent.

---

## 6. 30 s fixture, retained as DIAGNOSTIC only

Refreshed after the fix. **Not a balance acceptance test.**

| ID | survival | max gap p50 | splits | fin. groups |
|---|---:|---:|---:|---:|
| B0 | 100.0 % | 10:08 | 7.4 | 9.2 |
| B1 | 84.7 % | 3:05 | 8.2 | 9.8 |
| B2 | 3.3 % | 0:30 | 11.2 | 11.8 |
| B3 | 0.0 % | 0:29 | 11.5 | 12.0 |
| B4 | 2.0 % | 0:30 | 11.3 | 11.9 |

B6 quality sweep at 30 s: strongest 6 chasers 0.0 %, median 21.3 %, weakest 6
99.3 %. Quality remains decisive.

A 30 s break against a competent chase is now caught almost always, which is
the sensible outcome and confirms that the old 19-45 % readings were the
limit-cycle artefact.

---

## 7. Status

The chase model now meets every stated expectation at the primary calibration
point without a single constant being touched. `HOLDING_K` stays PROVISIONAL
pending ratification.

Breakaway formation and attack-response logic remain unimplemented and
undesigned, as intended. This benchmark validates chase behaviour against an
established breakaway and nothing more.
