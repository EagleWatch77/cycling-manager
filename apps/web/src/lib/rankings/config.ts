import { LEAGUES, maxSeasonTours, visibleStageCount, leagueRank, type LeagueId } from '@/lib/leagues';

/**
 * League table rules (C-063). Tours and stages come from the existing league
 * rules (lib/leagues.ts), never hard-coded for Rookie only. Promotion /
 * relegation COUNTS are not approved yet: they are configurable and empty
 * (null) on purpose, so no zone is drawn until they are set.
 */
export interface LeagueTableShape {
  tours: number;
  stagesPerTour: number;
}

export function leagueTableShape(league: LeagueId): LeagueTableShape {
  return { tours: maxSeasonTours(league), stagesPerTour: visibleStageCount(league) };
}

export interface ZoneRule {
  /** Managers moving up (top N), or null = not decided. */
  promote: number | null;
  /** Managers moving down (bottom N), or null = not decided. */
  relegate: number | null;
}

/** NOT approved: every count is null, so no promotion/relegation zone exists yet. Set the numbers here once approved. */
export const ZONE_RULES: Record<LeagueId, ZoneRule> = {
  rookie: { promote: null, relegate: null },
  amateur: { promote: null, relegate: null },
  continental: { promote: null, relegate: null },
  pro: { promote: null, relegate: null },
  elite: { promote: null, relegate: null },
};

/** Which direction exists in a league (APPROVED): Rookie only up, Elite only down. */
export function leagueMoves(league: LeagueId): { up: LeagueId | null; down: LeagueId | null } {
  const i = leagueRank(league);
  return { up: league === 'elite' ? null : LEAGUES[i + 1] ?? null, down: league === 'rookie' ? null : LEAGUES[i - 1] ?? null };
}

export type Zone = 'promotion' | 'stay' | 'relegation';

/**
 * Zone of a position (1-based) in a sub-league of `total` managers. Returns null
 * (no zone) when there is no real standing or the counts are not set. Rookie
 * never gets a relegation zone and Elite never a promotion zone, whatever the
 * configured numbers say.
 */
export function zoneFor(position: number | null, total: number, league: LeagueId, rules: Record<LeagueId, ZoneRule> = ZONE_RULES): Zone | null {
  if (position == null) return null;
  const rule = rules[league];
  const moves = leagueMoves(league);
  const promote = moves.up && rule.promote != null && rule.promote > 0 ? rule.promote : 0;
  const relegate = moves.down && rule.relegate != null && rule.relegate > 0 ? rule.relegate : 0;
  if (promote === 0 && relegate === 0) return null;
  if (position <= promote) return 'promotion';
  if (relegate > 0 && position > total - relegate) return 'relegation';
  return 'stay';
}

/** World Championships concept (week numbers of the season). The system itself is not built yet. */
export const WORLD_CHAMPIONSHIP = { qualificationClosesWeek: 4, invitationsWeek: 5, eventWeek: 6 } as const;

export const MS_STATUSES = ['qualifying', 'invited', 'confirmed', 'declined', 'reserve'] as const;
export type MsStatus = (typeof MS_STATUSES)[number];
export function isMsStatus(v: unknown): v is MsStatus {
  return typeof v === 'string' && (MS_STATUSES as readonly string[]).includes(v);
}
