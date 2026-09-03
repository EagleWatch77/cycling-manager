import type { T } from '@/i18n/config';
import type { AnalysisSlice } from '@/mock/dashboard';
import { gap } from '@/lib/format';
import { Card, CardLink } from './ui/Card';

/**
 * Where the last stage was won or lost. Demo values only — this card performs
 * no race calculation of its own.
 */
export function RaceAnalysisCard({
  t, analysis,
}: {
  t: T;
  analysis: { stageLabel: string; netSeconds: number; slices: AnalysisSlice[] };
}) {
  const total = analysis.slices.reduce((a, s) => a + Math.abs(s.seconds), 0);
  const R = 26;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <Card title={t('analysis.title')} dense className="col-span-12 lg:col-span-4">
      <p className="px-3.5 pt-2.5 text-2xs text-navy-muted">
        {t('analysis.lastStage')}: <span className="font-semibold text-navy-soft">{analysis.stageLabel}</span>
      </p>
      <div className="flex items-center gap-4 p-3.5 pt-2">
        <div className="relative h-[72px] w-[72px] shrink-0">
          <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
            <circle cx="36" cy="36" r={R} fill="none" stroke="#e8f4f2" strokeWidth="10" />
            {analysis.slices.map((s) => {
              const len = (Math.abs(s.seconds) / total) * C;
              const el = (
                <circle
                  key={s.labelKey} cx="36" cy="36" r={R} fill="none" stroke={s.color} strokeWidth="10"
                  strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold leading-none text-navy">{gap(analysis.netSeconds)}</span>
            <span className="text-[9px] leading-tight text-navy-muted">{t('analysis.gainLoss')}</span>
          </span>
        </div>
        <ul className="min-w-0 flex-1 space-y-1">
          {analysis.slices.map((s) => (
            <li key={s.labelKey} className="flex items-center gap-2 text-2xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 truncate text-navy-soft">{t(s.labelKey)}</span>
              <span className="tabular-nums font-semibold text-navy">{gap(s.seconds)}</span>
            </li>
          ))}
        </ul>
      </div>
      <CardLink label={t('analysis.viewAll')} />
    </Card>
  );
}
