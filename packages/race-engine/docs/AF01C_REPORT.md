# AF-01c — sub-tick Reaction and response-target interception

**No balance value changed.** `TICK_KM = 0.2` and `REACTION_MAX_DELAY_SEC = 30`
are unchanged, no new balance constant was added, and Reaction, Response,
All-out, Group Pace, Chase, Energy and Holding values are all numerically
identical to the validated run.

Tests: **103 / 103 passing.** `tsc --noEmit` clean.

---

## 1. Sub-tick response start

A pending Response may now begin fractionally inside a 0.2 km tick.

```
dtParent       = parentSecPerKm * TICK_KM        // 17.2 s at 42 km/h
activeFraction = clamp((dtParent - remainingDelaySec) / dtParent, 0, 1)
```

The rider stays with the parent for `(1 - f)` of the tick and rides his own
Response pace for `f` of it:

```
dtRider  = (1 - f) * dtParent + f * dtPagFull
gapGain  = f * (parentSecPerKm - pagSecPerKm) * TICK_KM
dtOwn    = f * dtPagFull        // effort window advances by THIS, not the tick
```

The fixed Response Energy cost is charged exactly once, when the Response
begins. The fraction is derived from the tick itself, so no new balance
constant exists.

## 2. Response-target interception

A `PendingResponse` now carries `targetPagId`. Each tick the relative gap
`target.gapSec - responder.gapSec` is taken **before and after** the tick and
treated as a continuous interval:

```
intercepts = min(relStart, relEnd) <= +GAP_MERGE_MAX
          && max(relStart, relEnd) >= -GAP_MERGE_MAX
```

Crossing from behind the target to ahead of it inside one tick therefore counts
as a latch. On latching, the merged PAG keeps the **target's** gap, so an
overpowered responder does not carry the group past the target and does not
become a counterattacker. Passing requires a later explicit Attack.

Ordinary PAG-to-PAG merging for independent attacks is unchanged and now
explicitly skips response PAGs, which are resolved by interception instead.

---

## 3. AF1c results

Extract, High response, Hard effort, equal EP. Full sweep is 216 cells
(6 Reaction x 2 Response x 3 effort x 6 EP deltas).

| Rx | delay | startFraction | offset in tick | absolute start | gap at response | latch |
|---:|---:|---:|---:|---:|---:|---|
| 0 | 30.0 s | 0.250 | 12.86 s | 30.06 s | 1.45 | yes |
| 40 | 24.0 s | 0.600 | 6.86 s | 24.06 s | 1.45 | yes |
| 80 | 18.0 s | 0.950 | 0.86 s | 18.06 s | 1.45 | yes |
| 120 | 12.0 s | 0.300 | 12.00 s | 12.00 s | 0.00 | yes |
| 160 | 6.0 s | 0.650 | 6.00 s | 6.00 s | 0.00 | yes |
| 200 | 0.0 s | 1.000 | 0.00 s | 0.00 s | 0.00 | yes |

Absolute start times reproduce the intended delays exactly: 30, 24, 18, 12, 6,
0 seconds.

### Acceptance invariants

| # | invariant | result |
|---|---|---|
| 1 | Reaction no longer collapses into two timing states | **PASS** — six distinct states; A15 |
| 2 | higher Reaction never starts later | **PASS** — A16, monotone across the sweep |
| 3 | higher Reaction never makes latching less likely | **PASS** — latch success never decreases with Reaction anywhere in the 216 cells |
| 4 | a trajectory crossing the target must latch, not overshoot | **PASS** — A18 covers behind-to-ahead, ahead-to-behind, band edge and both non-intersecting cases |
| 5 | AF8 no-attack regression unchanged | **PASS** — see below |

New unit tests A15-A19.

### AF8 regression — unchanged

| ID | validated | now |
|---|---:|---:|
| B0 | 100.0 % | 100.0 % |
| B1 | 99.3 % | 99.3 % |
| B2 | 23.3 % | 23.3 % |
| B3 | 0.0 % | 0.0 % |
| B4 | 20.0 % | 20.0 % |

Catch km 120.4 / 52.6 / 113.0, Energies, group sizes and split counts all
identical.

---

## 4. Two harness bugs found and fixed

**Latch detection.** AF1b measured latching as "responder and attacker end the
stage in the same group". That is not the same thing: a latched pair can merge
into a PAG, materialise together, and then split again inside the escape group
when the weaker of the two falls below the two-rider `RequiredPerformance`.
That is exactly what the `dEP +15` and `dEP -15` cells were doing, which is why
they reported `no`. Latch is now read from the actual `PAG_MERGE` event.

**Response gap.** The `RESPOND` event previously recorded `gapSec: 0`
hard-coded, so AF1b's "gap at response" column was meaningless. It now records
the real gap of the PAG being answered.

---

## 5. What sub-tick did NOT fix, and why

Timing quantisation is gone, but **latch success is still insensitive to
Reaction**, and the reason is structural rather than numerical.

An attacker gains about 0.088 s of gap per second of racing. Over the entire
30 s reaction window he opens roughly **1.5 s**, which is inside the 2 s merge
band. So even the slowest possible reactor arrives while the target is still
within touching distance, and latches.

Reaction now correctly controls *when* a response starts, to the second. It does
not control *whether* the response succeeds, because at current attack gain
rates the target never gets far enough away within the reaction window for the
band to matter.

Making Reaction decide latch success would require either a larger attack gain
rate, a shorter merge band for responses, or a longer reaction window. All three
are balance changes and none was made.

Responder EP and responder Breakaway Effort remain the dominant levers, as in
AF1b.

---

## 6. AF3/AF4 re-run after the correction

| | NORMAL | ALL_OUT |
|---|---:|---:|
| unopposed | 10.8 km | 12.2 km |
| opposed, 3x High response, Rx 100 | **6.6 km** | **6.8 km** |

Corrected results, no tuning applied.

The opposed case has changed: it was 6.6 km for both before AF-01c, and all-out
is now marginally **worse** (6.8 km) rather than equal. So the corrected
responder model does not rescue all-out. On current numbers all-out is worse
unopposed, worse opposed, and costs 3 more Energy.

Its hypothesised niche of breaking responses does not appear at these values. A
plausible reason: because every responder latches regardless of Reaction, a
bigger burst cannot shake anyone off, and the heavier -4 % recovery tax then
costs more than the burst won.

That points at the same root cause as section 5 rather than at the all-out
numbers themselves, so all-out remains untouched pending a decision on whether
latch success should depend on Reaction at all.

---

## 7. Open items

1. **Latch success is Reaction-independent** for the structural reason in
   section 5. Timing is fixed; outcome is not. Needs a balance decision.
2. **All-out is still dominated** and probably cannot be judged until item 1 is
   resolved.
3. Response Energy cost of 4 and `REACTION_MAX_DELAY_SEC = 30` remain
   provisional.
4. No Struggle inside a PAG remains a provisional V1 simplification.
