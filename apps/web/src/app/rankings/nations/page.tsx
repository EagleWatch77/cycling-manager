import { getServerDictionary } from '@/i18n/server';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';

/**
 * Národy — route/structure prepared per the chat report (item 15), but not
 * wired to a real query yet: aggregating race_results by rider nationality
 * is straightforward once results exist (same rider_rankings-style view,
 * grouped by country_iso2 instead of rider_id), but there are zero rows to
 * aggregate today (see lib/ranking/repository.ts — no race-processing
 * pipeline exists), so this stays a clean empty state rather than a table
 * of invented country totals.
 */
export default async function NationsRankingsPage() {
  const { t } = await getServerDictionary();
  return (
    <Card className="col-span-12">
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-rail text-teal">
          <Icon name="flag" className="h-8 w-8" />
        </span>
        <p className="max-w-sm text-sm text-navy-soft">{t('ranking.nationsEmpty')}</p>
      </div>
    </Card>
  );
}
