# AF-01f — rider EffortWindow persistence

**No balance constant changed.** Reaction, `GAP_MERGE_MAX`, Response costs,
Normal Attack, All-out Attack and every validated Group Pace / Chase / Energy /
Holding value are numerically unchanged and are now the accepted working V1 set.

Tests: **122 / 122 passing.** `tsc --noEmit` clean.

---

## 1. Both defects confirmed in source

**Windows were destroyed on transition.** `windows.delete(id)` ran on
materialisation and again on reabsorption, so an attacker who was caught, or who
crossed the 16 s threshold, lost his remaining burst and his entire recovery tax
at that instant.

**Real Groups ignored the window.** PAG members computed
`effectivePerformance(..., effortModifier(window))` while real Group members
computed `effectivePerformance(...)` with no modifier at all. Even if a window
had survived, it would have had no effect once the rider was in a real Group.

Together these meant the recovery tax could be avoided entirely by being caught,
which is exactly backwards.

## 2. Fix

- Both `windows.delete(id)` calls on materialisation and reabsorption removed. A
  window now expires **only** when its own simulated duration reaches zero.
- Real Group `EffectivePerformance` applies `effortModifier(windows.get(id))`,
  identically to PAG members.
- A per-interval `windowsAdvanced` guard set ensures each active window advances
  **exactly once** per race interval, by the elapsed time of the entity the
  rider actually rode in: the group's `dtGroup`, the PAG's `dtOwn`, or
  `f * dtPagFull` for a Response starting mid-interval. No double advancement on
  a PAG to Group or PAG to parent handover.

## 3. Tests

| Test | Asserts |
|---|---|
| A32 | a reabsorbed attacker keeps his burst/recovery timeline |
| A33 | a reabsorbed attacker keeps paying the recovery tax inside the peloton |
| A34 | a materialised attacker keeps the remaining window in the escape Group |
| A35 | a window expires only on duration reaching zero; remaining time is monotone |
| A36 | no interval advances a window by more than one interval's worth |
| A37 | attack fixed Energy still charged exactly once |
| A38 | end-to-end 16 s handover |

**Verified against the defect.** Reinstating `windows.delete` on reabsorption
and removing the modifier from real Group EP makes **A32 and A33 fail**. A34-A38
guard the surrounding invariants.

### A38, the end-to-end handover

Materialisation lands within tolerance of 16 s; on the following ticks the front
group resolves `ESCAPE` and the parent resolves `CHASE`; and the gap never
collapses across the handover, confirming continuity of gap, Energy and the live
window through the PAG to Group transition.

## 4. Regressions unchanged

### AF8 — bit-identical

| ID | validated | now |
|---|---:|---:|
| B0 | 100.0 % | 100.0 % |
| B1 | 99.3 % | 99.3 % |
| B2 | 23.3 % | 23.3 % |
| B3 | 0.0 % | 0.0 % |
| B4 | 20.0 % | 20.0 % |

Catch km 120.4 / 52.6 / 113.0, Energies, group sizes and split counts all
identical.

### AF-01e Reaction and latch results unchanged

| attack | Reaction | latch rate | target gap at start |
|---|---:|---:|---:|
| NORMAL | 0 / 40 | 60.0 % | 2.541 / 2.033 |
| NORMAL | 80 / 120 / 160 / 200 | 100.0 % | 1.524 / 1.016 / 0.508 / 0.000 |
| ALL_OUT | 0 / 40 / 80 | 60.0 % | 3.689 / 2.951 / 2.214 |
| ALL_OUT | 120 / 160 / 200 | 100.0 % | 1.476 / 0.738 / 0.000 |

Aggregate also unchanged: NORMAL 86.7 % latch, 22/30 materialised; ALL_OUT
80.0 % latch, 24/30 materialised.

Identical up to the latch and materialisation decision, as required. That is the
expected outcome: window persistence changes what happens to a rider **after**
he is caught or materialises, not the interception arithmetic that decides it.

## 5. Note on the 60 % figure

Recorded as you framed it: the 60 % is the fraction of deterministic benchmark
cells across different EP and Response configurations in which a latch did not
occur. It is **not** an RNG chance and must not be presented to players as a
probability. `SmallVariance` is still zero and the engine is fully
deterministic.

## 6. AF-01 status

The module is closed. The remaining open items are unchanged and none is a
defect:

- `HOLDING_K = 0.40` provisional until mixed-terrain and real skill-weight
  validation.
- TC-01: FLAT / HILLY / CLASSICS skill weights are unvalidated placeholders.
- EP-01: `SmallVariance` amplitude unspecified, currently zero.
- EN-01: gradient terrain multipliers, weather table and Fatigue still open.
- No Struggle inside a PAG remains a provisional V1 simplification; AF9 showed
  the 2 s merge window already filters weak followers.
