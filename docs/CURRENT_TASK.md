# CURRENT_TASK

Rules: overwrite this file at the end of every session, keep it under ~40 lines, no history. A new session must be able to continue from this file alone.

## Task
Set up long-term working docs for Claude Code (docs only; no mechanics or UI changes).

## State (2026-11-07)
- Created: `CLAUDE.md`, `docs/GAME_DESIGN.md`, `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `docs/CURRENT_TASK.md`.
- Content comes only from code, code comments and engine docs. Gaps are marked `[CHÝBA]` / OPEN.
- Not yet committed to the repo (delivered as a zip; owner commits via GitHub Desktop).

## Next (smallest first)
1. Owner commits the 5 files.
2. Owner answers DECISIONS O-001 (what changed since v9). Then update GAME_DESIGN and DECISIONS.
3. Fill one `[CHÝBA]` section at a time (market, finances, scoring...), reading only that code.
4. Review the P-001..P-004 proposals; apply only approved ones.

## Do not
- Change game mechanics, existing UI or working code without approval.
- Invent mechanics; ask instead.

## Verify
`npm run typecheck`, `npm run engine:test`, `npm -w @cycling/web run i18n:check` (docs-only change needs none).

## Pointers (read only if needed)
- Engine: `packages/race-engine/README.md`, `packages/race-engine/docs/DESIGN_GAPS.md`
- UI: `apps/web/tailwind.config.ts`, `apps/web/src/components/ui/`
- Config sources: `lib/leagues.ts`, `lib/rider/config.ts`, `lib/training/config.ts`, `lib/facilities/config.ts`
