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
