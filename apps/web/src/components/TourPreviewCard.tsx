import type { T, Locale } from '@/i18n/config';
import type { TourStage } from '@/data/tours';
import { km } from '@/lib/format';
import { CardLink } from './ui/Card';
import { ElevationProfile } from './ui/ElevationProfile';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { SectionCard } from './ui/SectionCard';
import { CountdownTiles } from './dashboard/CountdownTiles';

export type TourRegistrationState = 'selected' | 'available' | 'started' | 'overlap' | 'season-limit';
const REG_KEY: Record<TourRegistrationState, string> = {
  selected: 'races.selected', available: 'tour.regOpen', started: 'races.tourStarted',
  overlap: 'races.dateOverlap', 'season-limit': 'races.limitReached',
};

export interface CurrentTourView {
  id: string;
  name: string;
  heroImage?: string;
  /** Already formatted real date range of the Tour's week. */
  term: string;
  startsInDays: number;
  /** Milliseconds from server "now" to the real start of the Tour week; null once it has started. */
  countdownMs: number | null;
  registration: TourRegistrationState;
  /** Stages visible to the league (real masterStages), with an elevation profile only where one exists. */
  stages: (TourStage & { profile?: readonly number[] })[];
}

/**
 * "Najbližšie preteky" - the dominant window of Home. Real data only: the
 * player's next selected Tour (else the next open one) from the season
 * schedule, its term, stage count, total length of the visible stages,
 * registration state, a countdown to the real start and a link to the Tour
 * detail. The elevation profile is drawn only where authored profile data
 * exists (Danube today); other Tours show their stage strip without a chart.
 * `tour = null` = no Tour left this season.
 */
export function TourPreviewCard({ t, locale, tour, className = '' }: { t: T; locale: Locale; tour: CurrentTourView | null; className?: string }) {
  if (!tour) {
    return (
      <SectionCard icon="mountain" title={t('tour.next')} tone="tint" className={className}>
        <EmptyState compact icon="mountain" text={t('tour.none')} />
        <CardLink label={t('nav.races')} href="/races" />
      </SectionCard>
    );
  }
  const totalKm = tour.stages.reduce((sum, s) => sum + s.distanceKm, 0);
  const withProfile = tour.stages.filter((s) => s.profile && s.profile.length > 1);
  const combined = withProfile.flatMap((s) => [...(s.profile as readonly number[])]);
  const markers = withProfile
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.difficulty !== 'flat')
    .map(({ s, i }) => ({ at: (i + 0.5) / withProfile.length, tone: s.difficulty === 'mountain' ? ('cat1' as const) : ('cat2' as const) }));

  return (
    <section className={`flex flex-col overflow-hidden rounded-card border border-teal/40 bg-card shadow-card ${className}`}>
      <div className="relative border-b border-teal-light bg-gradient-to-r from-teal-light via-teal-rail to-card px-4 pb-3 pt-3">
        {tour.heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tour.heroImage} alt="" className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 object-cover object-right opacity-30" />
        )}
        <div className="relative">
          <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-teal-dark">
            <Icon name="mountain" className="h-3.5 w-3.5 text-teal" />
            {t('tour.next')}
          </span>
          <h2 className="mt-1 truncate text-3xl font-extrabold leading-tight text-navy">{tour.name}</h2>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
        <Facet icon="calendar" label={t('tour.term')} value={tour.term} />
        <Facet icon="pin" label={t('tour.stages')} value={t('calendar.stages', { n: tour.stages.length })} />
        <Facet icon="trend" label={t('tour.totalKm')} value={km(totalKm, locale)} />
        <Facet icon="flag" label={t('tour.registration')} value={t(REG_KEY[tour.registration])} />
      </dl>

      {combined.length > 1 && (
        <div className="px-4 pt-3">
          <ElevationProfile samples={combined} height={88} markers={markers} showEnds />
        </div>
      )}

      <ol className="mx-4 my-3 grid gap-px overflow-hidden rounded-lg border border-line bg-line" style={{ gridTemplateColumns: `repeat(${Math.max(1, tour.stages.length)}, minmax(0,1fr))` }}>
        {tour.stages.map((s) => (
          <li key={s.number} className="bg-card px-1.5 py-1.5 text-center" title={s.name}>
            <span className="block text-2xs font-extrabold text-teal-dark">{t('tour.stageShort', { n: s.number })}</span>
            <span className="block truncate text-2xs text-navy-muted">{s.name}</span>
            <span className="block text-2xs font-semibold tabular-nums text-navy">{km(s.distanceKm, locale)}</span>
          </li>
        ))}
      </ol>

      <div className="border-t border-teal-light bg-teal-rail px-4 py-1.5">
        <p className="text-center text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('tour.startsIn')}</p>
        <CountdownTiles initialMs={tour.countdownMs} labels={{ days: t('dashboard.cdDays'), hours: t('dashboard.cdHours'), minutes: t('dashboard.cdMinutes'), seconds: t('dashboard.cdSeconds') }} />
      </div>
      <CardLink label={t('tour.detail')} href={`/races/${tour.id}`} />
    </section>
  );
}

function Facet({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-card px-3 py-2">
      <span className="text-teal"><Icon name={icon} className="h-4 w-4" /></span>
      <span className="min-w-0">
        <dt className="text-2xs text-navy-muted">{label}</dt>
        <dd className="truncate text-xs font-bold text-navy">{value}</dd>
      </span>
    </div>
  );
}
