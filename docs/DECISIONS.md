# DECISIONS

Status labels: **CONFIRMED** (stated by owner, ratified in docs, or fixed in code), **PROPOSAL** (suggested, needs approval), **OPEN** (unanswered question).
Entry format: `ID — statement. Source.` Dates are given only when known. Do not delete entries; mark them SUPERSEDED with a pointer.
Race-engine decisions are NOT copied here, see "Engine pointers".

## CONFIRMED
- C-001 — Monorepo with `apps/web` and `packages/race-engine`. The engine is pure TypeScript with no UI/DB/auth imports and no dependency on `apps/web`. Source: `packages/race-engine/README.md`, `apps/web/src/lib/rider/config.ts`.
- C-002 — Stack stays: Next.js, React, Tailwind, Supabase, Vercel (deploy via GitHub Desktop push). Source: owner.
- C-003 — i18n ids are language-neutral; labels come from keys (e.g. `league.<id>`). 7 languages; validated by `i18n:check`. Source: `lib/leagues.ts`, `src/i18n`.
- C-004 — Facility effects have one canonical source, `lib/facilities/config.ts`. All facility prices and numbers are `BALANCE_PLACEHOLDER` until the Financie system exists. Source: that file.
- C-005 — Training Center affects Performance training only; age-band multipliers are not summed (rider gets the multiplier of own band). Technical Center is a separate system. Source: `lib/facilities/config.ts`.
- C-006 — Weekly training: one plan per rider per week, Performance or Technical; Performance 1/2/3 sessions (light/normal/hard); Technical always 1 session, max +1 attribute point per plan; Tactics is not trainable by training. Source: `lib/training/config.ts`.
- C-007 — League UX: stages above a league's visible count do not exist in the UI (no locked/greyed state). Source: `lib/leagues.ts`.
- C-008 — Season transitions are processed lazily and idempotently via `AppShell` → `ensureGameStateProcessed()`. Source: `lib/gameState.ts`.
- C-009 — Premium/admin rights are checked server-side from DB rows, never from client flags. Source: `lib/premium/entitlement.ts`.
- C-010 — Rookie starter rider: base 130 ± 5, attribute noise ± 3. Source: `lib/rider/config.ts` (marked "decision").
- C-011 — `breakawaySkill` (rider ability) is unrelated to engine `BreakawayEffort`; never confuse them. Source: `lib/rider/config.ts`.
- C-012 — 2026-11-07: documentation structure approved (`CLAUDE.md`, `docs/GAME_DESIGN.md`, `DESIGN_SYSTEM.md`, `DECISIONS.md`, `CURRENT_TASK.md`). CLAUDE.md in English, GAME_DESIGN.md in Slovak. Source: owner.
- C-013 — 2026-11-07: the v9 spec is not the sole source of truth; some decisions changed later. Source: owner.
- C-014 — 2026-11-07: no changes to game mechanics or existing UI during the docs setup. Source: owner.

## CONFIRMED — approved concept, NOT IMPLEMENTED
World Championships (MS) V1. Approved by owner 2026-11-14; implementation postponed until leagues/sub-leagues, scoring and scheduled jobs exist. Full text: `GAME_DESIGN.md` section 10.
- C-015 — MS happen every season in week 6, one per league (Rookie, Amateur, Continental, Pro, Elite). One single-day race (not a stage Tour), mixed terrain (flat, hills, climbs); the profile may change by season. MS do not count toward the league Tour limit. Participation is voluntary and by invitation only. Nationality does not affect qualification. Olympics, continental championships and other special races are out of scope.
- C-016 — Qualification: at the end of week 4 an immutable snapshot of the league standings per sub-league (season, league, sub-league, rider, manager, rank, points). Week-5 results never change nomination. Per sub-league: top 35% of eligible active riders are direct entrants, next 15% are reserves; both rounded up; reserves never exceed the remaining eligible riders (10→4+2, 20→7+3, 30→11+5, 40→14+6, 50→18+8). The snapshot must reflect results valid at the end of week 4 even if processed late.
- C-017 — Invitations: sent Monday of week 5 to direct entrants and reserves; each may accept or decline. Direct: accept = guaranteed spot, decline frees it. Reserve: accept = agrees to start if a spot frees up (not a guarantee); once promoted no re-confirmation. A freed spot goes to the next reserve by rank who already accepted; a higher-ranked undecided reserve must not be overtaken before the deadline (spot stays reserved).
- C-018 — Deadline: Friday of week 5, proposed end of Friday UTC game time (exact boundary to be defined at implementation). After it: unconfirmed invitations expire, no confirmation = not participating, freed spots filled by confirmed reserves in rank order (declined/unconfirmed skipped); if too few confirmed reserves the start list stays smaller; nobody starts without own consent; declining/expiry has no penalty (points, money or otherwise).
- C-019 — Championships: each league has its own MS; riders of different sub-leagues of one league race together. Above a configurable capacity (preliminary 100 per championship) the field is split into several championships (MS Rookie A, B, C...), evenly by count and by qualification rank so top riders are not concentrated (80→1; 120→2×60; 250→3×83–84; 500→5×100). Each championship has its own winner and world-champion title; no joint final yet. Elite has one sub-league, hence one championship. Race-engine field-size limits are NOT yet verified.
- C-020 — MS dashboard states: before qualification (MS, week 6, qualification at end of week 4); direct invitation (congratulations, rank, deadline, Accept/Decline); reserve invitation (reserve rank, conditions, Accept/Decline, then "waiting for a free spot"); after promotion (spot gained, "participation confirmed"); after deadline (assigned championship and date, or "not participating"). MS are shown in the calendar to players without an invitation too.
- C-021 — MS scope excluded for now: race simulation, results and titles, rainbow jerseys, rewards/bonuses/points, new training/energy/recovery mechanics.

## CONFIRMED — leagues and sub-leagues V1 (2026-11-14, implemented; needs DB migration deployed)
- C-022 — Five leagues: Rookie, Amateur, Continental, Pro, Elite. Each sub-league has at most 50 players. Sub-leagues are labelled `<League> 1.<n>` (Rookie 1.1, Rookie 1.2, ...) and are equal in strength; the number says nothing about rank. Elite has at most one sub-league, Elite 1.1 (50 players). Other sub-leagues are created on demand; no empty sub-leagues are created in advance.
- C-023 — A new player always starts in Rookie, placed in the lowest-numbered Rookie sub-league with a free spot; if all are full a new one is created. The player joins the CURRENT global season and week (no personal "Season 1"). A Tour that already started cannot be joined late; the player prepares for the next available Tour.
- C-024 — Test accounts may be assigned to sub-leagues; game progress is reset before the official launch.
- C-026 — Tour selection: a Tour whose week has started (or passed) cannot be joined; already-selected Tours stay selected. Enforced in `getSelectionState` and `registerForTour`. Source: owner 2026-11-14.
- C-025 — Not decided / out of scope for league V1: promotion and relegation (and counts), inactivity and removal rules, scoring and tie-breaks, MS, cron/automatic race processing, race engine.

## Engine pointers (read there, do not copy)
`packages/race-engine/docs/DESIGN_GAPS.md` sections: HoldingFactor model (K = 0.40 ratified), Struggle dead zone (canonical), SP-01 (ratified), EN-01 (energy, working V1), AF-01 (attacks, closed), FIN-01 (deferred), TC-01 (closed), EP-01 (open, non-blocking).
Index of reports: `packages/race-engine/README.md`.

## PROPOSALS
- P-001 — Design-system proposals P-D1..P-D3 in `DESIGN_SYSTEM.md`.
- P-002 — Review and, if agreed, remove temporary UI (`avatar-test-temp`, `RiderAvatarTest`, `admin/test-peloton`). Not touched so far.
- P-003 — Plugins for this project: keep claude-md-management, superpowers, code-review; enable context7; Playwright on demand; disable claude-memory (duplicates CLAUDE.md/docs), productivity and website-design; skip Serena. Estimate, not measured.
- P-004 — Enforce i18n keys for all existing text too (currently only required for new text).

## OPEN
- O-001 — Which v9 spec decisions changed later, and what is the current rule?
- O-002 — Rules for market/transfers, finances, staff, team, scouting, rankings, race scoring and rewards (code exists, rules not documented).
- O-003 — Tuning of leagues above Rookie (season Tour limit is a placeholder).
- O-004 — Is `race-engine` already wired into the web race flow? Not verified.
- O-005 — Wiring `breakawaySkill` and `wetHandling` into engine math (separate engine-side change, per code comment).
- O-006 — MS prerequisites not defined: who counts as an "eligible active" rider; behaviour on tied points and riders without results at qualification; whether the race engine supports 100-rider fields; real scheduled-job mechanism (none exists, only lazy `AppShell` processing); exact deadline boundary.
- O-007 — `profiles` is updatable by the player under RLS including the `league` column (no column restriction). League must become server-controlled before leagues matter for gameplay.
