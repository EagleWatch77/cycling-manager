import type { T } from '@/i18n/config';
import type { TrainingPlan } from '@/lib/training/repository';
import { CardLink } from './ui/Card';
import { SectionCard } from './ui/SectionCard';
import { StatusBadge } from './ui/StatusBadge';

const INTENSITY_KEY: Record<string, string> = {
  light: 'trainingPage.intensityLight',
  normal: 'trainingPage.intensityNormal',
  hard: 'trainingPage.intensityHard',
};
const WEEK_TYPE_KEY: Record<string, string> = {
  performance: 'trainingPage.weekTypePerformance',
  technical: 'trainingPage.weekTypeTechnical',
};

/**
 * Training overview: the plan for the next plannable week and the most
 * recent completed (applied) training. Read-only and real: it shows only what
 * is saved in training_plans, never a prediction or a guessed gain.
 */
export function TrainingOverviewCard({
  t, week, plan, last, className = '',
}: {
  t: T;
  /** The plannable week number (same rule as the Training page). */
  week: number;
  plan: TrainingPlan | null;
  last: TrainingPlan | null;
  className?: string;
}) {
  return (
    <SectionCard icon="bolt" title={t('dashboard.trainingTitle')} className={className}>
      <div className="divide-y divide-line">
        <div className="px-3.5 py-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">
            {t('dashboard.trainingWeek', { n: week })}
          </p>
          {plan ? (
            <div className="mt-1 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-navy">{t(`attr.${plan.focus}`)}</p>
                <p className="text-xs text-navy-soft">
                  {t(WEEK_TYPE_KEY[plan.weekType] ?? 'trainingPage.weekTypePerformance')}
                  {plan.weekType === 'performance' && INTENSITY_KEY[plan.intensity]
                    ? ` · ${t(INTENSITY_KEY[plan.intensity])}`
                    : ''}
                </p>
              </div>
              <StatusBadge label={t('trainingPage.statusPlanned')} tone="teal" />
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-navy-soft">{t('dashboard.trainingNone', { n: week })}</p>
              <a
                href="/rider/training"
                className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                {t('dashboard.trainingPlanCta')}
              </a>
            </div>
          )}
        </div>

        <div className="px-3.5 py-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('dashboard.trainingLast')}</p>
          {last && last.primaryAttr && last.primaryGain !== null ? (
            <p className="mt-1 text-xs text-navy">
              <span className="font-semibold">{t(`attr.${last.primaryAttr}`)}</span>{' '}
              <span className="font-bold tabular-nums text-teal-dark">+{last.primaryGain}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-navy-soft">{t('dashboard.trainingLastNone')}</p>
          )}
        </div>
      </div>
      <CardLink label={t('nav.training')} href="/rider/training" />
    </SectionCard>
  );
}
