# SP-02 diagnostic report — holding-threshold sweep

**Nothing here is canonical. K has not been chosen.**

Setup: neutral field, one bunch, no breakaway, no chase, flat 160 km,
40 riders, mean EP 130, uniform spread over `[130 - sigma, 130 + sigma]`,
`SmallVariance = 0`. Struggle dead zone ACTIVE.

Tests: **60 / 60 passing.** `tsc --noEmit` clean.

---

## 1. HoldingFactor lookup

`HoldingFactor = 1 - K * (1 - DraftEnergyMultiplier(groupSize))`

| group size | draftMult | K=0.20 | K=0.30 | K=0.40 |
|---:|---:|---:|---:|---:|
| 21+ | 0.80 | 0.9600 | 0.9400 | 0.9200 |
| 11-20 | 0.84 | 0.9680 | 0.9520 | 0.9360 |
| 6-10 | 0.88 | 0.9760 | 0.9640 | 0.9520 |
| 3-5 | 0.92 | 0.9840 | 0.9760 | 0.9680 |
| 2 | 0.96 | 0.9920 | 0.9880 | 0.9840 |
| 1 | 1.00 | 1.0000 | 1.0000 | 1.0000 |

A solo rider gets no allowance, which is correct: there is nothing to sit in.

---

## 2. Requested sweep — sigma 1, 2, 4, 6, 12

`splits / finishing groups / largest group / Top10 spread`

| sigma | BASELINE (RP = PaceEP) | K = 0.20 | K = 0.30 | K = 0.40 |
|---:|---|---|---|---|
| 1 | 1 / 2 / 39 / 0:00 | **0 / 1 / 40 / 0:00** | **0 / 1 / 40 / 0:00** | **0 / 1 / 40 / 0:00** |
| 2 | 18 / 19 / 22 / 0:00 | **0 / 1 / 40 / 0:00** | **0 / 1 / 40 / 0:00** | **0 / 1 / 40 / 0:00** |
| 4 | 28 / 27 / 12 / 0:00 | **0 / 1 / 40 / 0:00** | **0 / 1 / 40 / 0:00** | **0 / 1 / 40 / 0:00** |
| 6 | 32 / 30 / 8 / 2:32 | **0 / 1 / 40 / 0:00** | **0 / 1 / 40 / 0:00** | **0 / 1 / 40 / 0:00** |
| 12 | 36 / 31 / 5 / 14:25 | 18 / 19 / 22 / 0:00 | 10 / 11 / 30 / 0:00 | **2 / 3 / 38 / 0:00** |

First split km:

| sigma | BASELINE | K = 0.20 | K = 0.30 | K = 0.40 |
|---:|---:|---:|---:|---:|
| 1 | 111.2 km | none | none | none |
| 2 | 50.8 km | none | none | none |
| 4 | 21.2 km | none | none | none |
| 6 | 16.0 km | none | none | none |
| 12 | 6.2 km | 11.2 km | 20.4 km | 61.0 km |

**Top10 spread is 0:00 for every K at every sigma.** The lead group stays
intact and the Top 10 share one Group Time, which is the stated target shape.

---

## 3. Fine sweep — where each K breaks down

All three K values are indistinguishable up to sigma 6, so the requested
grid does not separate them. Fine sweep:

| sigma | K = 0.20 splits | K = 0.30 splits | K = 0.40 splits |
|---:|---:|---:|---:|
| 6 | **0** | **0** | **0** |
| 7 | 5 | **0** | **0** |
| 8 | 8 | **0** | **0** |
| 9 | 12 | 1 | **0** |
| 10 | 14 | 5 | **0** |
| 11 | 17 | 8 | **0** |
| 12 | 18 | 10 | 2 |
| 14 | 23 | 14 | 7 |
| 16 | 25 | 17 | 11 |

Largest surviving group at sigma 16: K=0.20 -> 15, K=0.30 -> 23, K=0.40 -> 29.

Failure is graceful and monotone in K across the whole range.

---

## 4. The breakdown point is closed-form, and the simulation matches it exactly

Total tolerance for a full 40-rider bunch (draftMult 0.80, so `1 - 0.80 = 0.20`):

```
tolerance_EP = PaceEP * K * 0.20  +  STRUGGLE_DEAD_ZONE_EP
```

| K | allowance from HoldingFactor | + dead zone | predicted last holding sigma | observed |
|---:|---:|---:|---:|---:|
| 0.20 | 130 x 0.04 = 5.2 | 6.2 | 6 | **6** |
| 0.30 | 130 x 0.06 = 7.8 | 8.8 | 8 | **8** |
| 0.40 | 130 x 0.08 = 10.4 | 11.4 | 11 | **11** |

Prediction matches observation in all three cases.

Inverted, for mean EP 130:

```
K  =  (sigma_max - 1) / 26
```

So **choosing K is equivalent to choosing the field spread a flat stage
should absorb without splitting.** That is the decision, stated in game terms
rather than as a tuning constant.

Note the allowance is a fraction of `PaceEP`, not an absolute EP count, so it
scales with league level automatically. A weaker Rookie field gets a
proportionally smaller absolute allowance, which is probably desirable, but it
does mean `sigma_max` in absolute EP points is lower for Rookie than Elite.

---

## 5. Structural caveat: the drafting table is a step function

`HoldingFactor` inherits discontinuities at group sizes 21, 11, 6, 3 and 2.
When a bunch sheds below 21, its allowance drops from `K x 0.20` to
`K x 0.16`, a 20 % reduction, which makes further shedding easier. There is a
built-in cascade amplifier at each boundary.

Visible in the data: at K=0.20 / sigma=12 the largest group settles at 22,
just above the 21 boundary. It is worth checking whether that is stable or
whether a slightly different field tips it over the cliff.

If this matters, smoothing `DraftEnergyMultiplier` into a continuous curve
for the holding-threshold use only would remove it without touching the
Energy table. Not implemented; flagging it.

---

## 6. Harness corrections applied

**NOTE:** the B0-B4 table in this section predates the pre/post-tick work-mode
fix in `CHASE_REPORT.md` section 1 and is INVALID. The K sweep in sections 1-5
is unaffected: it runs a single bunch, so no cross-group gap is ever read.


**Lineage tracking.** `gapsSec[0]` was replaced with breakaway/main-peloton
lineage. Each timeline tick now identifies the leading all-breakaway-lineage
group and the leading group containing any main-peloton-lineage rider, and
measures the gap between those two.

This materially changed the results. Old vs new B2 max gap p50: **15:48 -> 0:33.**
The old figure was measuring gaps between two shards of the fragmented
peloton, not break versus peloton. Every max-gap and catch-km number in the
previous report was wrong.

**B2 is no longer reported as passed.** The max-gap criterion was one-sided
(`<= 5:00`), which a gap of 33 s trivially satisfies. It is now the two-sided
band 3:00-5:00 from the spec, and B0/B1 are explicitly exempt from it since
zero and weak chase must not be forced to the normal-race target.

| ID | survival | maxGap p50 | verdict |
|---|---:|---:|---|
| B0 zero chase | 100.0 % | 15:02 | PASS (band exempt) |
| B1 weak chase | 98.7 % | 7:40 | PASS (band exempt) |
| B2 normal chase | 19.3 % (target 15-25) PASS | 0:33 (target 3:00-5:00) **FAIL** | **FAIL** |
| B3 strong chase | 0.0 % | 0:33 | PASS |
| B4 coordinated team | 20.0 % | 0:33 | PASS |

B2 now fails honestly: survival lands in the target band, but the breakaway
never establishes a gap worth watching. Median peak is 33 seconds against a
target of three to five minutes.

Likely contributor, and a harness question rather than an engine one: the
break is formed at a 30 s gap and the chase is applied from km 0. A real
breakaway builds its gap during an early phase in which the bunch is not
chasing. There is currently no race-phase model, so the break never gets that
window.

**GC comparison removed.** The one-stage flat Top10 spread is no longer
compared to the §24 target of 2-4 min over a 5-stage mixed Tour. No GC
verdict is issued from this benchmark.

---

## 7. EN-01 makes all of this provisional

Energy is never depleted. See `DESIGN_GAPS.md`. With Energy frozen a
breakaway can ride All-out for 160 km for free and a 12-rider All-out chase
costs nothing, so every survival and gap number above is provisional and must
be re-run once the Energy consumption model exists.

The SP-02 sweep itself is less affected, because it is a neutral field with
no chase and no breakaway effort, but the absolute sigma thresholds will
still move once riders can weaken during a stage.
