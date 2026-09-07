import type { T } from '@/i18n/config';

/**
 * A plain GET form — no client JS needed, matches the Market page's own
 * "navigation is the state" pattern. Season is a disabled single-option
 * select for now (only one season exists yet — see lib/calendar/season.ts);
 * once historical seasons exist, this becomes a real, enabled selector
 * without changing anything else about this component's shape.
 */
export function RankingsToolbar({
  t, seasonNumber, search,
}: {
  t: T;
  seasonNumber: number;
  search: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2.5">
      <select disabled defaultValue={String(seasonNumber)}
        className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-navy-soft disabled:opacity-70">
        <option value={String(seasonNumber)}>{t('ranking.seasonLabel')} {seasonNumber}</option>
      </select>
      <input type="text" name="q" defaultValue={search} placeholder={t('ranking.searchPlaceholder')}
        className="min-w-[220px] flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-navy placeholder:text-navy-muted focus:border-teal focus:outline-none" />
    </form>
  );
}
