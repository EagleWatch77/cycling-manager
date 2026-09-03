# TC-01C — corrected terrain benchmark

**No engine or balance change.** FLAT, HILLY, `HOLDING_K`, Energy, Group Pace,
`GROUP_SPEED_MIN` all untouched. MOUNTAIN and DESCENT still frozen and verified
unchanged (TC01C-2). No grupetto, no time cap.

Tests: **137 / 137 passing.** `tsc --noEmit` clean.

---

## 1. Interpretation correction accepted

You were right and I overstated it. `GROUP_SPEED_MIN = 0.60 × v_ref` exists and
TC-01B reported **zero clamp hits**, so the floor was never reached and the
111-minute figure was not caused by a missing bound.

It came from the fixture: a ±40 swing on a 52 %-weighted MOUNTAIN attribute,
accumulated over 160 km of continuous mountain. On a 40 km segment the same
stress fixture gives **23:32**, and the realistic mixed stage gives **0:00**.

`FIN-01 — stage time cut / OTL / grupetto behaviour` is recorded as
**non-blocking and deferred** until realistic mixed stages and the 5-stage Tour
benchmark, with the note that a time cut is a post-stage result rule, not a
physics cap on group time loss.

## 2. CLASSICS candidate installed

Marked `status: 'CANDIDATE'`, not frozen. `roughSurface` added as a new
attribute; TC01C-3 proves it affects CLASSICS only.

| weight | value |
|---|---:|
| hills | 25 |
| endurance | 20 |
| flat | 15 |
| acceleration | 10 |
| positioning | 10 |
| roughSurface | 10 |
| packRiding | 5 |
| bikeHandling | 5 |

Climbing deliberately excluded.

## 3. Rider profiles — multi-attribute, equal budget 2210

| profile | adjustments |
|---|---|
| Climber | climbing +25, hills +15, endurance +10, acceleration +5, flat -25, sprint -15, timeTrial -10, packRiding -5 |
| Rouleur/TT | flat +25, timeTrial +20, endurance +10, climbing -25, hills -20, acceleration -10 |
| Sprinter | sprint +30, flat +15, positioning +10, acceleration +10, climbing -30, hills -20, endurance -15 |
| Puncheur | hills +25, acceleration +15, attackTiming +10, flat -20, timeTrial -20, endurance -10 |
| Classics | roughSurface +25, packRiding +15, bikeHandling +12, positioning +8, climbing -25, timeTrial -20, sprint -15 |
| Descender | descending +25, bikeHandling +15, cornering +12, climbing -22, endurance -15, sprint -15 |
| AllRounder | baseline, all 130 |

---

## 4. BaseSegmentSkill by profile and terrain

| terrain | Climber | Rouleur | Sprinter | Puncheur | Classics | Descender | AllRound | mean | worst below | tol | predicted |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| FLAT | 121.8 | **142.2** | 133.7 | 119.8 | 132.0 | 126.7 | 130.0 | 129.5 | 9.66 | 11.36 | hold |
| HILLY | **141.2** | 120.4 | 117.3 | 139.0 | 127.4 | 124.4 | 130.0 | 128.5 | 11.22 | 11.28 | hold |
| MOUNTAIN | **145.4** | 118.2 | 112.7 | 129.2 | 117.4 | 115.6 | 130.0 | 124.1 | 11.37 | 10.93 | SPLIT |
| CLASSICS | 132.3 | 129.8 | 126.3 | 132.8 | **134.7** | 127.8 | 130.0 | 130.5 | 4.24 | 11.44 | hold |
| DESCENT | 130.0 | 130.0 | 130.0 | 130.0 | 133.0 | **150.6** | 130.0 | 133.4 | 3.36 | 11.67 | hold |

**The CLASSICS candidate works.** The Classics specialist is now top on CLASSICS
at 134.7, and all seven profiles differ. The old table gave every non-puncheur
exactly 130.0; spread below mean rose from 2.00 to 4.24.

Ordering is correct everywhere: Rouleur tops FLAT, Climber tops HILLY and
MOUNTAIN, Classics tops CLASSICS, Descender tops DESCENT.

## 5. Isolated 40 km segments, realistic profiles

| terrain | splits | first split | groups | peak Struggle p50/max | gap after 40 km |
|---|---:|---:|---:|---|---|
| FLAT | 0 | none | 1 | 0 / 0 | all 0:00 |
| HILLY | 0 | none | 1 | 0 / 0 | all 0:00 |
| CLASSICS | 0 | none | 1 | 0 / 0 | all 0:00 |
| MOUNTAIN | 0 | none | 1 | 0 / **101** | Sprinter **+0:13**, rest 0:00 |

MOUNTAIN matches the prediction: the Sprinter crosses Struggle 100 and enters
`LOSING_CONTACT`, but 40 km is not long enough to reach the 16 s materialisation
threshold, so he sits 13 s down without a split event. That is the intended
limbo behaviour.

## 6. Stress test, now correctly labelled, at 40 km

| terrain | ±10 | ±20 | ±30 | ±40 |
|---|---|---|---|---|
| FLAT | 0sp 0:00 | 0sp 0:00 | 0sp 0:00 | 16sp **3:31** |
| HILLY | 0sp 0:00 | 0sp 0:00 | 0sp 0:00 | 0sp 0:00 |
| CLASSICS | 0sp 0:00 | 0sp 0:00 | 0sp 0:00 | 0sp 0:00 |
| MOUNTAIN | 0sp 0:00 | 0sp 0:00 | 16sp 5:57 | 16sp **23:32** |

Compare TC-01B's 160 km figures of 39 min and 111 min. The accumulation
artefact is confirmed and removed.

## 7. Mixed 160 km realistic stage

FLAT 60 / HILLY 40 / CLASSICS 30 / MOUNTAIN 20 / DESCENT 10.

| metric | value |
|---|---|
| splits | **0** |
| finish groups | **1** |
| largest group | 42 of 42 |
| Top10 spread | **0:00** |
| Energy min/med/max | 73.9 / 73.9 / 73.9 |
| peak Struggle p50/p90/max | 0 / 80 / 80 |
| clamp hits | 0 |
| runtime | 191 ms |
| ordering | all seven profiles 0:00 apart |

Boundary invariants: front-group time advances continuously at km 60, 100, 130
and 150 (+19.06, +18.18, +30.42, +12.67 s); lead gap stays 0.0 throughout since
the field never splits; `P_ref` frozen, per-terrain
(FLAT 129.46, HILLY 128.52, MOUNTAIN 124.07, CLASSICS 130.49, DESCENT 133.36).

---

## 8. The finding

The CLASSICS candidate is a clear improvement and the accumulation artefact is
gone. But the corrected benchmark exposes the **opposite** problem from TC-01B:

**Under realistic multi-attribute profiles at `HOLDING_K = 0.40`, a realistic
mixed 160 km stage produces no selection whatsoever.** One group, zero splits,
every archetype on the same time. A GC built on stages like this would be
decided entirely by sprints and time trials.

The arithmetic is unambiguous:

```
tolerance          = mean × K × 0.20 + 1  ≈  10.9 to 11.7 EP
worst-below-mean, realistic profiles      =   3.4 to 11.4 EP
```

The tolerance band sits at or above the natural spread that realistic riders
produce. Nothing is ever selected. HILLY is the sharpest illustration: worst
below mean 11.22 against tolerance 11.28, a margin of **0.06 EP**. The system is
on a knife-edge where a trivial weight change flips a terrain between total
homogenisation and mass splitting.

This also reframes SP-02. That sweep used artificial uniform σ distributions,
where a rider weak on one axis was weak overall. Realistic profiles are
compensated: a rider strong on one terrain is only moderately weak elsewhere, so
the effective spread is far smaller than any σ in the SP-02 sweep suggested.
`K = 0.40` was calibrated against the wrong shape of field.

I have changed nothing. The decision is whether K should be re-derived against
realistic profiles rather than synthetic σ, and that is a balance decision.
