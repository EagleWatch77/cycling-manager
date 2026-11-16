import type { T, Locale } from '@/i18n/config';
import type { TourStage } from '@/data/tours';
import { km } from '@/lib/format';
import { CardLink } from './ui/Card';
import { SectionCard } from './ui/SectionCard';
import { ElevationProfile } from './ui/ElevationProfile';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';

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
  registration: TourRegistrationState;
  /** Stages visible to the league (real masterStages), with an elevation profile only where one exists. */
  stages: (TourStage & { profile?: readonly number[] })[];
}

/**
 * "Aktuálne Tour": the current / nearest relevant Tour from the real season
 * schedule (the player's own next selected Tour first, else the next open
 * one). Term, registration state, stages and lengths are real data; the
 * elevation profile is drawn only for Tours that have authored profile data
 * (Danube today). `tour = null` = nothing left this season.
 */
export function TourPreviewCard({ t, locale, tour, className = '' }: { t: T; locale: Locale; tour: CurrentTourView | null; className?: string }) {
  if (!tour) {
    return (
      <SectionCard icon="mountain" title={t('tour.current')} className={className}>
        <EmptyState compact icon="mountain" text={t('tour.none')} />
        <CardLink label={t('nav.races')} href="/races" />
      </SectionCard>
    );
  }
  const withProfile = tour.stages.filter((s) => s.profile && s.profile.length > 1);
  const combined = withProfile.flatMap((s) => [...(s.profile as readonly number[])]);
  const markers = withProfile
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.difficulty !== 'flat')
    .map(({ s, i }) => ({ at: (i + 0.5) / withProfile.length, tone: s.difficulty === 'mountain' ? ('cat1' as const) : ('cat2' as const) }));

  return (
    <SectionCard icon="mountain" title={t('tour.current')} className={className}>
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <h3 className="truncate text-lg font-bold leading-tight text-navy">{tour.name}</h3>
      </div>

      <dl className="mx-3.5 mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <Facet icon="calendar" label={t('tour.term')} value={tour.term} />
        <Facet icon="bolt" label={t('tour.startsIn')} value={t('calendar.days', { n: tour.startsInDays })} />
        <Facet icon="pin" label={t('tour.stages')} value={t('calendar.stages', { n: tour.stages.length })} />
        <Facet icon="flag" label={t('tour.registration')} value={t(REG_KEY[tour.registration])} />
      </dl>

      {combined.length > 1 && (
        <div className="px-3.5 pt-3">
          <ElevationProfile samples={combined} height={56} markers={markers} showEnds />
        </div>
      )}

      <ol className="mx-3.5 my-3 divide-y divide-line rounded-lg border border-line text-xs">
        {tour.stages.map((s) => (
          <li key={s.number} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="w-7 shrink-0 font-bold text-navy">{t('tour.stageShort', { n: s.number })}</span>
            <span className="min-w-0 flex-1 truncate text-navy-soft" title={s.name}>{s.name}</span>
            <span className="shrink-0 tabular-nums text-navy-muted">{km(s.distanceKm, locale)}</span>
          </li>
        ))}
      </ol>
      <CardLink label={t('tour.detail')} href={`/races/${tour.id}`} />
    </SectionCard>
  );
}

function Facet({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-card px-2.5 py-1.5">
      <span className="text-navy-muted"><Icon name={icon} className="h-4 w-4" /></span>
      <span className="min-w-0">
        <dt className="text-2xs text-navy-muted">{label}</dt>
        <dd className="truncate text-xs font-semibold text-navy">{value}</dd>
      </span>
    </div>
  );
}
