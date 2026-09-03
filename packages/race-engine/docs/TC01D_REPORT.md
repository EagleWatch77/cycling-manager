# TC-01D — combined archetype shape + quality spread, K sweep

**Nothing tuned.** FLAT, HILLY, MOUNTAIN, DESCENT, the CLASSICS candidate,
`HOLDING_K`, Energy and Group Pace are all unchanged. K was varied only through
the injectable `experimentalHoldingThreshold(k)` port; `BALANCE_V1.HOLDING_K` is
still 0.40.

Field: 7 TC-01C archetype shapes x quality {-12, -6, 0, +6, +12} = **35 riders**.
The quality offset is a benchmark-only global shift and is not a game mechanic.
Stage Approach Normal, weather 1.00, SmallVariance 0, Fatigue off, no attacks,
no chase.

---

## 1. 40 km FLAT

| K | splits | first split | groups | largest | Top10 spread | max gap |
|---:|---:|---:|---:|---:|---:|---:|
| 0.300 | 11 | 6.0 km | 12 | 24 | 0:00 | 15:20 |
| 0.325 | 11 | 6.0 km | 12 | 24 | 0:00 | 15:11 |
| 0.350 | 10 | 6.2 km | 11 | 25 | 0:00 | 14:56 |
| 0.375 | 8 | 6.6 km | 9 | 27 | 0:00 | 14:30 |
| 0.400 | 6 | 6.8 km | 7 | 29 | 0:00 | 14:14 |

Shape order at K=0.40: Rouleur 0:00, Sprinter 0:00, Classics 0:01, AllRound
0:37, Descender 1:30, Climber 3:42, Puncheur 4:33.
Quality order at K=0.40: +6 and +12 level, 0 at 0:01, -6 at 2:08, **-12 at 5:16**.

## 2. 40 km HILLY

| K | splits | first split | groups | largest | Top10 spread | max gap |
|---:|---:|---:|---:|---:|---:|---:|
| 0.300 | 12 | 4.8 km | 13 | 23 | 0:00 | 20:10 |
| 0.325 | 11 | 5.8 km | 12 | 24 | 0:00 | 19:21 |
| 0.350 | 11 | 5.8 km | 12 | 24 | 0:00 | 19:12 |
| 0.375 | 10 | 6.0 km | 11 | 25 | 0:00 | 18:56 |
| 0.400 | 9 | 6.2 km | 10 | 26 | 0:00 | 18:38 |

Shape order at K=0.40: Climber 0:00, Puncheur 0:00, AllRound 0:46, Classics
1:27, Descender 2:50, Rouleur 4:52, Sprinter 7:12.

## 3. 40 km MOUNTAIN

| K | splits | first split | groups | largest | Top10 spread | max gap |
|---:|---:|---:|---:|---:|---:|---:|
| 0.300 | 21 | 4.6 km | 22 | 14 | 0:00 | 35:41 |
| 0.325 | 17 | 4.8 km | 17 | 18 | 0:00 | 34:52 |
| 0.350 | 15 | 5.8 km | 16 | 20 | 0:00 | 33:19 |
| 0.375 | 15 | 5.8 km | 16 | 20 | 0:00 | 32:49 |
| 0.400 | 10 | 6.0 km | 11 | 25 | 0:00 | 31:52 |

Shape order at K=0.40: Climber 0:00, AllRound 0:01, Puncheur 0:01, Rouleur
7:00, Classics 7:31, Descender 9:44, Sprinter 13:00.

## 4. 160 km mixed ending MOUNTAIN (FLAT 60 / HILLY 40 / CLASSICS 30 / MTN 30)

| K | splits | first split | groups | largest | Top10 spread | max gap |
|---:|---:|---:|---:|---:|---:|---:|
| 0.300 | 57 | 6.0 km | 20 | 5 | 9:13 | 73:43 |
| 0.325 | 56 | 6.0 km | 23 | 6 | 5:42 | 68:54 |
| 0.350 | 49 | 6.2 km | 19 | 8 | 1:28 | 66:59 |
| 0.375 | 46 | 6.6 km | 19 | 11 | 0:00 | 64:24 |
| 0.400 | 41 | 6.8 km | 18 | 14 | 0:00 | 62:53 |

Quality order at K=0.40: +12 0:00, +6 2:08, 0 13:34, -6 32:34, **-12 48:44**.

## 5. 160 km mixed ending FLAT (MTN 30 / HILLY 40 / CLASSICS 30 / FLAT 60)

| K | splits | first split | groups | largest | Top10 spread | max gap |
|---:|---:|---:|---:|---:|---:|---:|
| 0.300 | 48 | 4.6 km | 20 | 8 | 7:12 | 76:45 |
| 0.325 | 46 | 4.8 km | 21 | 8 | 3:49 | 76:58 |
| 0.350 | 43 | 5.8 km | 17 | 11 | 0:00 | 74:14 |
| 0.375 | 40 | 5.8 km | 17 | 13 | 0:00 | 73:01 |
| 0.400 | 31 | 6.0 km | 16 | 15 | 0:00 | 71:34 |

---

## 6. What the sweep says

**Terrain ordering is correct at every K.** Splits go FLAT < HILLY < MOUNTAIN
consistently (at K=0.40: 6 < 9 < 10; at K=0.30: 11 < 12 < 21), and shape
ordering is right on every terrain: Rouleur tops FLAT, Climber tops HILLY and
MOUNTAIN, and the Sprinter is last on both climbing terrains. The engine is
discriminating in the intended direction.

**But no K in the swept range meets the stated goals.** Against the five
criteria:

| goal | result |
|---|---|
| large peloton on FLAT | **FAIL at every K** — 6-11 splits, 7-12 groups, first split by km 6.8, max gap 14 min on 40 km of flat |
| moderate HILLY selection | **FAIL** — direction right, magnitude far too high (9-12 splits, 10-13 groups) |
| clear MOUNTAIN selection | **PASS** — 10-21 splits, most of any terrain |
| meaningful GC gaps on a mountain finish | **FAIL** — 62-74 min max gap, quality -12 finishing 49 min down, not "meaningful" but catastrophic |
| flat-finish mixed does not fragment | **FAIL** — 31-48 splits, 16-21 groups |

Monotone in K everywhere: higher K always means fewer splits, larger groups and
smaller gaps. There is no interior optimum in 0.30-0.40; every criterion except
MOUNTAIN wants a K above the top of the range.

## 7. Why the sweep cannot converge

```
tolerance = mean x K x 0.20 + 1
```

| K | tolerance |
|---:|---:|
| 0.300 | 8.80 EP |
| 0.325 | 9.45 EP |
| 0.350 | 10.10 EP |
| 0.375 | 10.75 EP |
| 0.400 | 11.40 EP |

The quality axis alone puts a -12 rider **12 EP below the field mean by
construction**, before shape contributes anything. That exceeds the tolerance at
every K in the sweep, so the -12 tier splits unconditionally in all 25 cells.
That is exactly what the quality-order rows show.

- To hold a rider who is purely -12 quality with neutral shape: **K >= 0.423**.
- To hold -12 quality combined with the worst MOUNTAIN shape (Sprinter, -11.4 EP
  below mean in TC-01C): **K >= 0.862**, which would eliminate selection
  everywhere.

So the fixture spans up to ~23 EP of deficit on a single terrain. No holding
threshold can absorb that and still select anyone.

**The sweep therefore does not answer "which K".** It answers: the benchmark
field is over-dispersed for any K.

## 8. What I did not do

No constant changed, no weight changed, no further implementation. Stopping
here as instructed.

The question I would put before another sweep is not about K but about the
fixture: **what overall-quality spread should riders inside one league actually
have?** A +/-12 global offset on a 130 baseline means the weakest rider in the
field is 9 % worse at everything, which is plausibly a between-league gap rather
than a within-league one, and leagues race separately. If intra-league spread is
meant to be nearer +/-5 EP, the tolerance at K = 0.35-0.40 would sit comfortably
above the quality axis and the sweep would then be measuring shape selection,
which is what it was meant to measure.
