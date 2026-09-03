# AF-01e — attack-launch causality and interception start

**No balance value changed.** `REACTION_MAX_DELAY_SEC`, `GAP_MERGE_MAX`, normal
attack, all-out attack, response values and every validated Group Pace / Chase /
Energy / Holding constant are numerically unchanged.

Tests: **115 / 115 passing.** `tsc --noEmit` clean.

---

## 1. Both defects confirmed and fixed

### Launch causality

A scheduled Attack is created at `km + TICK_KM`, i.e. after the parent has
already completed the tick. The `PendingResponse` objects it created were then
processed in the same tick's step 3 and had `dtParent` subtracted from a tick
that had finished before the Attack existed.

`PendingResponse` now carries `startsNextTick`. A Response created by this
tick's launch is skipped once and armed for the next tick, so its delay starts
at the logical launch instant. Reaction 200 responds at exactly the launch
boundary and its movement belongs to the following interval, never
retroactively.

### Interception start

Interception compared the target's gap **at tick start** against the responder's
end-of-tick gap, even when the responder only began part way through that tick.
A latch could therefore be granted for a band the target had already left before
the rider started responding.

```
elapsedFraction  = startOffsetSec / dtParent
targetGapAtStart = targetGapBefore + elapsedFraction * (targetGapAfter - targetGapBefore)
```

The interval evaluated is now `targetGapAtStart -> relativeGapAtTickEnd`, with
the responder at parent-relative gap 0 at his actual start. Crossing-aware
interception after that point is unchanged. `RESPOND.gapSec` reports the
interpolated value.

No global substeps were introduced and the tick is unchanged.

## 2. Tests

| Test | Asserts |
|---|---|
| A25 | a Response from an end-of-tick Attack does not consume that tick |
| A26 | Reaction 200 starts at the launch boundary, f = 1, no retroactive movement |
| A27 | fixed Response Energy not charged before the logical start |
| A28 | target gap interpolation, including both clamps |
| A29 | inside 2 s at tick start but outside at actual start does not auto-latch |
| A30 | a genuine crossing after the Response start still latches |
| A31 | RESPOND reports the interpolated gap; a later start sees a larger gap |

Reverting defect 1 makes **A25 fail**. A29 and A30 are pure-function tests over
`interpolateTargetGap` and `interceptsTarget`, so they guard the arithmetic
rather than the wiring; A28 and A31 guard the wiring.

### AF8 — bit-identical

| ID | validated | now |
|---|---:|---:|
| B0 | 100.0 % | 100.0 % |
| B1 | 99.3 % | 99.3 % |
| B2 | 23.3 % | 23.3 % |
| B3 | 0.0 % | 0.0 % |
| B4 | 20.0 % | 20.0 % |

Catch km, Energies, group sizes and split counts all identical.

---

## 3. The corrected sweep changes both conclusions

### Latch rate and target gap at the actual Response start, by Reaction

| attack | Reaction | latch rate | mean target gap at start |
|---|---:|---:|---:|
| NORMAL | 0 | **60.0 %** | 2.541 |
| NORMAL | 40 | **60.0 %** | 2.033 |
| NORMAL | 80 | 100.0 % | 1.524 |
| NORMAL | 120 | 100.0 % | 1.016 |
| NORMAL | 160 | 100.0 % | 0.508 |
| NORMAL | 200 | 100.0 % | 0.000 |
| ALL_OUT | 0 | **60.0 %** | 3.689 |
| ALL_OUT | 40 | **60.0 %** | 2.951 |
| ALL_OUT | 80 | **60.0 %** | 2.214 |
| ALL_OUT | 120 | 100.0 % | 1.476 |
| ALL_OUT | 160 | 100.0 % | 0.738 |
| ALL_OUT | 200 | 100.0 % | 0.000 |

The target gap at start is exactly linear in the delay (2.541 / 2.033 / 1.524 /
1.016 / 0.508 / 0.000 for 30 / 24 / 18 / 12 / 6 / 0 s), which is the
interpolation behaving correctly.

**Reaction is no longer inert.** Latch rate falls from 100 % to 60 % as Reaction
drops, and the cliff sits exactly where `GAP_MERGE_MAX = 2` predicts: the first
Reaction level whose interpolated target gap exceeds 2 s is the first to start
failing.

### Aggregate

| attack | response | latch rate | materialised | median mat km |
|---|---|---:|---:|---:|
| NORMAL | Normal | 86.7 % | 22/30 | 5.0 |
| NORMAL | High | 86.7 % | 22/30 | 4.8 |
| ALL_OUT | Normal | **80.0 %** | **24/30** | 8.2 |
| ALL_OUT | High | **80.0 %** | **24/30** | 8.0 |

**All-out now has the niche you hypothesised.** At Reaction 80 a normal attack
is latched 100 % of the time while an all-out attack is latched only 60 %,
because it opens 2.214 s by the responder's actual start rather than 1.524 s.
All-out breaks responses that normal cannot, and it materialises more often
(24/30 vs 22/30) despite the heavier recovery tax.

The earlier "all-out is strictly dominated" conclusion was wrong, and so was
"latch rate is 100 % everywhere". Both were artefacts of judging interception
against a gap the target had already left.

---

## 4. Status

Reaction and All-out both now show real, graded behaviour on a temporally
consistent simulation. Nothing was tuned to achieve it.

Whether 60 % at the low end of Reaction and a 2.2 s versus 1.5 s separation
between all-out and normal are the *right* magnitudes is a balance question that
can now be asked against trustworthy numbers.
