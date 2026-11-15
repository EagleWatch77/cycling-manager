import type { T } from '@/i18n/config';
import { Card } from '@/components/ui/Card';
import { CardTitle } from '@/components/ui/CardTitle';
import { getSkillStatIcon } from '@/lib/rider/statIcons';
import { RiderStatIcon } from './RiderStatIcon';
import { RiderProgressChart } from './RiderProgressChart';
import {
  buildProgress, buildSeries, deltaTone, formatDelta, DELTA_CLASS, PROGRESS_ATTRIBUTES,
  type Attributes, type BaselineKind, type HistoryPoint, type SeriesKey,
} from '@/lib/rider/progress';

/**
 * "Vývoj jazdca" — real baseline-vs-now comparison (everyone) and, for Premium
 * managers only, a chart of the real stored history. The baseline column is
 * "Pri získaní" only when the snapshot was really captured at acquisition;
 * for riders that existed before tracking it is "Začiatok sledovania".
 * Only the 19 public attributes + OVR; hidden values never appear here.
 */
export function RiderProgressCard({
  t, baseline, baselineKind, current, history,
}: {
  t: T;
  baseline: Attributes;
  baselineKind: BaselineKind;
  current: Attributes;
  /** Premium only (null for Free): real stored history rows, oldest first. */
  history: HistoryPoint[] | null;
}) {
  const p = buildProgress(baseline, current);
  const isStart = baselineKind === 'tracking_start';
  const fromLabel = isStart ? t('progress.colStart') : t('progress.colAcquired');
  const ovrFromLabel = isStart ? t('progress.ovrStart') : t('progress.ovrAcquired');

  const chartKeys: SeriesKey[] = ['ovr', ...PROGRESS_ATTRIBUTES];
  const series = history && history.length > 0
    ? Object.fromEntries(chartKeys.map((k) => [k, buildSeries(history, k)]))
    : null;

  const summary: [string, string, string?][] = [
    [ovrFromLabel, String(p.ovrFrom)],
    [t('progress.ovrNow'), String(p.ovrNow)],
    [t('progress.ovrDelta'), formatDelta(p.ovrDelta), DELTA_CLASS[deltaTone(p.ovrDelta)]],
  ];

  return (
    <Card title={<CardTitle icon="trend">{t('progress.title')}</CardTitle>} dense>
      <div className="space-y-3 p-3.5">
        <div className="grid grid-cols-3 gap-2 text-center">
          {summary.map(([label, value, cls]) => (
            <div key={label} className="rounded-lg border border-line bg-surface px-2 py-2">
              <p className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{label}</p>
              <p className={`mt-0.5 text-base font-bold tabular-nums ${cls ?? 'text-navy'}`}>{value}</p>
            </div>
          ))}
        </div>
        {isStart && <p className="text-xs leading-snug text-navy-soft">{t('progress.trackingNote')}</p>}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-navy-muted">
              <th className="py-1.5 text-left font-semibold">{t('progress.colAttribute')}</th>
              <th className="py-1.5 text-right font-semibold">{fromLabel}</th>
              <th className="py-1.5 text-right font-semibold">{t('progress.colNow')}</th>
              <th className="py-1.5 text-right font-semibold">{t('progress.colDelta')}</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.attr} className="border-b border-line last:border-0">
                <td className="py-1">
                  <span className="flex items-center gap-2">
                    <RiderStatIcon src={getSkillStatIcon(r.attr)} alt="" size={20} />
                    <span className="truncate text-navy">{t(`attr.${r.attr}`)}</span>
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums text-navy-soft">{r.from}</td>
                <td className="py-1 text-right font-bold tabular-nums text-navy">{r.now}</td>
                <td className={`py-1 text-right font-bold tabular-nums ${DELTA_CLASS[deltaTone(r.delta)]}`}>{formatDelta(r.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {series && (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-muted">{t('progress.chartTitle')}</p>
            <RiderProgressChart
              options={chartKeys.map((k) => ({ key: k, label: k === 'ovr' ? t('progress.ovr') : t(`attr.${k}`) }))}
              series={series}
              labels={{ metric: t('progress.chartMetric'), started: t('progress.chartStarted'), chartAria: t('progress.chartAria'), week: t('races.week') }}
              sourceLabels={{ training: t('progress.sourceTraining') }}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
