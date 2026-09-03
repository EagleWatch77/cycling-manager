# Benchmark report — race-engine 0.1.0

**SUPERSEDED.** All numbers in this report predate the pre/post-tick work-mode
fix described in `CHASE_REPORT.md` section 1 and are INVALID. Retained for history only.

---

Run before any balance constant was changed, as instructed. **No constant in
`BALANCE_V1` has been modified.**

Configuration: field 40, break 5, stage 160 km flat, `v_ref = 42`,
`P_ref = 130`, `SmallVariance = 0`, `RequiredPerformance = PaceEP` (RP-01
canonical). 150 runs per scenario; the seed varies the FIELD, not in-race
noise, because SmallVariance is zero.

Tests: **54 / 54 passing.** `tsc --noEmit` clean.

---

## 1. Harness bug found and fixed before these numbers

The first run showed identical results for B0 and B1, which is impossible if
chase does anything. Cause was in the benchmark harness, not the engine: the
break and the peloton were both started at `timeSec = 0`, so the merge rule
(`gap <= 2 s`) fused them in the very first tick and no breakaway ever
existed. Every scenario was silently measuring a single 40-rider bunch.

Fixed by adding `initialGapSec` and forming the break at a 30 s gap, i.e.
already past the 16 s recognized-escape threshold. All numbers below are post
fix.

---

## 2. Chase mechanics — ACCEPTANCE CRITERIA MET

| ID | Scenario | Survival | maxGap p50 | maxGap p90 | Target | Verdict |
|---|---|---:|---:|---:|---|---|
| B0 | zero chase | **100.0 %** | 8:16 | 12:30 | notably above B2, not forced | PASS |
| B1 | weak chase 2x Medium | 98.0 % | 6:09 | 10:28 | well above target | PASS |
| B2 | normal chase 6x Medium | **16.7 %** | 15:48 | 28:27 | **15-25 %** | **PASS** |
| B3 | strong chase 12x High | 0.0 % | 9:07 | 17:19 | low single digits | PASS |
| B4 | coordinated 4x High (team) | 20.0 % | 17:35 | 29:50 | same mechanic as B2/B3 | PASS |

**B6 — chaser quality sweep** (6x Medium, identical field, only *which* riders
chase changes):

| Chasers | Survival | maxGap p50 | splits |
|---|---:|---:|---:|
| strongest 6 | **0.0 %** | 3:01 | 40.1 |
| median 6 | 74.7 % | 8:21 | 27.1 |
| weakest 6 | **100.0 %** | 8:11 | 22.1 |

Worker quality is decisive, which is exactly what R1 was for. Same count, same
intensity, survival swings from 0 % to 100 %.

**B7b — split-onset divergence:** first split at 3.6 km, first divergence at
3.6 km. Divergence never precedes the first split. PASS.

**B9 / B7a / B8** (pace-level, from `bench/run.ts`): neutral front group rides
exactly `42.000000000` km/h; pace purity `|Δv| = 0.000e+0`; escape freeloading
penalises strong riders saving more than weak riders saving. All PASS.

Conclusion: **the Group Pace model, the chase saturation and the R1 quality
weighting all behave as designed and hit their targets.**

---

## 3. SP-02 — Struggle fragmentation cascade — DOES NOT MEET TARGETS

Every scenario above also produced:

| Metric | Observed | §24 target |
|---|---:|---|
| split events per stage | 22 - 41 | not specified, but this is ~1 per rider |
| finishing groups (40 riders) | **~20** | not specified |
| Top-10 GC spread, ONE stage | **8 - 28 min** | 2-4 min over a whole 5-stage Tour |
| max gap p50 | 6 - 17 min | 3-5 min normal |

A 40-rider field ends a single flat stage split into roughly twenty groups.

### Isolated mechanism

Controlled sweep, single bunch, no chase, uniform EP spread of ±sigma:

| sigma | EP range | splits | finishing groups | first split | spread |
|---:|---|---:|---:|---:|---:|
| 0 | 130.0 - 130.0 | **0** | **1** | none | 0.0 min |
| 1 | 129.0 - 131.0 | 21 | 22 | 71.2 km | 3.6 min |
| 2 | 128.0 - 132.0 | 29 | 30 | 45.2 km | 7.7 min |
| 4 | 126.0 - 134.0 | 34 | 32 | 21.2 km | 16.4 min |
| 8 | 122.0 - 138.0 | 36 | 31 | 10.0 km | 32.9 min |
| 12 | 118.0 - 142.0 | 37 | 31 | 6.2 km | 50.1 min |

A field where the strongest and weakest rider differ by **2 EP points, under
1.6 %**, shatters into 22 groups.

The engine is doing exactly what it was told. The cascade has two independent
causes.

### Cause A — a mean is not a survivable threshold

`RequiredPerformance(G) = PaceEP(G)`, and in ESCAPE/NEUTRAL mode
`PaceEP = mean(EP of attached members)`. By construction roughly half of any
group sits below its own mean and is therefore in permanent deficit.

Worse, it is self-reinforcing: when the below-mean riders split, the mean of
the remaining group **rises**, pushing the next tranche into deficit. The
fixed point of this rule is a field of singleton groups, which is precisely
what the sweep shows (sigma = 0 gives one group; any sigma > 0 gives ~30).

Exploratory diagnostic, nothing committed, same field, no chase:

| RP rule | sigma 4: splits / groups / spread | sigma 12: splits / groups / spread |
|---|---|---|
| mean (canonical) | 34 / 32 / 16.4 min | 37 / 31 / 50.1 min |
| p25 of group | 24 / 25 / 14.0 min | 31 / 32 / 44.9 min |
| p10 of group | 10 / 11 / 10.1 min | 15 / 16 / 32.0 min |
| min of group | **0 / 1 / 0.0 min** | **0 / 1 / 0.0 min** |

Lowering the percentile monotonically reduces fragmentation. `min` eliminates
it entirely but also eliminates all attrition, so it is not the answer either.
This is a design decision and I am not making it.

### Cause B — spec §07 has an uncovered band

The table reads:

| Effective deficit vs Required | Struggle / km |
|---:|---:|
| 0 alebo lepšie | 0 / recovery |
| -1 az -3 | +4 |

**Deficits strictly between 0 and 1 are not covered by either row.** The
implementation currently maps `(0, 3] -> +4/km`, i.e. no dead zone. A rider
0.05 EP below the group mean therefore accumulates 4 struggle/km and splits
after exactly 25.0 km.

The alternative reading is a dead zone: `[0, 1) -> 0`. Which reading is
intended is a specification question, and it matters a lot at small deficits,
which is exactly the regime a mean-based threshold generates.

---

## 4. What I did not do

- No balance constant changed.
- No RP rule changed. The percentile table above is a diagnostic, run through
  the injectable port, with nothing written to the engine.
- No dead zone added to the Struggle table.

## 5. The two questions that need answering

1. **Should `RequiredPerformance` be a central tendency at all?** A threshold
   at the mean is unachievable for half the group by definition. If attrition
   is meant to shed the weakest tail rather than half the bunch, the threshold
   needs to sit below the centre, or the deficit needs to be scaled rather
   than absolute.

2. **Does spec §07 intend a dead zone for deficits below 1 EP point?** The
   table does not cover `(0, 1)`.

Both change balance materially, so neither is mine to pick.

---

## 6. Performance (unchanged, still comfortable)

| Metric | Value |
|---|---:|
| single stage, 45 riders, 800 ticks, p50 | 28.9 ms |
| single stage p95 | 43.0 ms |
| race-day batch, 25 simulations | 745 ms |
| replay timeline payload, one stage | 353 KiB raw JSON |
| clamp hits, normal scenarios | 0 |
| full B0-B9 suite wall time | ~200 s |
