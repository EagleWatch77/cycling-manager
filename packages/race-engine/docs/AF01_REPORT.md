# AF-01 implementation report

**No validated constant changed.** `GROUP_PACE_EXP`, `CHASE_MAX`, `CHASE_SAT`,
`HOLDING_K = 0.40`, all EN-01 Energy constants untouched.

Tests: **98 / 98 passing.** `tsc --noEmit` clean.

---

## 1. Required correction applied

You were right and the arithmetic confirms it: a normal Attack at Hard effort
gains 7.55 s/km, i.e. **1.51 s in the first 0.2 km tick**. My proposed `<= 2 s`
reabsorption rule would have cancelled every normal attack on its first tick and
contradicted my own worked example.

Implemented as specified:

```ts
export const PAG_REABSORB_GAP_SEC = 0;
// A PAG created this tick has not raced yet and its gap is still exactly 0,
// so reabsorption is only judged after it has been advanced at least once.
pagIsReabsorbed = pag.ticks > 0 && pag.gapSec <= 0
```

`GAP_MERGE_MAX = 2` remains in use for PAG-to-PAG merging (A10) and real
Group-to-Group merging (T31, T33). It is not the failure threshold for an attack
against its own parent.

Regression tests added as requested:

- **A05** reabsorption happens at gap <= 0, never at gap <= 2
- **A05b** a normal attack survives the whole 0-2 s band
- **A05c** the gap passes continuously through the 0-2 s band without cancellation

## 2. Other ratified items

- Breakaway Effort active from PAG formation. Guarded by **A13**, which asserts
  the escape rate is exactly zero without it.
- Response: Normal +3 % / -2 Energy, High +5 % / -4 Energy. No recovery tax,
  since spec §13 defines one only for attacks. Working/provisional.
- `REACTION_MAX_DELAY_SEC = 30`, provisional. Reaction not redesigned.
- Burst and recovery windows run on the **PAG's own** elapsed seconds, held as
  remaining seconds and decremented by the PAG's own `dt`, which is also
  merge-safe. Test **A07** asserts they are driven by elapsed seconds, not tick
  count.
- One Response action produces exactly one burst. `hasResponded` prevents any
  auto-refire.

---

## 3. AF8 — regression against the validated Chase model

**The decisive test. It passes exactly.**

| ID | validated | with attack module compiled in | delta |
|---|---:|---:|---|
| B0 | 100.0 % | 100.0 % | none |
| B1 | 99.3 % | 99.3 % | none |
| B2 | 23.3 % | 23.3 % | none |
| B3 | 0.0 % | 0.0 % | none |
| B4 | 20.0 % | 20.0 % | none |

Catch km 120.4 / 52.6 / 113.0, break Energy 66.5-69.9, chaser Energy 72.0-74.1,
largest peloton group 27.2-30.0, splits 7.3-11.3 — all identical to the
validated run. Not "no meaningful regression": **no regression at all.**

This is a structural guarantee, not luck. A PAG is invisible to
`resolveWorkMode` (A01), so with no rider configured to attack, no PAG is ever
created and every code path is the one that was validated.

---

## 4. A01-A14 unit results

All pass. Highlights:

| Test | Asserts |
|---|---|
| A01 | peloton mode with a PAG at 15.9 s == mode with no PAG |
| A02 | materialisation at 16 s, not below |
| A03 | materialised group time == parent time - gap |
| A04 | SP-01 mirrored: struggle reset when materialising ahead |
| A06 | mutual exclusion of contact states |
| A08 | attack costs exactly 5 / 8 Energy, charged once |
| A09 | PAG rider burns Energy at PAG size, not parent size |
| A11 | a rider belongs to at most one PAG |
| A12 | determinism with attacks active |
| A13 | without Breakaway Effort below 16 s the escape rate is zero |

---

## 5. AF0-AF7 results

### AF0 solo attack, unopposed

| kind | materialise | escape distance | attacker E | bunch E |
|---|---:|---:|---:|---:|
| NORMAL | 10.8 km | 9.8 km | 80.04 | 89.80 |
| ALL_OUT | 12.2 km | 11.2 km | 77.04 | 89.80 |

My proposal predicted 7.9 km; the real integration gives 9.8 km. The proposal
integrated the three phases by hand and ignored Energy decay during the escape.

### AF1 attack vs one responder — Reaction is inert

| Reaction | delay | latched | materialise | PAG size |
|---:|---:|---|---:|---:|
| 200 | 0.0 s | yes | 8.0 km | 2 |
| 150 | 7.5 s | yes | 8.0 km | 2 |
| 100 | 15.0 s | yes | 8.0 km | 2 |
| 60 | 21.0 s | yes | 7.8 km | 2 |
| 40 | 24.0 s | yes | 7.8 km | 2 |
| 0 | 30.0 s | yes | 7.8 km | 2 |

**The cliff I predicted does not exist.** My proposal's §3 analysis was
incomplete: I calculated the gap the delay opens (2.6 s at Reaction 0) but not
the responder's own burst closing it. A +5 % response burst closes 2.6 s
trivially, so every responder latches regardless of Reaction, and materialisation
moves by 0.2 km across the entire attribute range.

Reaction is currently a dead attribute in this mechanism. Not redesigned, as
instructed. It is the first thing AF1 should drive.

### AF2 attack vs five responders

Materialises at 6.0 km with an escape group of 6 and 5 PAG merges. A larger PAG
escapes faster than a solo rider (6.0 km vs 10.8 km) because `SizeFactor`
improves. Behaves as designed.

### AF3 / AF4 — all-out attack has no use case

| | NORMAL | ALL_OUT |
|---|---:|---:|
| unopposed | 10.8 km | **12.2 km** |
| opposed, 3x High response, Rx 100 | 6.6 km | **6.6 km** |

Unopposed, all-out is **worse**: the heavier -4 % recovery tax gives back more
than the bigger burst won. Opposed, the two are identical while all-out costs 3
more Energy.

My proposal predicted all-out would earn its cost under opposition. It does not.
On current numbers all-out is strictly dominated and no player would ever pick
it. Reported, not fixed.

### AF5 serial attacking

Five riders attacking in sequence: **3 materialisations, 0 reabsorptions**,
attacker Energies 78.1-80.7 against a bunch on 89.8.

Spec §13 intends that a rider who answers every attack cooks himself. At these
values attacking is cheap enough that most sequential attacks succeed. Energy is
not currently the restraint §13 describes.

### AF6 counter-attack

`1.0 km r0 LAUNCH -> 2.2 km r0 REABSORB -> 12.0 km r1 LAUNCH -> 21.8 km r1
MATERIALISE`. Reabsorption and independent counter-attack both work.

### AF7 bridging — fails, and correctly

The bridger launches at 2.0 km and is reabsorbed at 3.2 km.

The scenario as I first wrote it was mis-specified (34 Medium chasers, so the
break was caught immediately and there was nothing to bridge to). Rebuilt on the
validated fixture: break of 5 at 180 s, 6 Medium chasers.

The bridge still fails, for a correct reason. A chasing peloton runs at about
80.9 s/km; a solo rider at Hard effort runs at 83.9 s/km. He loses 3.0 s/km once
his burst ends, so he cannot escape a working bunch alone. Bridging requires
either company or a peloton that is not chasing.

---

## 6. Findings for the next decision round

1. **Reaction is inert (AF1).** The response burst closes any gap the delay
   opens. The attribute currently changes nothing.
2. **All-out attack is strictly dominated (AF3/AF4).** Worse unopposed, equal
   opposed, and 3 Energy more expensive.
3. **Serial attacking is unrestrained (AF5).** 3 of 5 succeed; Energy does not
   bite as §13 intends.
4. **Solo bridging is impossible against a working chase (AF7).** Probably
   correct, worth confirming it is intended.

None of these were changed. All four are balance questions.

## 7. V1 simplification recorded

Riders inside a PAG do not accumulate Struggle. A PAG is short-lived and its
pace is set by its own members, so no split-from-PAG transition was invented.
A rider who cannot hold the PAG simply lowers its `PaceEP`, since that is the
mean of its members. Worth revisiting once PAGs routinely reach five or more
riders.
