'use client';

import { useState, useTransition } from 'react';
import { buyMarketRiderAction } from '@/app/transfers/actions';

/**
 * "Kúpiť jazdca" — only rendered by the page when the swap switch is on and
 * the manager has no pending swap. The click only asks the database to RESERVE
 * the rider; nothing changes for the current rider until the weekly closure.
 */
export function BuyRiderButton({ marketRiderId, label, note, errors }: {
  marketRiderId: string; label: string; note: string;
  errors: { swapPending: string; notAvailable: string; notEligible: string; generic: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buy() {
    setError(null);
    startTransition(async () => {
      const r = await buyMarketRiderAction(marketRiderId);
      if (r.ok) return;
      setError(r.reason === 'swap-pending' ? errors.swapPending
        : r.reason === 'not-available' || r.reason === 'not-found' ? errors.notAvailable
        : r.reason === 'not-eligible' ? errors.notEligible : errors.generic);
    });
  }

  return (
    <div className="mt-3">
      <button type="button" disabled={pending} onClick={buy}
        className="rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-50">
        {label}
      </button>
      <p className="mt-1.5 text-xs text-navy-soft">{note}</p>
      {error && <p role="alert" className="mt-1 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}
