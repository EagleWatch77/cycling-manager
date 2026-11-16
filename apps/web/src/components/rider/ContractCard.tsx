import type { T } from '@/i18n/config';
import type { RiderContractView } from '@/lib/contract/repository';
import { Card } from '../ui/Card';
import { CardTitle } from '../ui/CardTitle';

/**
 * Jazdec → Kontrakt. Compact rows with thin dividers, values come only from
 * the database (my_rider_contract(): state + remaining weeks from the SERVER
 * clock). No contract recorded => one quiet line, never invented dates.
 */
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <span className="min-w-0 text-[15px] text-navy-soft">{label}</span>
      <span className={`shrink-0 text-[15px] font-semibold tabular-nums ${strong ? 'text-teal' : 'text-navy'}`}>{value}</span>
    </li>
  );
}

export function ContractCard({ t, contract, className = '' }: { t: T; contract: RiderContractView | null; className?: string }) {
  const sw = (season: number, week: number) => t('contract.seasonWeek', { season, week });
  return (
    <Card title={<CardTitle icon="coin">{t('profile.contract')}</CardTitle>} dense className={className}>
      {contract ? (
        <ul className="px-3.5 py-1.5">
          <Row label={t('contract.status')} value={t(`contract.state.${contract.state}`)} strong={contract.state === 'active'} />
          <Row label={t('contract.start')} value={sw(contract.startSeason, contract.startWeek)} />
          <Row label={t('contract.end')} value={sw(contract.endSeason, contract.endWeek)} />
          <Row label={t('contract.duration')} value={String(contract.durationWeeks)} />
          <Row label={t('contract.remaining')} value={String(contract.remainingWeeks)} />
        </ul>
      ) : (
        <p className="px-3.5 py-3 text-sm text-navy-soft">{t('profile.contractEmpty')}</p>
      )}
    </Card>
  );
}
