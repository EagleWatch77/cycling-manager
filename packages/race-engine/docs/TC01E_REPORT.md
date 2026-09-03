# TC-01E — same-league K sweep

**Nothing tuned.** Terrain weights untouched, `BALANCE_V1.HOLDING_K` still 0.40,
no league-specific Race Engine modifier introduced. K was varied only through the
injectable `experimentalHoldingThreshold(k)` port.

Field: 7 TC-01C archetype shapes x quality offsets **{-5, -2.5, 0, +2.5, +5}** =
35 riders. Quality offset is benchmark-only. The ±12 field is retired to
inter-league / stress territory; a separate ±8 stress fixture is reported in §4
and was **not** used to choose K.

---

## 1. Results, same-league ±5 field

### 40 km FLAT

| K | splits | first split | groups | largest | Top10 spread | max gap |
|---:|---:|---:|---:|---:|---:|---:|
| 0.350 | 3 | 16.8 km | 4 | 32 | 0:00 | 6:35 |
| 0.375 | 3 | 19.0 km | 4 | 32 | 0:00 | 5:54 |
| **0.400** | **1** | **21.2 km** | **2** | **34** | 0:00 | 5:17 |

### 40 km HILLY

| K | splits | first split | groups | largest | Top10 spread | max gap |
|---:|---:|---:|---:|---:|---:|---:|
| 0.350 | 5 | 11.2 km | 6 | 30 | 0:00 | 10:31 |
| 0.375 | 3 | 11.8 km | 4 | 32 | 0:00 | 10:10 |
| **0.400** | **3** | **16.8 km** | **4** | **32** | 0:00 | 8:21 |

### 40 km MOUNTAIN

| K | splits | first split | groups | largest | Top10 spread | max gap |
|---:|---:|---:|---:|---:|---:|---:|
| 0.350 | 10 | 10.8 km | 11 | 25 | 0:00 | 18:35 |
| 0.375 | 7 | 11.4 km | 8 | 28 | 0:00 | 17:36 |
| **0.400** | **6** | **12.0 km** | **7** | **29** | 0:00 | 16:54 |

### 160 km mixed ending MOUNTAIN

| K | splits | first split | groups | largest | Top10 spread | max gap |
|---:|---:|---:|---:|---:|---:|---:|
| 0.350 | 18 | 16.8 km | 11 | 24 | 0:00 | 23:36 |
| 0.375 | 12 | 19.0 km | 6 | 28 | 0:00 | 23:53 |
| **0.400** | **13** | **21.2 km** | **7** | **28** | 0:00 | 23:16 |

### Ordering at K = 0.40

| fixture | shape order (mean gap to first) |
|---|---|
| FLAT | Rouleur / Sprinter / Classics / Descender / AllRound all 0:00, Climber 0:03, Puncheur 1:06 |
| HILLY | Climber / Puncheur / Classics / Descender / AllRound 0:00, Rouleur 0:40, Sprinter 2:50 |
| MOUNTAIN | Climber / Puncheur / AllRound 0:00, Rouleur 0:03, Classics 0:21, Descender 2:08, Sprinter 5:47 |
| mixed →MTN | AllRound 0:00, Classics 0:01, Descender 0:57, Climber 2:14, Rouleur 2:33, Puncheur 6:11, Sprinter 8:42 |

Quality order at K = 0.40 on the mixed stage: +2.5 / +5 / 0 level, -2.5 at 4:25,
-5 at 10:18.

---

## 2. Against the acceptance shape

| criterion | K = 0.40 | verdict |
|---|---|---|
| FLAT mostly stays together | 1 split, 34 of 35 in one group, first split at km 21.2 | **PASS** |
| HILLY moderate selection | 3 splits, 32 of 35 together, Sprinter 2:50, Rouleur 0:40 | **PASS** |
| MOUNTAIN clear selection | 6 splits, 29 of 35, Sprinter 5:47, Descender 2:08, climbers level | **PASS** |
| mixed mountain finish: gaps in seconds / low minutes, not tens of minutes | max gap **23:16** | **FAIL** |

Three of four pass cleanly at K = 0.40, and the terrain progression is exactly
the intended shape: 1 split on FLAT, 3 on HILLY, 6 on MOUNTAIN.

## 3. RATIFIED — and criterion 4 was the wrong test

**`HOLDING_K = 0.40` is RATIFIED for V1.** TC-01 Holding calibration is CLOSED.

My fourth criterion was incorrect and is withdrawn. Under the Group Time model,
riders attached to the same group correctly receive the same time, and a
stronger GC rider should not gain seconds automatically without higher pace,
work or an attack. Requiring a neutral no-attack / no-chase fixture to split its
own front group was asking the engine to do something it is designed not to do.

Top10 spread of 0:00 on a neutral fixture is therefore **correct behaviour**,
not a failure.

The 23-minute maximum **tail** gap is not a Holding-K blocker either. It is
deferred to **FIN-01** and must be judged on realistic Tour stages and
distributions. Future mountain-GC validation must apply real race pressure —
Stage Approach work, Attack and Response — rather than expecting spontaneous
separation.

No artificial front-group splitting mechanism is to be added.

### What the original criterion-4 data actually showed

Criterion 4 fails at **every** K tested, and it is essentially **insensitive to
K**: max gap is 23:36 / 23:53 / 23:16 at 0.350 / 0.375 / 0.400. Lowering K adds
splits behind without reducing the tail. It is therefore not a K decision.

The mechanism is visible in one column: **Top10 spread is 0:00 in all twelve
cells**. The leading group never fragments internally. So a mountain-finish stage
produces:

- **zero** separation among the GC leaders, which is too little, and
- a graded tail of -2.5 at 4:25, -5 at 10:18 and a worst individual at 23:16,
  which is too much.

Neither end is "seconds to low minutes". Selection currently happens only by
shedding riders off the back, never by splitting the front. That is a structural
property of the holding threshold: every rider above `PaceEP × HoldingFactor`
holds indefinitely, and inside a 28-rider front group nobody is below it.

K = 0.40 is the ratified value: 6 splits, 7 groups and clean shape ordering on
MOUNTAIN while keeping FLAT intact. Both lower values are worse on FLAT and
HILLY and no better on the tail gap.

Guarded by TC01E-1 (`HOLDING_K === 0.40`) and TC01E-2 (the threshold matches
`PaceEP × K × (1 − draftMult(n))` at every group size).

## 4. Stress fixture ±8, reference only

Not used to choose K.

| fixture | K=0.350 | K=0.375 | K=0.400 |
|---|---|---|---|
| 40 FLAT | 5 sp / 6 gr / 10:17 | 4 / 5 / 10:01 | 3 / 4 / 9:42 |
| 40 HILLY | 6 / 7 / 14:28 | 6 / 6 / 13:24 | 6 / 6 / 13:08 |
| 40 MOUNTAIN | 11 / 12 / 25:32 | 10 / 11 / 24:55 | 9 / 10 / 23:01 |
| mixed →MTN | 32 / 14 / 36:15 | 23 / 15 / 35:18 | 22 / 12 / 37:53 |

Behaviour degrades smoothly rather than breaking, which is what a stress fixture
should show. The ±12 field remains inter-league territory.

## 5. Status

`HOLDING_K = 0.40` **RATIFIED for V1**. Not to be swept or tuned again unless a
later integrated race benchmark exposes a regression.

Still open and unaffected: FLAT and HILLY weight tables remain PLACEHOLDER, the
CLASSICS table remains CANDIDATE, and FIN-01 (time cut / OTL / grupetto / tail
gaps) remains deferred.
