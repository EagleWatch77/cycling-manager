'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { MarketPoolSummary } from '@/lib/market/repository';
import { generateMarketPoolAction, resetMarketPoolAction } from '@/app/admin/market/actions';

/**
 * Admin-only test tooling for the market pool. Both buttons call server
 * actions that independently re-verify admin status server-side
 * (requireAdmin() inside actions.ts) — this component only provides the
 * loading/confirmation UX, it grants nothing on its own.
 */
export function MarketToolsPanel({ seasonId, initialSummary }: { seasonId: string; initialSummary: MarketPoolSummary }) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateMarketPoolAction(seasonId);
      if (result.ok) {
        router.refresh();
      } else if (result.reason === 'already-active') {
        setError('Market pool pre túto sezónu už existuje. Najprv ho resetni, ak chceš vygenerovať nový.');
      } else {
        setError('Generovanie zlyhalo.');
      }
    });
  }

  function handleReset() {
    if (!window.confirm(
      `Naozaj zmazať ${summary.freeCount + summary.premiumCount} dostupných (nepodpísaných) market riderov pre ${seasonId}? ` +
      'Podpísaní/získaní rideri zostanú netknutí. Túto akciu nemožno vrátiť späť.',
    )) return;

    setError(null);
    startTransition(async () => {
      const result = await resetMarketPoolAction(seasonId);
      if (result.ok) {
        router.refresh();
      } else {
        setError('Reset zlyhal.');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-card p-4 shadow-card">
        {summary.active ? (
          <>
            <p className="text-sm font-bold text-teal-dark">Market pool active</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-navy-soft">Season</dt><dd className="font-semibold text-navy">{summary.seasonId}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-navy-soft">Source</dt><dd className="font-semibold text-navy">{summary.source}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-navy-soft">FREE riders</dt><dd className="font-semibold text-navy">{summary.freeCount}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-navy-soft">PREMIUM riders</dt><dd className="font-semibold text-navy">{summary.premiumCount}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-navy-soft">Acquired (history)</dt><dd className="font-semibold text-navy">{summary.acquiredCount}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-navy-soft">Generated</dt><dd className="font-semibold text-navy">{summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : '—'}</dd></div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-navy-soft">
            No active market pool for <span className="font-semibold text-navy">{seasonId}</span>
            {summary.acquiredCount > 0 && <> ({summary.acquiredCount} acquired rider(s) remain from a previous pool)</>}.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleGenerate} disabled={pending || summary.active} aria-busy={pending}
          className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? 'Pracujem…' : 'Vygenerovať market pool teraz'}
        </button>
        <button type="button" onClick={handleReset} disabled={pending || (summary.freeCount + summary.premiumCount === 0)} aria-busy={pending}
          className="rounded-lg border border-danger bg-card px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-50">
          ⚠ Resetovať testovací market
        </button>
      </div>
    </div>
  );
}
