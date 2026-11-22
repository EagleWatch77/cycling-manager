# Cycling Manager

Browser cycling-manager MMO. npm-workspaces monorepo:
- `apps/web` — Next 15, React 19, Tailwind 3, Supabase, i18n (sk, en, cs, de, es, fr, pl)
- `packages/race-engine` — pure TypeScript, no UI/DB/auth imports
- `supabase/schema.sql` — database schema
Deployed on Vercel from GitHub.

## Commands
- `npm run typecheck` (engine + web)
- `npm run engine:test`
- `npm run web:build`
- `npm -w @cycling/web run i18n:check`

## Session protocol (save tokens)
1. Read `docs/CURRENT_TASK.md` first. Read nothing else unless the task needs it.
2. For project-wide context (state, decisions, open items) read `docs/BIBLIA_PROJEKTU.md`. On demand only: `docs/GAME_DESIGN.md` (mechanics), `docs/DESIGN_SYSTEM.md` (UI), `docs/DECISIONS.md` (decisions).
3. Use Grep/Glob and targeted reads. Never scan the whole repo; never re-read files already in context.
4. Before ending: overwrite `docs/CURRENT_TASK.md` (do not append); log new decisions in `docs/DECISIONS.md`.

## Rules
- Small, scoped tasks. If a change touches more than one file: show a plan, wait for approval.
- Do not rewrite working code, change game mechanics or change existing UI without approval. Keep the stack.
- Never invent mechanics. Authority order: ratified engine docs and code comments > `docs/DECISIONS.md` > `docs/GAME_DESIGN.md`. The old v9 spec is historical input, not authority. Conflict or gap: ask.
- Many numbers are `BALANCE_PLACEHOLDER` (e.g. facilities). Never present them as final.
- Race-engine decisions live in `packages/race-engine/docs/DESIGN_GAPS.md`. Link to them, never copy.
- UI: reuse `apps/web/src/components/ui/*` and the Tailwind tokens (`docs/DESIGN_SYSTEM.md`). No new hex colors, no new visual style.
- New player-facing text uses i18n keys in all 7 languages; run `i18n:check`.
- `race-engine` must not depend on `apps/web`.
- No secrets in git; env vars live on Vercel.

## Delivery
User deploys via GitHub Desktop. For code changes deliver a zip plus a ready-to-paste commit (one-line Summary + short bulleted Description). Talk to the user in Slovak.
