import type { T } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import type { LeagueId } from '@/lib/leagues';
import { visibleStages } from '@/lib/leagues';
import { km, dateRange } from '@/lib/format';
import type { ScheduledTourView, TourSelectionState } from '@/data/tourSchedule';
import { Icon } from '../ui/Icon';
import { JerseyIcon, type JerseyKind } from './JerseyIcon';

const DIFF_ICON: Record<string, string> = {
  flat: 'flag', hilly: 'mountain', mountain: 'mountain', classics: 'wheel', mixed: 'chart',
};

const STATE_BADGE: Record<Exclude<TourSelectionState, 'available'>, { className: string; key: string }> = {
  selected: { className: 'bg-teal text-white', key: 'races.selected' },
  overlap: { className: 'bg-card/90 text-navy-muted', key: 'races.dateOverlap' },
  'season-limit': { className: 'bg-card/90 text-navy-muted', key: 'races.limitReached' },
};

/**
 * One Tour card. Stages are filtered by league via visibleStages(), so a
 * Rookie only ever sees their stages — higher ones are not rendered at all,
 * not greyed out.
 *
 * The date badge and selection state come from the real season schedule and
 * the Rider's current selection (view/state), never from the Tour's own
 * content. Week number is internal schedule data — used for overlap
 * detection — and is deliberately not shown here.
 *
 * The primary action never selects a Tour directly: it always opens the
 * Tour detail page (/races/[id]), where registration actually happens.
 */
export function TourCard({
  t, locale, league, view, state,
}: {
  t: T;
  locale: Locale;
  league: LeagueId;
  view: ScheduledTourView;
  state: TourSelectionState;
}) {
  const { tour, weekStart, weekEnd } = view;
  const stages = visibleStages(tour.masterStages, league);
  const totalKm = tour.totalKm ?? stages.reduce((s, x) => s + x.distanceKm, 0);
  const badge = state === 'available' ? null : STATE_BADGE[state];

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-card border bg-card shadow-card ${
        state === 'selected' ? 'border-teal ring-1 ring-teal' : 'border-line'
      }`}
    >
      <div className="relative h-32 w-full overflow-hidden">
        {tour.cardImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tour.cardImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-teal via-teal-dark to-navy" />
        )}
        <span className="absolute left-2 top-2 rounded-md bg-navy/85 px-2 py-1 text-2xs font-semibold text-white backdrop-blur">
          {dateRange(weekStart, weekEnd, locale)}
        </span>
        {badge && (
          <span className={`absolute right-2 top-2 rounded-md px-2 py-1 text-2xs font-bold ${badge.className}`}>
            {t(badge.key)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-rail text-teal">
            <Icon name={DIFF_ICON[tour.difficulty]} className="h-4 w-4" />
          </span>
          <h3 className="truncate text-base font-bold text-navy">{tour.name}</h3>
        </div>

        <div className="mt-1.5 flex items-center gap-3 text-xs">
          <span className="text-navy-soft">{t('races.stagesN', { n: stages.length })}</span>
          <span className="font-semibold text-teal">{km(totalKm, locale)}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-2.5">
          <div>
            <span className="block text-2xs text-navy-muted">{t('races.difficulty')}</span>
            <span className="text-xs font-semibold text-navy">{t(`diff.${tour.difficulty}`)}</span>
          </div>
          <div>
            <span className="block text-2xs text-navy-muted">{t('races.prestige')}</span>
            <span className="flex gap-0.5 pt-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i < tour.prestige ? 'bg-teal' : 'bg-teal-rail'}`} />
              ))}
            </span>
          </div>
        </div>

        <div className="mt-2.5">
          <span className="block text-2xs text-navy-muted">{t('races.suitableFor')}</span>
          <span className="text-xs font-semibold text-navy">
            {tour.suitableFor.map((a) => t(`style.${a}`)).join(', ')}
          </span>
        </div>

        <div className="mt-2.5 border-t border-line pt-2.5">
          <span className="block pb-1 text-2xs text-navy-muted">{t('races.classifications')}</span>
          <ul className="flex gap-3">
            {tour.jerseys.map((j) => (
              <li key={j} className="flex flex-col items-center gap-0.5">
                <JerseyIcon kind={j as JerseyKind} className="h-7 w-6" />
                <span className="text-[9px] text-navy-muted">{t(`jersey.${j}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        {state === 'available' && (
          <a href={`/races/${tour.id}`}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-teal px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-dark">
            {t('races.select')}
          </a>
        )}
        {state === 'selected' && (
          <a href={`/races/${tour.id}`}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-teal-rail px-3 py-2 text-xs font-semibold text-teal-dark transition-colors hover:bg-line">
            <Icon name="flag" className="h-3.5 w-3.5" />
            {t('races.selected')}
          </a>
        )}
        {(state === 'overlap' || state === 'season-limit') && (
          <a href={`/races/${tour.id}`}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-teal-rail px-3 py-2 text-xs font-semibold text-navy-muted/70">
            {t(STATE_BADGE[state].key)}
          </a>
        )}
      </div>
    </article>
  );
}
