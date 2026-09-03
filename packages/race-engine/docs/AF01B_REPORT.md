# AF-01b — versioning, Reaction diagnostic, AF5b, AF9

**No balance value changed.** Attack, response, Reaction, All-out, Group Pace,
Chase, Energy and Holding constants are all numerically identical to the
validated run.

Tests: **98 / 98 passing.** `tsc --noEmit` clean.

---

## 1. Attack balance is now versioned

All attack and response numbers moved into `BalanceConfig` with **identical
values**: `ATTACK_BURST_SEC`, `RECOVERY_SEC`, `REACTION_MAX_DELAY_SEC`, normal
and all-out burst percentages, recovery taxes, attack Energy costs, and both
response percentages and Energy costs. `attack.ts` no longer owns any number;
`attackProfile(kind, balance)` and `responseProfile(kind, balance)` derive them.

Version bumped to `balance-1.1.0-af01`. AF0-AF7 reproduce exactly after the
move, confirming it was a pure relocation.

### Reproducibility of historical snapshots

A version string alone cannot replay a stage once values change, so the
**entire frozen config now travels inside the snapshot** (`StageSnapshot.balance`).

- `simulateStage` throws if the supplied config's version differs from the
  snapshot's, instead of silently simulating with the wrong numbers.
- `replaySnapshot(...)` replays using the snapshot's own embedded config, so a
  historical stage stays reproducible after any future balance change.

---

## 2. AF1b — Reaction diagnostic. The real cause is tick resolution

Your hypothesis was that the default `BreakawayEffort.HARD` was masking
Reaction. The sweep shows something else, and it is more fundamental.

Sweep: Reaction 0/40/80/120/160/200 x Response Normal/High x responder effort
Normal/Work/Hard x responder EP -15/0/+15. 108 cells.

Extract, High response, Hard effort:

| Rx | delay | gap at response | latch | response fires at | materialise |
|---:|---:|---:|---|---:|---:|
| 0 | 30.0 s | 1.45 | yes | 1.2 km | 7.8 km |
| 40 | 24.0 s | 1.45 | yes | 1.2 km | 7.8 km |
| 80 | 18.0 s | 1.45 | yes | 1.2 km | 7.8 km |
| 120 | 12.0 s | 0.00 | yes | 1.0 km | 8.0 km |
| 160 | 6.0 s | 0.00 | yes | 1.0 km | 8.0 km |
| 200 | 0.0 s | 0.00 | yes | 1.0 km | 8.0 km |

**The whole Reaction range produces exactly two outcomes.**

A 0.2 km tick at 42 km/h is **17.2 seconds** of simulated time. The delay is
counted down one tick at a time, so:

- delays of 0, 6 and 12 s all resolve inside the first tick, gap 0.00;
- delays of 18, 24 and 30 s all resolve in the second tick, gap ~1.45.

`REACTION_MAX_DELAY_SEC = 30` spans **1.7 ticks**. Reaction cannot express more
than two states, and the difference between them is 0.2 km of materialisation
distance.

This is a better diagnosis than the one in my AF-01 report, where I blamed the
response burst closing the gap. That was wrong. The attribute is quantised away
before the burst ever matters. Two levers exist and neither is chosen here:
raise the delay well beyond one tick, or represent it sub-tick as a fractional
offset applied to the gap.

### Responder quality dominates Reaction

| responder EP vs attacker | latch | outcome |
|---|---|---|
| -15 | **no** | never gets across, no escape forms |
| equal | **yes** | joins, 2-rider escape at 7.8-8.0 km |
| +15 | **no** | goes clear alone, materialises at 2.8-3.0 km |

A responder 15 EP stronger does not latch — he overshoots and forms his own
faster escape. Responder EP moves the outcome far more than the entire Reaction
range does.

Responder Breakaway Effort also matters: at Normal effort with equal EP no
escape forms at all; at Work it materialises at 14.2 km; at Hard at 7.8 km. So
your hypothesis was directionally right, it is just second to the tick problem.

---

## 3. AF5b — repeated responses ARE restrained

The AF5 conclusion in my previous report was wrong, as you suspected. AF5
measured five *different* attackers. AF5b measures one rider answering every
attack, which is the actual §13 test.

| attacks | responses fired | fixed cost | finish Energy |
|---:|---:|---:|---:|
| 1 | 1 | 4 | 85.75 |
| 2 | 2 | 8 | 81.70 |
| 3 | 3 | 12 | 77.66 |
| 5 | 5 | 20 | 69.58 |
| 8 | 8 | 32 | 57.48 |
| 12 | 12 | 48 | 41.37 |

The cost is exactly linear at 4 Energy per response and the responder finishes
**44 Energy down** after answering twelve attacks, against a bunch that finishes
around 90. He is never blocked from responding, but he arrives at the finish
with less than half the field's Energy.

So §13's "respond to everything and cook yourself" **does hold**. It is not a
hard block, it is a cumulative tax, which is the right shape. Whether 4 Energy
per response is the right magnitude stays open pending AF4.

One implementation note this exposed: a rider responds at most once per attack,
but a distinct later attack is a distinct action and may be answered again. The
"one Response action, one burst, no auto-refire" rule is enforced by consuming
the pending entry, not by a permanent flag.

---

## 4. AF9 — weak followers do not drag the PAG

| PAG make-up | materialise | nominal PaceEP | escape group size |
|---|---:|---:|---:|
| 4 strong (EP 140) | 2.4 km | 140.0 | 4 |
| 3 strong + 1 at 130 | 2.8 km | 137.5 | 3 |
| 3 strong + 1 at 115 | 3.6 km | 133.8 | 3 |
| 3 strong + 1 at 100 | 2.4 km | 130.0 | 2 |
| 3 strong + 1 at 85 | 2.4 km | 126.3 | 2 |

The feared failure mode does not appear. The weak rider never joins the escape,
so he never lowers its `PaceEP`, and materialisation returns to the all-strong
2.4 km once he is far enough off.

The filter is not Struggle. Each attacker forms his **own** PAG, and PAGs merge
only inside the 2 s `GAP_MERGE_MAX` window. A weak attacker's PAG gains too
slowly to stay within 2 s of the strong one, so it never merges and is
reabsorbed separately.

The 2 s PAG-to-PAG merge threshold is therefore already acting as the selection
mechanism that Struggle-inside-a-PAG would otherwise provide. **The no-Struggle
V1 simplification is safer than it looked**, at least while attackers launch
independently. It stays provisional: a rider who is *added* to an existing PAG
and then weakens is still not modelled.

The non-monotonic middle row (3.6 km at EP 115) is the marginal case where the
weak rider stays within 2 s long enough to slow the group before dropping out.

---

## 5. AF7 ratified

Recorded as intended behaviour: **a normal solo rider generally cannot bridge
from a competent actively chasing peloton to an established breakaway.**

A chasing peloton runs about 80.9 s/km; a solo rider at Hard effort runs 83.9
s/km, so he loses 3.0 s/km once his burst ends. Bridging requires company or a
peloton that is not working.

---

## 6. All-out left unchanged

AF3/AF4 not re-tuned. Its niche may be breaking responses rather than winning
unopposed materialisation races, and AF1b has just shown that the response
mechanism is currently distorted by tick quantisation, so any all-out conclusion
drawn now would be drawn against a broken responder model.

Re-run AF3/AF4 after Reaction is resolved.

---

## 7. Open items after this cycle

1. **Reaction is quantised to 1.7 ticks.** Needs either a larger delay range or
   a sub-tick representation. Not chosen here.
2. **Response Energy cost of 4** produces a linear 48-Energy penalty over twelve
   responses. Shape is right; magnitude pending AF4.
3. **All-out** untouched pending item 1.
4. **No Struggle inside a PAG** stays provisional, with AF9 showing the 2 s merge
   window already filters weak followers.
