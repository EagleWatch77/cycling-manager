# CURRENT_TASK

## Status (2026-11-15)
Rider → Prehľad polish done (uncommitted until the owner commits via GitHub Desktop): profile header with portrait slot + league + Celkové hodnotenie; standalone score card and "Hlavné oblasti" removed; group cards with description + average; radar uses more of its card; "Silné stránky jazdca" implemented (top 3 visible skills + Pretekársky profil from existing style, DECISIONS C-034).

## Key facts
- Celkové hodnotenie = `overallRating()` (50/25/20/5, unrounded means, attribute scale). Old 0–100 `riderOverall` is legacy (the "35" the owner saw was this legacy value for a 129 rider). Market table uses `overallRating` too.
- Radar: 5 axes, expandable groups, Rozvoj = estimates only (currently all "Neznámy": no numeric scouting ranges exist) — DECISIONS C-030/C-031.
- Portrait: `RiderPortrait` shows `resolveAvatarSrc()` image if present (public/avatars/male-complete/ is currently absent -> placeholder). No portrait generation/assignment yet.

## Next
- Optional: a discipline/terrain suitability calculation (none exists; Pretekársky profil shows only the existing style).
- Numeric scouting ranges for Rozvoj. Hidden rider values are readable via Supabase API (riders_select_own incl. AI riders) — needs a view/server read before real scouting (not yet logged as O-010; ask owner).
- League/MS/balancing items: see DECISIONS OPEN (O-006..O-009). Deployment of migrations 01–03 per supabase/migrations/README.md.

## Tests
`npx tsx` on every web `*.test.ts`; `npm run typecheck`; `npm -w @cycling/web run i18n:check`.
