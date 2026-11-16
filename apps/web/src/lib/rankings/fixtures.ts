import type { LeagueId } from '@/lib/leagues';
import { leagueTableShape, type MsStatus, type ZoneRule } from './config';
import { buildTable, type BuiltTable, type PointsRow, type TableManager } from './table';

/**
 * DEV PREVIEW ONLY - synthetic managers and points that exist only in memory
 * (never written to any database, never used by the real pages). Deterministic.
 */
const NAMES = ['Adam K.', 'Beata L.', 'Cyril M.', 'Dana N.', 'Emil O.', 'Filip P.', 'Gabo R.', 'Hana S.', 'Ivan T.', 'Jana U.'];
const COUNTRIES = ['SK', 'CZ', 'PL', 'DE', 'FR', 'ES', 'IT', 'AT', 'HU', null];
const MS: (MsStatus | null)[] = ['confirmed', 'invited', 'qualifying', 'reserve', 'declined', null, null, null];

export function previewTable(league: LeagueId, count = 50, riddenStages = 5, rules?: Record<LeagueId, ZoneRule>): BuiltTable {
  const { tours, stagesPerTour } = leagueTableShape(league);
  const managers: TableManager[] = Array.from({ length: count }, (_, i) => ({
    managerId: `preview-${String(i + 1).padStart(2, '0')}`,
    displayName: `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`,
    countryCode: COUNTRIES[(i * 7) % COUNTRIES.length],
    isMe: i === 17,
    ms: i < 12 ? MS[i % MS.length] : null,
  }));
  const points: PointsRow[] = [];
  for (let s = 0; s < Math.min(riddenStages, tours * stagesPerTour); s++) {
    const tourNo = Math.floor(s / stagesPerTour) + 1, stageNo = (s % stagesPerTour) + 1;
    managers.forEach((m, i) => {
      const v = (i * 37 + s * 17 + (i % 5) * s) % 100;
      if (v > 22) points.push({ managerId: m.managerId, kind: 'stage', tourNo, stageNo, points: Math.round(v / 4) });
    });
  }
  return buildTable(managers, points, league, rules);
}

/** Example rules for the preview only (the real ones are NOT approved and stay empty). */
export const PREVIEW_RULES = Object.fromEntries(
  (['rookie', 'amateur', 'continental', 'pro', 'elite'] as LeagueId[]).map((l) => [l, { promote: 8, relegate: 6 }]),
) as Record<LeagueId, ZoneRule>;

/** Full Standings object around the preview table (dev preview / screenshots only). */
export function previewStandings(league: LeagueId, count = 50, ridden = 5) {
  const table = previewTable(league, count, ridden, PREVIEW_RULES);
  return {
    seasonId: 'season-2', seasonNumber: 2, seasons: [{ id: 'season-2', number: 2 }], league, number: 1, isMine: true,
    subLeagues: [{ number: 1, memberCount: count, capacity: 50, divisionId: 'preview' }],
    memberCount: count, capacity: 50, table, dataReady: true,
  };
}
