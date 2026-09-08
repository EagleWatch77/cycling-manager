import 'server-only';
import { ensureSeasonTransitionsProcessed } from '@/lib/calendar/seasonAging';

/**
 * The single lazy game-state entry point, called once per request from
 * AppShell (see the chat report — this used to live only in
 * app/rider/layout.tsx, which meant a player who only ever visited
 * Dashboard/Trh/Zázemie/Rebríčky and never opened their Rider tab could
 * indefinitely delay a season-end transition). AppShell renders on every
 * authenticated game page (Dashboard, Rider, Training, Market, Rankings,
 * Facilities, Team, ...), so this now runs regardless of which page a
 * player lands on first after a season boundary — never per-rider-page-load.
 *
 * Cheap by design: each lazy processor it calls (currently just season
 * aging) does its own idempotent "anything actually pending?" check first
 * and is a near-instant no-op on every request except the very first one
 * after a real transition — see ensureSeasonTransitionsProcessed()'s own
 * doc comment. Future lazy game-wide processors belong here too, not
 * scattered across individual page/layout files.
 */
export async function ensureGameStateProcessed(): Promise<void> {
  await ensureSeasonTransitionsProcessed();
}
