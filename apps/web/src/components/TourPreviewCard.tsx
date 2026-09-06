import type { T, Locale } from '@/i18n/config';
import type { LeagueId } from '@/lib/leagues';
import { visibleStages } from '@/lib/leagues';
import type { TourStage } from '@/mock/dashboard';
import { km } from '@/lib/format';
import { Card } from './ui/Card';
import { ElevationProfile } from './ui/ElevationProfile';
import { Icon } from './ui/Icon';

/**
 * Featured Tour preview.
 *
 * League visibility comes from `visibleStages()`. Stages above the league's
 * limit are NOT rendered as locked or greyed out — they are absent, so a
 * promotion reveals them as new content rather than removing a padlock.
 */
export function TourPreviewCard({
  t, locale, league, tour,
}: {
  t: T;
  locale: Locale;
  league: LeagueId;
  tour: { name: string; heroImage?: string; startsInDays: number; focusKey: string; weather: string; masterStages: TourStage[] };
}) {
  const stages = visibleStages(tour.masterStages, league);
  const combined = stages.flatMap((s) => s.profile);
  const markers = stages
    .map((s, i) => ({ stage: s, i }))
    .filter(({ stage }) => stage.difficulty !== 'flat')
    .map(({ stage, i }) => ({
      at: (i + 0.5) / stages.length,
      tone: stage.difficulty === 'mountain' ? ('cat1' as const) : ('cat2' as const),
    }));

  return (
    <Card className="col-span-12 lg:col-span-7" dense>
      {tour.heroImage ? (
        <div className="relative h-28 w-full overflow-hidden rounded-t-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tour.heroImage} alt="" className="h-full w-full object-cover object-right" />
          {/* Fade the left edge into the card so the title sits on clean white. */}
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/70 to-transparent" />
          <div className="absolute inset-0 flex items-end p-3.5">
            <div>
              <span className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('tour.next')}</span>
              <h2 className="text-xl font-bold leading-tight text-navy">{tour.name}</h2>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-3.5 pb-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-light text-teal">
            <Icon name="mountain" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('tour.next')}</span>
            <h2 className="truncate text-xl font-bold leading-tight text-navy">{tour.name}</h2>
          </div>
        </div>
      )}

      <dl className="mx-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <Facet icon="calendar" label={t('tour.startsIn')} value={t('calendar.days', { n: tour.startsInDays })} />
        <Facet icon="pin" label={t('tour.stages')} value={t('calendar.stages', { n: stages.length })} />
        <Facet icon="mountain" label={t('tour.focus')} value={t(tour.focusKey)} />
        <Facet icon="cloud" label={t('tour.weather')} value={tour.weather} />
      </dl>

      <div className="px-3.5 pt-3">
        <ElevationProfile samples={combined} height={72} markers={markers} showEnds />
        <ol className="mt-1 grid gap-px" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0,1fr))` }}>
          {stages.map((s) => (
            <li key={s.number} className="border-t-2 border-teal-rail pt-1.5 text-center">
              <span className="block text-2xs font-bold text-navy">{t('tour.stageShort', { n: s.number })}</span>
              <span className="block truncate text-2xs text-navy-muted" title={s.name}>{s.name}</span>
              <span className="block text-2xs text-navy-soft">{km(s.distanceKm, locale)}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-auto border-t border-line px-3.5 py-2 text-2xs text-navy-muted">{t('tour.visibleNote')}</p>
    </Card>
  );
}

function Facet({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-card px-3 py-2">
      <span className="text-navy-muted"><Icon name={icon} className="h-4 w-4" /></span>
      <span className="min-w-0">
        <dt className="text-2xs text-navy-muted">{label}</dt>
        <dd className="truncate text-xs font-semibold text-navy">{value}</dd>
      </span>
    </div>
  );
}
