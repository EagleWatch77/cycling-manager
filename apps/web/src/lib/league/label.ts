import 'server-only';
import type { T } from '@/i18n/config';
import { getMyLeague } from '@/lib/facilities/repository';
import { ensureMyDivision } from './repository';
import { divisionCode } from './divisions';

/**
 * The player's real league and its display label ("Rookie 1.1"), shared by
 * AppShell and the rider profile header so both always show the same text.
 * Falls back to the plain league name when the sub-league tables are not
 * available (same behaviour AppShell had before).
 */
export async function getMyLeagueLabel(t: T): Promise<{ league: string; leagueLabel: string }> {
  const division = await ensureMyDivision();
  const league = division?.league ?? (await getMyLeague());
  const leagueLabel = division ? `${t(`league.${division.league}`)} ${divisionCode(division.number)}` : t(`league.${league}`);
  return { league, leagueLabel };
}
