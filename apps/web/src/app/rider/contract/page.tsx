import { getServerDictionary } from '@/i18n/server';
import { getMyRiderContract } from '@/lib/contract/repository';
import { getMyPendingSwap } from '@/lib/market/swap';
import { PendingSwapRows } from '@/components/rider/PendingSwapRows';
import { Card } from '@/components/ui/Card';
import { CardTitle } from '@/components/ui/CardTitle';
import { ContractCard } from '@/components/rider/ContractCard';

/**
 * Kontrakt tab — the current contract of the manager's rider (database
 * values only). A rider without a recorded contract (e.g. a starter rider)
 * shows a quiet empty line; no dates are ever invented for him.
 */
export default async function RiderContractPage() {
  const { t } = await getServerDictionary();
  const [contract, pendingSwap] = await Promise.all([getMyRiderContract(), getMyPendingSwap()]);
  return (
    <div className="grid grid-cols-12 gap-3">
      <ContractCard t={t} contract={contract} className="col-span-12 lg:col-span-6" />
      {pendingSwap && (
        <Card title={<CardTitle icon="calendar">{t('swap.planned')}</CardTitle>} dense className="col-span-12 lg:col-span-6">
          <PendingSwapRows t={t} swap={pendingSwap} />
        </Card>
      )}
    </div>
  );
}
