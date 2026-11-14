# CURRENT_TASK

## Status (2026-11-14)
Dashboard ("Domov") layout finished, uncommitted until the user commits via GitHub Desktop.

## Top bar (2026-11-14)
TopStatusBar reworked: left = next registered Tour + real dates (else page title); right = season/week, bell (no badge), language, profile menu (name, league, sign-out). Budget/energy/form/mock notifications removed. AppShell reads registrations, profiles.display_name, league. Keys top.budget/energy/form removed; top.nextTour, top.profile added.
Not done: bell has no notification system behind it; sidebar still uses mock PLAYER.league and shows season info; sidebar is not responsive on mobile.

## Game time + calendar card (2026-11-14)
Game time = server UTC date vs SEASON_ONE_START (2026-08-17), 10 weeks x 7 days, same for all players; lib/calendar/season.ts unchanged. format.ts now pins timeZone UTC. SeasonCalendarCard: date, season, week x/10, 10-week axis (current highlighted, tooltip date ranges, tour markers), Tour 1..3 slots from real registrations.
OPEN: data/tourSchedule.ts has season-1 entries only -> from 2026-10-26 (season 2) no Tours are scheduled, slots stay empty. tour_registrations is unique(rider_id, tour_id) without season, so reusing tours in season 2 needs a decision (schema change). Awaiting owner decision.

## Done in dashboard task
- Top row: compact Season calendar (4/12) + wider Next races with ElevationProfile (8/12).
- Bottom: Rider | Manager tasks + Training overview | Standings + Bike equipment (1/2/3 cols responsive).
- Cards take `className`; `CardLink` got `href`; `EmptyState` got `compact`.
- New: `ManagerTasksCard`, `TrainingOverviewCard`. `EquipmentCard` now shows real bike condition.
- 12 new i18n keys + `tour.next` / `standings.title` renamed, all 7 locales.

## Real data
Training plan/last training (training_plans), bike condition, season calendar, rider card.
Manager tasks = reminders derived from that state (no task system exists).

## Still not wired
- Standings: empty state (no processed race results yet).
- Next race card: DANUBE_TOUR mock (shared content); weather is static.
- Visual check in browser not done (sandbox: no build, Google Fonts blocked).

## Next
- Check dashboard on Vercel preview (desktop/tablet/mobile).
- Decide: keep derived Manager tasks or pure empty state.
