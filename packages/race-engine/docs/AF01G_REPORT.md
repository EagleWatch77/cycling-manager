# AF-01g — tick EP consistency and LOSING_CONTACT window time

**No balance value changed.** Attack, Response, Reaction, merge, Chase, Energy
and Holding constants are all numerically unchanged.

Tests: **128 / 128 passing.** `tsc --noEmit` clean.

**AF-01 is CLOSED.**

---

## 1. Tick EP consistency

The Struggle and drop pass used `effectivePerformance(snap, st, segment)` with
no EffortWindow, while the pace pass applied `effortModifier(window)`. An attack
burst and its recovery tax are individual EP modifiers, so they must move the
rider's deficit against `RequiredPerformance` as well.

Re-reading the window inside the Struggle pass would have been wrong: by then it
has already been advanced, so pace and Struggle would have observed different
phases of the same window.

Fix: a per-interval `tickEP` map is filled **before any window is advanced**,
covering every rider attached to the group including those in `LOSING_CONTACT`
who are excluded from `paceIds`. That single value is reused by:

- Group Pace membership EP,
- Struggle accumulation,
- the drop-model deficit.

PAG members populate the same map on the same rule, so a rider crossing between
entities in one interval still has exactly one EP for that interval.

## 2. LOSING_CONTACT window time

Real-group window advancement iterated `paceIds`, which drops
`LOSING_CONTACT` riders whenever any attached rider remains, so their window
could freeze.

Fix: a rider in `LOSING_CONTACT` advances his window by his own implied elapsed
time for the interval,

```
dtRider = dtGroup + dropGapIncreaseThisTick
```

using the seconds the drop model just added. The existing `windowsAdvanced`
guard still limits every rider to exactly one advance per interval across
PAG / Group / Response handovers.

## 3. Tests

| Test | Asserts |
|---|---|
| A39 | pace EP and Struggle EP are identical in every tick |
| A40 | recovery tax lowers Struggle EP below an untaxed peer after reabsorption |
| A41 | a window does not freeze while the rider is LOSING_CONTACT |
| A42 | LOSING_CONTACT advance is at least `dtGroup` and never a double advance |
| A43 | materialisation does not double-advance the window |
| A44 | fixed Attack Energy still charged exactly once under tick EP |

### Honest note on which of these are proven regression tests

**A39 is verified**: reinstating the window-free EP call in the Struggle pass
makes it fail.

**A41 and A42 could not be shown to fail against an injected defect**, and the
reason is worth recording rather than hiding. With the accepted values the two
states barely overlap:

```
window total        45 + 90 = 135 s = 1.575 km at 42 km/h
struggle 100 at the maximum +40/km gain needs 2.50 km = 214 s
```

A rider who starts an attack from Struggle 0 therefore always has his window
expire before he can reach `LOSING_CONTACT`. Overlap needs pre-existing Struggle
above roughly 37, which no natural fixture in the suite produces.

So the freeze defect is real in the code and is fixed, but the scenario is
currently close to unreachable at these balance values. A41 and A42 are honest
invariant guards, not demonstrated regression catches. If a later mixed-terrain
benchmark lengthens windows or steepens Struggle, they become live.

## 4. Regressions unchanged

### AF8 — bit-identical

| ID | validated | now |
|---|---:|---:|
| B0 | 100.0 % | 100.0 % |
| B1 | 99.3 % | 99.3 % |
| B2 | 23.3 % | 23.3 % |
| B3 | 0.0 % | 0.0 % |
| B4 | 20.0 % | 20.0 % |

Catch km 120.4 / 52.6 / 113.0, Energies, group sizes and split counts identical.

### AF-01e latch outcomes unchanged

| attack | Reaction | latch rate | target gap at start |
|---|---:|---:|---:|
| NORMAL | 0 / 40 | 60.0 % | 2.541 / 2.033 |
| NORMAL | 80 / 120 / 160 / 200 | 100.0 % | 1.524 / 1.016 / 0.508 / 0.000 |
| ALL_OUT | 0 / 40 / 80 | 60.0 % | 3.689 / 2.951 / 2.214 |
| ALL_OUT | 120 / 160 / 200 | 100.0 % | 1.476 / 0.738 / 0.000 |

## 5. Documentation cleanup

The three stale items were already corrected in the AF-01f pass and were
re-verified here:

- `// RP-01 canonical: RequiredPerformance(G) = PaceEP(G)` is gone from
  `segmentLoop.ts`; the current rule is the HoldingFactor model.
- `README.md` lists Attack, Response, Reaction and merge values as **ACCEPTED
  working V1 (AF-01 CLOSED)**, with no "provisional until AF4/AF5" and no
  "pending Reaction resolution".
- `attack.ts` header reads **ACCEPTED WORKING V1 VALUES** and records that
  Reaction is not inert and that All-out has a valid tactical niche.

## 6. AF-01 closed

Remaining open items are unchanged and none belongs to AF-01:

- `HOLDING_K = 0.40` provisional until mixed-terrain and real skill-weight
  validation
- TC-01 unvalidated FLAT / HILLY / CLASSICS skill weights
- EP-01 `SmallVariance` amplitude unspecified, currently zero
- EN-01 gradient terrain multipliers, weather table, Fatigue
- no Struggle inside a PAG, provisional V1 simplification

Not to be revisited unless a later mixed-terrain benchmark shows a regression.
