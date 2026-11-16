import type { LeagueId } from '@/lib/leagues';
import { leagueTableShape, zoneFor, ZONE_RULES, type MsStatus, type Zone, type ZoneRule } from './config';

/** A manager of one sub-league (public game data only). */
export interface TableManager {
  managerId: string;
  displayName: string | null;
  /** ISO-3166 alpha-2 of the MANAGER (profiles.country_code), or null = not stored. */
  countryCode: string | null;
  isMe: boolean;
  ms: MsStatus | null;
}

/** One stored league-point row. Bound to the manager, season and sub-league; never to a rider. */
export interface PointsRow {
  managerId: string;
  /** 'stage' fills the E columns; other kinds (tour result, jersey, achievement) are reserved and only count in the total. */
  kind: string;
  tourNo: number;
  stageNo: number | null;
  points: number;
}

/** null = the stage has not been ridden yet (dash); 0 = ridden, no points. */
export type Cell = number | null;

export interface TableRow {
  manager: TableManager;
  /** 1-based; null while there is no real standing. */
  position: number | null;
  /** [tour][stage] */
  cells: Cell[][];
  tourTotals: Cell[];
  total: number;
  zone: Zone | null;
}

export interface BuiltTable {
  rows: TableRow[];
  tours: number;
  stagesPerTour: number;
  /** True once at least one points row exists for this sub-league and season. */
  hasStandings: boolean;
}

/**
 * Builds the table. A stage counts as "ridden" when at least one points row
 * exists for it in this sub-league (so a manager without a row there has 0).
 * Totals are summed from the stored rows once, never twice. Before the first
 * result nobody is ranked: positions are null and the order is neutral
 * (by manager id), not by name, OVR or registration date.
 */
export function buildTable(
  managers: readonly TableManager[],
  points: readonly PointsRow[],
  league: LeagueId,
  rules: Record<LeagueId, ZoneRule> = ZONE_RULES,
): BuiltTable {
  const { tours, stagesPerTour } = leagueTableShape(league);
  const inShape = (p: PointsRow) => p.tourNo >= 1 && p.tourNo <= tours;
  const stageRows = points.filter((p) => p.kind === 'stage' && p.stageNo != null && inShape(p) && p.stageNo >= 1 && p.stageNo <= stagesPerTour);
  const ridden = new Set(stageRows.map((p) => `${p.tourNo}:${p.stageNo}`));
  const byManager = new Map<string, PointsRow[]>();
  for (const p of points) {
    const list = byManager.get(p.managerId) ?? [];
    list.push(p);
    byManager.set(p.managerId, list);
  }

  const raw = managers.map((manager) => {
    const mine = byManager.get(manager.managerId) ?? [];
    const cells: Cell[][] = Array.from({ length: tours }, (_, ti) =>
      Array.from({ length: stagesPerTour }, (_, si) => {
        if (!ridden.has(`${ti + 1}:${si + 1}`)) return null;
        return mine.filter((p) => p.kind === 'stage' && p.tourNo === ti + 1 && p.stageNo === si + 1).reduce((a, p) => a + p.points, 0);
      }),
    );
    const tourTotals: Cell[] = cells.map((row) => (row.every((c) => c === null) ? null : row.reduce<number>((a, c) => a + (c ?? 0), 0)));
    const total = mine.reduce((a, p) => a + p.points, 0);
    return { manager, cells, tourTotals, total };
  });

  const hasStandings = points.length > 0;
  const sorted = [...raw].sort((a, b) => (hasStandings ? b.total - a.total : 0) || a.manager.managerId.localeCompare(b.manager.managerId));
  const rows: TableRow[] = sorted.map((r) => {
    // Equal points share a position until the tie-break rules are decided.
    const position = hasStandings ? 1 + sorted.filter((o) => o.total > r.total).length : null;
    return { ...r, position, zone: zoneFor(position, managers.length, league, rules) };
  });
  return { rows, tours, stagesPerTour, hasStandings };
}

/** Home window: first five + the signed-in manager's own row below when outside them. Without a real standing only the own row is shown (no artificial top five). */
export function homeRows(table: BuiltTable, limit = 5): { row: TableRow; extra: boolean }[] {
  if (!table.hasStandings) return table.rows.filter((r) => r.manager.isMe).map((row) => ({ row, extra: false }));
  const top = table.rows.slice(0, limit).map((row) => ({ row, extra: false }));
  const me = table.rows.find((r) => r.manager.isMe);
  if (me && !top.some((t) => t.row === me)) top.push({ row: me, extra: true });
  return top;
}
