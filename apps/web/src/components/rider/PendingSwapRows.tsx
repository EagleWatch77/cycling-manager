import type { T } from '@/i18n/config';
import type { PendingSwapView } from '@/lib/market/swap';

/** Compact planned-swap facts (new rider + takeover week). Shared by the market page and the Kontrakt tab. */
export function PendingSwapRows({ t, swap }: { t: T; swap: PendingSwapView }) {
  const row = 'flex items-center justify-between gap-3 border-b border-line py-2 last:border-0';
  return (
    <ul className="px-3.5 py-1.5">
      <li className={row}>
        <span className="text-[15px] text-navy-soft">{t('swap.newRider')}</span>
        <span className="text-[15px] font-semibold text-navy">{swap.newFirstName} {swap.newSurname}</span>
      </li>
      <li className={row}>
        <span className="text-[15px] text-navy-soft">{t('swap.takeover')}</span>
        <span className="text-[15px] font-semibold tabular-nums text-teal">{t('contract.seasonWeek', { season: swap.takeoverSeason, week: swap.takeoverWeek })}</span>
      </li>
    </ul>
  );
}
