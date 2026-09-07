import { getServerDictionary } from '@/i18n/server';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';

/**
 * Kontrakt tab — "za akých podmienok je v tíme" (see the chat report's UX
 * goal). No contract/salary/team-transfer data model exists in the DB yet
 * (see supabase/schema.sql: profiles, riders, tour_registrations,
 * training_plans, admin_users, market_riders, premium_entitlements — no
 * contracts table), so this renders a clean, honest empty state rather than
 * inventing values. When a real contract model lands, this is the single
 * place to add rows for: Team, Contract status, Salary, Signing bonus,
 * Contract start, Contract end, Remaining seasons, buyout clause, bonuses —
 * each rendered only once its backing column/table actually exists.
 */
export default async function RiderContractPage() {
  const { t } = await getServerDictionary();

  return (
    <Card className="col-span-12">
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-rail text-teal">
          <Icon name="coin" className="h-8 w-8" />
        </span>
        <p className="max-w-xs text-sm text-navy-soft">{t('profile.contractEmpty')}</p>
      </div>
    </Card>
  );
}
