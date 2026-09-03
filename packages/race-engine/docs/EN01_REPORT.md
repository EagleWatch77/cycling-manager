# EN-01 report — Energy integration + post-Energy benchmarks

**PARTIALLY SUPERSEDED.** The EN-01 calibration in section 1 is still valid.
All race-outcome numbers (sections 3-4) predate the pre/post-tick work-mode fix
in `CHASE_REPORT.md` section 1 and are INVALID.

---

**No balance constant was changed.** `GROUP_PACE_EXP`, `CHASE_MAX`,
`CHASE_SAT` are untouched. `HOLDING_K = 0.40` is recorded as **PROVISIONAL**,
not canonical.

Tests: **75 / 75 passing** (15 of them EN-01). `tsc --noEmit` clean.
Full benchmark wall time: **106.3 s** (down from ~200 s, because the field no
longer fragments into twenty groups).

---

## 1. EN-01 calibration — all cases verified

| Case | Expected | Computed | Test |
|---|---:|---:|---|
| 160 km flat bunch, Safe | 23.1 | 23.120 | E-SAFE |
| 160 km flat bunch, Normal | 27.2 | 27.200 | E-NORMAL |
| 160 km flat bunch, Aggressive | 32.6 | 32.640 | E-AGGRESSIVE |
| 160 km flat bunch, All-out | 38.1 | 38.080 | E-ALL_OUT |
| 160 km flat, 5-rider break, Hard | 36.9 | 36.910 | E-BRK |
| 160 km flat, bunch, Medium chase worker | 29.9 | 29.920 | E-CHS |
| same group, passive rider | 27.2 | 27.200 | E-CHS |

Also passing: Energy never below 0; determinism with Energy active; chase
multiplier applies only to actual workers; breakaway multiplier applies only
in recognized escape mode; DESCENT burns exactly 35 % of flat; `P_ref`
immutable while Energy falls; burn applied after the tick with EP driven by
start-of-tick Energy.

---

## 2. SP-02 re-run with K = 0.40 and Energy active

| sigma | splits | first split | finish groups | largest group | Top10 spread | Energy min/med/max |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 0 | none | 1 | 40 | 0:00 | 72.8 / 72.8 / 72.8 |
| 2 | 0 | none | 1 | 40 | 0:00 | 72.8 / 72.8 / 72.8 |
| 4 | 0 | none | 1 | 40 | 0:00 | 72.8 / 72.8 / 72.8 |
| 6 | 0 | none | 1 | 40 | 0:00 | 72.8 / 72.8 / 72.8 |
| 12 | 2 | 61.2 km | 3 | 38 | 0:00 | 68.6 / 72.8 / 72.8 |

Essentially identical to the Energy-frozen run (2 splits at sigma 12, first
split 61.0 -> 61.2 km). On a neutral field with no chase and no breakaway
effort there is nothing for the work multipliers to bite on, so this is
expected. Energy lands at exactly 72.8 = 100 - 27.2.

---

## 3. B0-B4 and B6 with K = 0.40 and Energy active

### Energy

| ID | break E | peloton E | diff | E min / med / max | catch km | largest fin.grp | clamp |
|---|---:|---:|---:|---|---:|---:|---:|
| B0 | 63.1 | 71.7 | **-8.6** | 63.1 / 72.8 / 72.8 | none | 27.6 | 5.30 |
| B1 | 63.3 | 71.4 | -8.2 | 63.2 / 72.8 / 72.8 | 123.4 | 27.2 | 5.30 |
| B2 | 64.1 | 71.0 | -6.9 | 63.9 / 72.1 / 72.8 | 109.0 | 26.5 | 5.30 |
| B3 | 64.6 | 70.7 | -6.2 | 64.0 / 71.4 / 72.8 | 78.4 | 26.0 | 5.30 |
| B4 | 64.1 | 71.0 | -6.9 | 63.8 / 72.2 / 72.8 | 109.0 | 26.5 | 5.30 |

The break finishes 6 to 9 Energy below the peloton, which is the intended
cost of riding in a five-man group at Hard effort. Break 63.1 matches the
E-BRK calibration (100 - 36.9) exactly.

Clamp hits: 5.30 per run over roughly 9 600 group-ticks = **0.055 %**, inside
the 0.1 % acceptance criterion. These are dropped riders on low Energy, i.e.
the grupetto case the rail exists for.

### Race outcome

| ID | scenario | survival | maxGap p50 | maxGap p90 | splits | fin.grp | Top10 spread |
|---|---|---:|---:|---:|---:|---:|---:|
| B0 | zero chase | 100.0 % | 10:08 | 13:45 | 7.4 | 9.2 | 10:26 |
| B1 | weak chase 2x Medium | 88.7 % | 3:06 | 5:40 | 8.4 | 10.0 | 2:55 |
| B2 | normal chase 6x Medium | **44.7 %** | 0:33 | 0:34 | 11.3 | 12.3 | 0:15 |
| B3 | strong chase 12x High | **37.3 %** | 0:33 | 0:33 | 12.1 | 12.9 | 0:11 |
| B4 | coordinated 4x High | 44.7 % | 0:33 | 0:33 | 11.2 | 12.2 | 0:15 |

**B6 chaser quality sweep:**

| Chasers | survival | maxGap p50 | splits |
|---|---:|---:|---:|
| strongest 6 | 34.7 % | 0:33 | 12.3 |
| median 6 | 72.7 % | 0:33 | 8.9 |
| weakest 6 | 100.0 % | 9:11 | 7.4 |

**B5 variance sweep:** sigma 6 -> 1.5 splits / 3.5 groups / survival 100 %;
sigma 12 -> 11.3 / 12.3 / 44.7 %; sigma 20 -> 25.7 / 21.5 / 14.0 %.

**B7b:** first split 4.4 km, first divergence 4.4 km. PASS.

---

## 4. What improved, and what got worse

### Improved — fragmentation is largely solved

| Metric | before (RP = PaceEP, no Energy) | now (K = 0.40 + Energy) |
|---|---:|---:|
| splits per stage | 20 - 41 | **7.4 - 12.1** |
| finishing groups | 18 - 21 | **9.2 - 12.9** |
| largest finishing group | not tracked | **26 - 28 of 40** |
| B2 Top10 spread | 22:41 | **0:15** |

A coherent main bunch now survives the stage and the Top 10 essentially share
one Group Time, which is the stated target shape.

### Got worse — survival moved the wrong way

B2 went 19.3 % -> **44.7 %**, out the top of the 15-25 % band. B3, twelve
riders chasing All-out-adjacent at High, went 0 % -> **37.3 %**. A strong
chase should demolish a five-man break, and it no longer does.

### Both are downstream of one artefact

`maxGap p50 = 0:33` in B2, B3, B4 and in two of the three B6 cells. The break
is formed at a 30 s gap, so **it gains three seconds over 160 km and then the
race is decided by whether the peloton can claw back thirty seconds.** That is
a knife-edge, not a race, and survival percentages measured on a knife-edge
are noise dressed as data.

The cause is the harness, not the engine: there is **no race-phase model**.
Chase is applied from km 0, so the break never gets the early window in which
a real breakaway builds three to five minutes. This was flagged in the
previous report; with fragmentation fixed it is now the dominant artefact and
it blocks any meaningful reading of B2/B3.

Supporting evidence that the engine itself is behaving: B0 (100 %, 10:08),
B1 (88.7 %, 3:06) and B6-bottom (100 %, 9:11) all produce real gaps and
sensible orderings. The break only fails to gain when a competent chase is
running from the first kilometre.

---

## 5. Two harness corrections made in this cycle

**Survival redefined.** It previously checked whether the leading finishing
group consisted only of breakaway-lineage riders. After a catch, a strong
break-lineage rider can split off the merged bunch again and lead at the line,
which scored as a surviving breakaway. Survival is now `catchKm === null`,
i.e. the break was never caught. On this data set both definitions agreed, but
the old one was wrong in principle.

**Provisional-status note corrected.** The benchmark footer no longer claims
Energy is frozen.

---

## 6. Recommendation for the next cycle

Do not tune `GROUP_PACE_EXP`, `CHASE_MAX`, `CHASE_SAT` or `K` against B2/B3
until the harness has a race-phase model, because those two scenarios are
currently measuring a 30-second knife-edge. The minimum viable version is a
formation phase in which chase intensity is not applied, letting the break
build a gap, followed by a chase phase. That is a benchmark-harness decision
and a game-design one (when does a peloton decide to chase), not an engine
change, so it is not made here.

`K = 0.40` is behaving well on everything that is currently measurable:
fragmentation, Energy, Top10 grouping, and the B6 quality ordering. It stays
provisional pending that fix.
