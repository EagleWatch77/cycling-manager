# CURRENT_TASK

## Status (2026-11-14)
Dashboard ("Domov") layout finished, uncommitted until the user commits via GitHub Desktop.

## Done in this task
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
