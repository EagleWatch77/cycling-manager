# AF-01d — same-tick Response transition

**No balance value changed.** `TICK_KM`, `REACTION_MAX_DELAY_SEC`, the merge
threshold, all attack and response values, and every validated Group Pace /
Chase / Energy / Holding constant are numerically unchanged.

Tests: **108 / 108 passing.** `tsc --noEmit` clean.

---

## 1. The temporal-order defect, confirmed

Your reading of the code was correct. The tick order was:

```
1. PAG advance pass      (snapshot of pags taken here)
2. scheduled attacks     (new PAGs created)
3. pending responses     (responder PAG created with startFraction)
3b. interception
4. PAG-to-PAG merge
5. materialise / reabsorb
```

A responder PAG created in step 3 was never advanced in that tick. It carried
`startFraction` into the **next** tick's step 1 and only moved then. Meanwhile
the rider had already been removed from the parent's rider list in step 3 and
the Energy pass charged him full PAG context for the whole tick.

So the reported sub-tick start was correct metadata attached to movement,
membership and Energy that were resolved at three different physical instants.

## 2. Fix

The Response is now resolved entirely inside the tick in which its delay
expires:

```
dtParent    = parentSecPerKm * TICK_KM
f           = clamp((dtParent - remainingDelaySec) / dtParent, 0, 1)
dtPagFull   = 3600 * TICK_KM / responsePaceSpeed
gapEnd      = f * (parentSecPerKm - responseSecPerKm) * TICK_KM
```

- the PAG is created **already at `gapEnd`**, with `timeSec = parentTime - gapEnd`
- the effort window advances by `f * dtPagFull` only
- `startFraction` is deleted from the PAG type; nothing is carried forward
- interception is evaluated the same tick, against `pagGapBefore = 0`

Parent pace still uses the tick-start roster for the whole 0.2 km tick, as you
allowed. No global substeps were introduced.

### Energy

```
burn = (1 - f) * parentContextBurn + f * responsePagContextBurn
```

plus the fixed Response Energy charged exactly once at the logical start.

### RESPOND.gapSec

Now reads the gap of the **specific `targetPagId`**, not the maximum gap of any
PAG against the parent.

---

## 3. Tests

| Test | Asserts |
|---|---|
| A20 | Response movement happens in the SAME tick it starts |
| A21 | end-of-tick gap scales with the active fraction; f = 0 does not move |
| A22 | 0/6/12/18/24/30 s delays map to at least 5 distinct real start offsets |
| A23 | fixed Response Energy charged once, per-tick charge accounting intact |
| A24 | RESPOND reports the target PAG's gap with two simultaneous PAGs |

**Verified against the defect.** Reinstating the deferred behaviour makes
**A20 and A21 fail**, so they are real regression tests rather than restatements
of the new code. A22-A24 guard the accompanying invariants.

### AF8 unchanged

| ID | validated | now |
|---|---:|---:|
| B0 | 100.0 % | 100.0 % |
| B1 | 99.3 % | 99.3 % |
| B2 | 23.3 % | 23.3 % |
| B3 | 0.0 % | 0.0 % |
| B4 | 20.0 % | 20.0 % |

Catch km, Energies, group sizes and split counts all identical.

---

## 4. Corrected NORMAL vs ALL_OUT sweep

6 Reaction x 2 Response x 5 EP deltas x 2 attack kinds = 120 cells.

### Aggregate

| attack | response | latch rate | materialised | median mat km |
|---|---|---:|---:|---:|
| NORMAL | Normal | **100.0 %** | 18/30 | 4.8 |
| NORMAL | High | **100.0 %** | 18/30 | 4.8 |
| ALL_OUT | Normal | **100.0 %** | 18/30 | 5.0 |
| ALL_OUT | High | **100.0 %** | 18/30 | 4.8 |

### Representative rows, NORMAL attack, High response

| Rx | delay | startF | gap at start | latch | latch km | g@30s | g@45s | mat km | atk E | rsp E |
|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| 0 | 30.0 s | 0.250 | 1.51 | yes | 1.2 | 1.80 | 2.09 | n/a | 83.6 | 84.1 |
| 80 | 18.0 s | 0.950 | 1.51 | yes | 1.2 | 1.80 | 2.09 | n/a | 83.6 | 84.1 |
| 120 | 12.0 s | 0.300 | 0.00 | yes | 1.0 | 0.58 | 0.87 | n/a | 83.6 | 84.1 |
| 200 | 0.0 s | 1.000 | 0.00 | yes | 1.0 | 0.58 | 0.58 | n/a | 83.6 | 84.1 |

(dEP -15; with dEP +15 the pair materialises around 2.8 km.)

The sub-tick machinery is now visible in the physics: `gap at start` is 1.51 s
for responders that fire in the second tick and 0.00 for those firing in the
first, and the attacker's gap at 30 s and 45 s differs accordingly.

---

## 5. Conclusion on Reaction and All-out

**Latch rate is 100 % in all 120 cells.** Reaction changes *when* the response
starts, to the second, and it changes the gap the responder must close, but it
never changes whether the response succeeds.

The reason is unchanged from AF1c and is structural: an attacker opens about
1.5 s during the entire 30 s reaction window, comfortably inside the 2 s merge
band. Even the slowest reactor arrives while the target is still within
touching distance.

All-out gives 5.0 km median materialisation against normal's 4.8 km, so it is
still marginally **worse**, and costs 3 more Energy. Its hypothesised niche of
breaking responses cannot appear while every response latches regardless.

So the two open questions are now cleanly separated:

1. **Reaction's timing is correct and its outcome is inert.** Making latch
   success depend on Reaction needs a balance decision: a larger attack gain,
   a narrower merge band for responses, or a longer reaction window.
2. **All-out cannot be judged until (1) is decided**, because its only
   plausible advantage is shaking off responders, which is currently
   impossible by construction.

Neither was tuned. Both now rest on measurements taken from a temporally
consistent simulation rather than from deferred movement.

---

## 6. Reporting caveat

The `g@15s / g@30s / g@45s` columns read the provisional trace at the nearest
tick boundary at or before the requested time. A 0.2 km tick is 17.2 s, so the
15 s column is `n/a` for the first PAG in some rows. That is a granularity
limit of the diagnostic, not of the simulation.
