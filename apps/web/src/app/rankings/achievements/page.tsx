import { getServerDictionary } from '@/i18n/server';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';

/**
 * Úspechy — a historical-records view (most career wins, most podiums, most
 * wins in a season, youngest winner, most career points...), not another
 * points ranking. Route/structure prepared per the chat report (item 16),
 * but every one of those categories needs real race_results rows to
 * compute from truthfully, and there are zero today (see
 * lib/ranking/repository.ts) — so this stays a clean empty state. Each
 * category should only be added to this page once it can be computed from
 * genuine persisted results, never a mock record.
 */
export default async function AchievementsRankingsPage() {
  const { t } = await getServerDictionary();
  return (
    <Card className="col-span-12">
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-rail text-teal">
          <Icon name="trophy" className="h-8 w-8" />
        </span>
        <p className="max-w-sm text-sm text-navy-soft">{t('ranking.achievementsEmpty')}</p>
      </div>
    </Card>
  );
}
