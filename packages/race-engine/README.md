# @cycling/race-engine 0.1.0

Pure TypeScript. **No Next.js, Supabase, database, authentication or UI.**

```bash
npm install
npx tsx cli.ts test        # 139 unit tests
npx tsx bench/validate.ts  # 180 s validation (SCENARIO=B2 RUNS=2000)
npx tsx bench/report.ts    # aggregate the validation output
npx tsx bench/af.ts        # AF0-AF9 attack benchmarks
npx tsx bench/af1d.ts      # corrected NORMAL vs ALL_OUT Reaction sweep
npx tsx bench/tc01b.ts     # integrated terrain benchmark (stress construction)
npx tsx bench/tc01c.ts     # corrected terrain benchmark, realistic profiles
npx tsx bench/tc01d.ts     # K sweep, archetype shape + quality spread
npx tsx bench/chase.ts   # chase vs established breakaway (PRIMARY)
npx tsx bench/sp02.ts    # holding-threshold sweep
npx tsx bench/race.ts    # 30 s fixture — DIAGNOSTIC ONLY
```

## Reports

| Doc | Status |
|---|---|
| `docs/TC01E_REPORT.md` | **current** — same-league K sweep |
| `docs/TC01D_REPORT.md` | K sweep with archetype + quality spread |
| `docs/TC01C_REPORT.md` | CLASSICS candidate, realistic-profile benchmark |
| `docs/TC01_REPORT.md` | first terrain diagnostics |
| `docs/AF01G_REPORT.md` | tick EP consistency; AF-01 CLOSED |
| `docs/AF01F_REPORT.md` | EffortWindow persistence |
| `docs/AF01E_REPORT.md` | launch causality, interpolated interception |
| `docs/AF01D_REPORT.md` | same-tick Response transition |
| `docs/AF01C_REPORT.md` | sub-tick Reaction, target interception |
| `docs/AF01B_REPORT.md` | versioning, Reaction diagnostic, AF5b, AF9 |
| `docs/AF01_REPORT.md` | AF-01 implemented, A01-A14 + AF0-AF8 |
| `docs/AF01_ATTACK_PROPOSAL.md` | the proposal AF-01 was built from |
| `docs/VALIDATION_REPORT.md` | current — 10 000-run validation, Energy split-tick fix |
| `docs/CHASE_REPORT.md` | current — chase vs established breakaway, + pre-tick bug fix |
| `docs/SP02_REPORT.md` | current for the K sweep; its B0-B4 table is superseded |
| `docs/EN01_REPORT.md` | calibration valid; race outcomes superseded |
| `docs/BENCHMARK_REPORT.md` | superseded, history only |
| `docs/DESIGN_GAPS.md` | current |

## Open items

- `HOLDING_K = 0.40` — **RATIFIED for V1** (TC-01E). Do not re-sweep without an integrated-benchmark regression.
- FLAT/HILLY skill weights are unvalidated placeholders; CLASSICS is a CANDIDATE table
- FIN-01 — stage time cut / OTL / grupetto / tail gaps, deferred non-blocking; needs realistic Tour stages with race pressure
- EP-01 — SmallVariance amplitude unspecified; currently zero
- EN-01 — gradient terrain multipliers, weather table, Fatigue still open
- Attack, Response, Reaction and merge values ACCEPTED as working V1 (AF-01 CLOSED)
- The 60 % latch figure is a fraction of deterministic benchmark cells, NOT an RNG probability
- No Struggle inside a PAG — provisional; AF9 shows the 2 s merge window filters weak followers
