import { getServerDictionary } from '@/i18n/server';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';

/**
 * História tab — "čo jazdec zažil počas kariéry" (see the chat report's UX
 * goal). This is meant to be a chronological career timeline (rider
 * created, contract signed/extended, transfer, first race, first win,
 * podium, major result, training milestone, injury, award, retirement...),
 * not another attribute dashboard — but no persistent rider event/history
 * table exists in the DB yet (see supabase/schema.sql), so there is nothing
 * real to list. A compact career summary (seasons/races/wins/podiums/best
 * result) belongs above this list once it can be computed from genuine
 * persisted race results — not before. Building the real feature needs a
 * new rider_events (or similar) table; that is reported to the user, not
 * invented here.
 */
export default async function RiderHistoryPage() {
  const { t } = await getServerDictionary();

  return (
    <Card className="col-span-12">
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-rail text-teal">
          <Icon name="calendar" className="h-8 w-8" />
        </span>
        <p className="max-w-xs text-sm text-navy-soft">{t('profile.historyEmpty')}</p>
      </div>
    </Card>
  );
}
