'use client';

import { useState, useTransition } from 'react';
import { performServiceAction } from '@/app/facilities/actions';
import type { BikeRiskBand } from '@/lib/facilities/config';
import type { ServiceQuoteItem } from '@/lib/facilities/bike';

export interface BikeServiceLabels {
  overall: string;
  tires: string; brakes: string; drivetrain: string;
  recommended: string;
  serviceCta: string;
  servicePrice: string;
  fullCondition: string;
  risk: Record<BikeRiskBand, string>;
  financeNote: string;
  serviceError: string;
  componentLabel: Record<'tires' | 'brakes' | 'drivetrain', string>;
}

const RISK_TONE: Record<BikeRiskBand, string> = {
  normal: 'text-teal-dark', elevated: 'text-warn', high: 'text-danger', veryHigh: 'text-danger',
};

export function BikeServiceCard({
  overall, riskBand, items, discountedPrice, labels,
}: {
  overall: number;
  riskBand: BikeRiskBand;
  items: readonly ServiceQuoteItem[];
  discountedPrice: number;
  labels: BikeServiceLabels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const needsService = items.some((i) => i.recommended);

  function service() {
    setError(null);
    startTransition(async () => {
      const result = await performServiceAction();
      if (!result.ok) setError(labels.serviceError);
    });
  }

  return (
    <div className="rounded-card border border-line bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-navy">{labels.overall}: <span className={RISK_TONE[riskBand]}>{overall}%</span></p>
        <span className={`text-2xs font-semibold uppercase ${RISK_TONE[riskBand]}`}>{labels.risk[riskBand]}</span>
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.component} className="flex items-center justify-between gap-2.5 border-b border-line pb-2 text-sm last:border-0">
            <span className="text-navy-soft">{labels.componentLabel[item.component]}</span>
            <span className="flex items-center gap-2">
              <span className="font-bold tabular-nums text-navy">{item.condition}%</span>
              {item.recommended && <span className="text-2xs font-semibold text-warn">{labels.recommended}</span>}
            </span>
          </li>
        ))}
      </ul>

      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        {needsService ? (
          <>
            <p className="text-xs text-navy-soft">{labels.servicePrice}: <span className="font-bold text-navy">{discountedPrice.toLocaleString()} €</span></p>
            <button type="button" disabled={pending} onClick={service}
              className="shrink-0 rounded-lg bg-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-50">
              {labels.serviceCta}
            </button>
          </>
        ) : (
          <p className="text-xs text-navy-soft">{labels.fullCondition}</p>
        )}
      </div>

      <p className="mt-2.5 text-[11px] italic leading-snug text-navy-muted">{labels.financeNote}</p>
    </div>
  );
}
