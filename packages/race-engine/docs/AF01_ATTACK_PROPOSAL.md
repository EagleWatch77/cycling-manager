# AF-01 — Attack / Breakaway Formation — PROPOSAL

**Nothing implemented.** This is a design proposal for review.

The validated established-breakaway Chase model is **not touched**. Everything
below happens strictly below the 16 s threshold, where `resolveWorkMode` cannot
see it, so B0-B4 behaviour is unchanged by construction.

---

## 0. The central idea — attacks are the drop model with the sign flipped

The engine already has a mechanism for a rider who is between 0 and 16 s from a
group and is not yet a separate entity: `ContactState.LOSING_CONTACT`. He
accumulates `detachedGapSec`, and at 16 s he materialises as a group **behind**.

An attack is the same thing mirrored: a rider accumulates a gap **ahead**, and
at 16 s he materialises as a group **in front**.

So the proposal adds one state, not a subsystem:

```
              struggle >= 100                 gap >= 16 s
IN_GROUP  ------------------->  LOSING_CONTACT  ---------->  new group BEHIND
    |
    |         attack launched                  gap >= 16 s
    +------------------------->  ATTACKING     ---------->  new group AHEAD
                                     |
                                     |  gap <= 2 s
                                     +---------------------> reabsorbed, IN_GROUP
```

Same 16 s threshold, same materialisation, same §8 merge rule, same SP-01
struggle reset. The gap is computed by the **existing Group Pace model**, not by
a new formula.

---

## 1. How an attacker begins gaining time

A **Provisional Attack Group (PAG)** is a shadow entity: a set of riders, a
`gapSec` in `[0, 16)`, and a parent group id. It is **not** a `Group` and is
invisible to `resolveWorkMode`.

Each tick the PAG's pace is computed with the existing model, exactly as if it
were a real group:

```
PAGpace = computeGroupPace({
  members: PAG riders, EP including any active attack / response / recovery
           modifier,
  mode: ESCAPE,                       // see §7
  pRef, fieldSize, referenceSpeedKmh, balance
})

gapSec += (parentPace.secPerKm - PAGpace.secPerKm) * TICK_KM
```

No new formula. `SizeFactor` handles the solo attacker's aero penalty for free
(`SizeFactor(1, 40) = -2.21 %`).

### Effort windows are tracked in simulated seconds

Spec §13 windows are 45 s and 90 s while the engine ticks in 0.2 km. Windows are
therefore held as absolute times on the rider's own clock, which already exists
(`t_G`), and expire when that clock passes them. No new clock.

```
onLaunch:  burstEndsAt    = t + ATTACK_BURST_SEC        (45)
           recoveryEndsAt = burstEndsAt + RECOVERY_SEC  (90)
```

---

## 2. How multiple riders follow or join

Two routes, both reusing existing rules:

**Immediate response.** A rider in the parent group who responds enters his own
PAG at `gapSec = 0`. Two PAGs against the same parent merge when
`|gapA - gapB| <= GAP_MERGE_MAX (2 s)` — the existing §8 merge rule. A responder
who gets away quickly enough therefore latches onto the attacker automatically.

**Bridging.** A rider who launches later forms a separate PAG behind the first
and closes on it under the same rule.

No new merge logic. PAGs are ordered by `gapSec`; merging is the §8 test applied
pairwise.

---

## 3. How Reaction affects following

Reaction sets a deterministic delay before a responder's burst begins. During
the delay he rides at parent pace, so the attacker gains.

```
reactionDelaySec = REACTION_MAX_DELAY_SEC * (1 - Reaction_i / 200)
```

Reaction 200 -> 0 s, Reaction 100 -> half, Reaction 0 -> full delay.

### Why this bites, and where it does not

At a solo burst gain of 7.55 s/km and 42 km/h, the attacker opens **0.088 s of
gap per second of racing**. A delay of a few seconds is therefore worth a few
hundredths of a second and is irrelevant on its own.

What makes Reaction matter is the **2 s merge cliff**. A responder whose delay
opens less than 2 s latches on for free; one who opens more than 2 s must bridge,
which costs him a second burst and its Energy. Crossing 2 s needs about 23 s of
delay.

With `REACTION_MAX_DELAY_SEC = 30`:

| Reaction | delay | gap opened | outcome |
|---:|---:|---:|---|
| 200 | 0.0 s | 0.00 s | free latch |
| 150 | 7.5 s | 0.66 s | free latch |
| 100 | 15.0 s | 1.32 s | free latch |
| 60 | 21.0 s | 1.85 s | free latch, marginal |
| 40 | 24.0 s | 2.11 s | **must bridge** |
| 0 | 30.0 s | 2.64 s | **must bridge** |

So Reaction is a threshold attribute: below roughly 50 you miss the split. That
is a single constant producing a clean cliff, and `REACTION_MAX_DELAY_SEC` is
the one value worth sweeping.

**Flagged honestly:** if the intent is for Reaction to matter smoothly rather
than as a cliff at one value, this mechanism is the wrong lever and the design
needs a different one. I am not choosing that; the sweep will show which shape
the game wants.

---

## 4. When an attack fails and is reabsorbed

`gapSec <= GAP_MERGE_MAX (2 s)` -> the PAG merges back into the parent, riders
return to `IN_GROUP`. Existing §8 rule, no new condition.

Failure is not a special case, it is the default. See §11: a solo attack with the
recovery tax running is slower than the bunch, so the gap shrinks and the rider
comes back unless something sustains him.

An empty PAG (all riders reabsorbed or dropped) is removed.

---

## 5. How the provisional 0-16 s gap is represented

```ts
interface ProvisionalAttackGroup {
  readonly id: number;
  riderIds: string[];
  gapSec: number;            // (0, 16)
  parentGroupId: number;
}
```

Rider state gains `ContactState.ATTACKING`, the mirror of `LOSING_CONTACT`.

The engine already has a signed limbo band of +/- 16 s around a group. Drops use
the negative side, attacks the positive side. Invariant to preserve: exactly one
of `applyDropModel`, `applyGroupPace`, `applyAttackGain` is true per rider per
tick, extending the existing mutual-exclusion test T37.

---

## 6. Exactly when it becomes a recognized escape group

```
gapSec >= GAP_SEPARATE_MIN (16)
  -> create Group with timeSec = parent.timeSec - gapSec, posKm = parent.posKm
  -> riders: ATTACKING -> IN_GROUP, struggle = 0   (SP-01, mirrored)
  -> PAG destroyed
```

From the next tick `resolveWorkMode` sees a real group 16 s ahead and returns
`CHASE` for the peloton and `ESCAPE` for the new group. This is precisely the
state the validated chase benchmark starts from.

---

## 7. When Breakaway Effort becomes active

**Proposal: at PAG formation, not at 16 s.** This is the one genuine design
decision in the proposal and it needs ratification.

### Why it cannot wait for 16 s

Peloton at 85.797 s/km. Solo rider, `WorkFactor = 0`:

| phase | s/km | gain vs peloton |
|---|---:|---:|
| burst +6 % | 82.101 | **+3.70** |
| sustained, no burst | 88.048 | **-2.25** |
| recovery tax -2 % | 90.208 | **-4.41** |

The 45 s burst covers 0.575 km and opens **2.1 s**. The 90 s recovery tax then
costs him about 4.5 s. He is reabsorbed before the recovery window even closes,
and a five-rider PAG without Breakaway Effort still loses 1.22 s/km.

Without Breakaway Effort active below 16 s, **no attack can ever reach 16 s**, so
no breakaway can ever form, so Breakaway Effort can never activate. The rule is
circular and the escape rate is exactly zero.

### With Breakaway Effort active (Hard +4 %)

| phase | s/km | gain vs peloton |
|---|---:|---:|
| burst +6 % | 78.245 | **+7.55** |
| all-out burst +10 % | 74.843 | **+10.95** |
| sustained solo | 83.912 | **+1.88** |
| recovery tax -2 % | 85.971 | **-0.17** |
| recovery tax -4 % | 88.125 | **-2.33** |
| 3-rider PAG sustained | 83.265 | **+2.53** |
| 5-rider PAG sustained | 82.967 | **+2.83** |

Now the shape is right: the burst opens a few seconds, the recovery tax is
roughly neutral rather than fatal, and the escape is decided by whether the group
can sustain the effort long enough to reach 16 s.

Justification: a rider who has attacked is by definition committed to escaping.
Making his Breakaway Effort setting inert until an arbitrary threshold models
nothing real.

**Alternative if this is rejected:** breakaways must then be seeded by the
fixture, as the current chase benchmark does, and organic formation is out of
scope for V1. That is a legitimate choice; it is just not compatible with this
milestone.

---

## 8. When normal Chase intensity becomes active

**Unchanged. At 16 s, and not before.** This is what keeps the validated model
intact.

The division of labour is clean:

| gap | peloton response |
|---|---|
| 0 to 16 s | Response only (spec §13: High +5 %, Normal +3 %), per rider, short |
| 16 s and above | Chase intensity, group-level, the validated model |

Below 16 s the peloton's work mode is whatever it already was, normally NEUTRAL,
so its pace is unaffected by the attack. That is deliberate: a bunch does not
change its collective tempo for a rider who is four seconds up the road.

---

## 9. Simultaneous and counter attacks

Multiple PAGs may exist against one parent. Rules, all existing:

- PAGs are ordered by `gapSec`.
- Any adjacent pair with `|gapA - gapB| <= 2 s` merges (§8).
- A PAG reaching 16 s materialises; the others keep measuring against the parent,
  and their gap to the new real group is `16 - gapSec`.
- A counter-attack is simply a new PAG starting at `gapSec = 0`. Nothing special.
- A rider may belong to at most one PAG. Enforced by the same uniqueness guard
  the tick roster already uses.

Order of evaluation within a tick is fixed (PAGs by descending `gapSec`, ties by
group id) so the result stays deterministic.

---

## 10. Energy accounting

All reused from EN-01 and spec §13.

**Fixed launch costs**, applied once at launch, outside the per-tick burn:

| action | cost | source |
|---|---:|---|
| Attack | -5 | spec §13 |
| All-out Attack | -8 | spec §13 |
| Response High | **-4** | **proposed, spec gives no number** |
| Response Normal | **-2** | **proposed, spec gives no number** |

Spec §13 says only that reactions cost Energy and that a rider who answers every
attack can cook himself. The two response values above are proposed by
proportion to the attack costs and **need ratification**; they are the second
open number in this proposal.

**Per-tick burn during ATTACKING** uses EN-01 unchanged, with `groupSize` = PAG
size and `mode = ESCAPE`, so the rider pays his Breakaway Effort energy
multiplier and the small-group drafting penalty automatically. A solo attacker
burns at `draftingEnergyMultiplier(1) = 1.00` against the bunch's 0.80, which is
a 25 % premium before the effort multiplier — the escape is expensive without any
new rule.

---

## 11. Worked example — solo attack, Hard effort, no response

Peloton 35 at 85.797 s/km, attacker EP 130, `v_ref` 42, `P_ref` 130.

| phase | duration | gain rate | gap after |
|---|---|---:|---:|
| burst +6 % | 45 s, 0.575 km | +7.55 s/km | 4.34 s |
| recovery -2 % | 90 s, 1.05 km | -0.17 s/km | 4.16 s |
| sustained Hard | 6.3 km | +1.88 s/km | **16.0 s** |

Total distance to escape: about **7.9 km**, roughly 11 minutes. Launch cost 5
Energy plus the solo drafting premium throughout.

With an all-out attack (+10 %, -8 Energy, -4 % recovery):

| phase | duration | gain rate | gap after |
|---|---|---:|---:|
| burst +10 % | 45 s, 0.60 km | +10.95 s/km | 6.57 s |
| recovery -4 % | 90 s, 1.05 km | -2.33 s/km | 4.12 s |
| sustained Hard | 6.3 km | +1.88 s/km | **16.0 s** |

Interesting result: the all-out attack opens a bigger gap but its heavier
recovery tax gives most of it back, and both routes reach 16 s at almost the same
distance. All-out costs 3 more Energy for no distance advantage **when
unopposed** — its value should be in beating a response, which is exactly what
the benchmark below tests.

## 12. Worked example — three riders, two responders

Attacker Reaction irrelevant. Responder A Reaction 150 (delay 7.5 s, opens
0.66 s), responder B Reaction 40 (delay 24 s, opens 2.11 s).

- A opens 0.66 s < 2 s -> merges into the attacker's PAG on the next tick.
- B opens 2.11 s > 2 s -> forms his own PAG and must bridge.
- The 2-rider PAG sustains at roughly +2.5 s/km, better than solo's +1.88.
- B, alone at +1.88 s/km against a PAG doing +2.5 s/km, loses ground and is
  reabsorbed unless he spends a second burst.

---

## 13. New constants

| constant | value | status |
|---|---:|---|
| `REACTION_MAX_DELAY_SEC` | 30 | **new**, the only real tuning knob |
| `ATTACK_BURST_SEC` | 45 | spec §13 |
| `RECOVERY_SEC` | 90 | spec §13 |
| `RESPONSE_ENERGY_HIGH` | 4 | **proposed**, spec gives no number |
| `RESPONSE_ENERGY_NORMAL` | 2 | **proposed**, spec gives no number |

Everything else is reused: attack and response percentages, recovery taxes,
attack Energy costs, `GAP_SEPARATE_MIN`, `GAP_MERGE_MAX`, the Group Pace model,
`SizeFactor`, drafting, EN-01 and SP-01.

**One genuinely new constant.** Two proposed Energy values that the spec leaves
undefined.

---

## 14. Unit cases

```
A01  a PAG is invisible to resolveWorkMode
     peloton mode with a PAG at 15.9 s == peloton mode with no PAG
A02  materialisation at exactly 16.0 s, not 15.9
A03  materialised group has timeSec == parent.timeSec - gapSec
A04  SP-01 mirrored: struggle reset to 0 on materialisation ahead
A05  reabsorption at gap <= 2 s returns the rider to IN_GROUP
A06  mutual exclusion: exactly one of drop / groupPace / attackGain per tick
A07  burst and recovery windows expire on the rider's own clock, not tick count
A08  attack launch costs exactly 5 Energy, all-out exactly 8, once
A09  per-tick burn during ATTACKING uses PAG size, not parent size
A10  two PAGs within 2 s merge; at 2.01 s they do not
A11  a rider can belong to at most one PAG
A12  determinism: same snapshot and seed -> identical PAG history
A13  with Breakaway Effort inactive below 16 s, escape rate is exactly 0
     (guards the §7 decision with a number)
A14  reaction delay 0 for Reaction 200, full for Reaction 0
```

## 15. Benchmark cases

| ID | scenario | question |
|---|---|---|
| AF0 | solo attack, no response | distance and time to reach 16 s; does §11 reproduce |
| AF1 | attack vs 1 responder by Reaction 200/150/100/60/40/0 | where is the latch cliff |
| AF2 | attack vs 5 responders | does a large PAG form and does it still escape |
| AF3 | normal vs all-out attack, unopposed | confirm the §11 finding that all-out buys nothing |
| AF4 | normal vs all-out attack, opposed | does all-out earn its 3 extra Energy |
| AF5 | repeated attacks, 5 in sequence | does Energy prevent serial attacking as §13 intends |
| AF6 | counter-attack after a failed one | does the second PAG behave independently |
| AF7 | attack into an existing 16 s+ breakaway | does the bridge reach it, and does chase stay valid |
| AF8 | regression: B0-B4 with the attack module compiled in but no attacks | must reproduce the validated numbers exactly |

**AF8 is the important one.** It proves the chase model is untouched.

---

## 16. Two decisions needed before implementation

1. **Does Breakaway Effort activate at PAG formation (§7)?** Without it the
   escape rate is provably zero and this milestone cannot work.
2. **Response Energy costs (§10).** Spec says reactions cost Energy but gives no
   number. Proposed 4 and 2.

Both change balance, so neither is mine to pick.
