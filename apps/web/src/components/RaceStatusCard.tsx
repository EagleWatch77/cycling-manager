import type { ReactNode } from 'react';
import type { T, Locale } from '@/i18n/config';
import type { LiveRace } from '@/mock/dashboard';
import { km, gap } from '@/lib/format';
import { Card } from './ui/Card';
import { ElevationProfile } from './ui/ElevationProfile';

/**
 * Current or upcoming race. When the race is live it also shows the current
 * situation. All values are demo data; nothing here reads the Race Engine.
 */
export function RaceStatusCard({ t, locale, race }: { t: T; locale: Locale; race: LiveRace }) {
  return (
    <Card className="col-span-12" dense>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-3.5">
        <div className="min-w-[15rem]">
          <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-teal">
            {race.isLive && <span className="h-1.5 w-1.5 rounded-full bg-teal" />}
            {race.isLive ? t('race.live') : t('race.upcoming')}
          </span>
          <h2 className="mt-1 text-lg font-bold leading-tight text-navy">
            {race.tourName} — {t('race.stage', { n: race.stageNumber })}
          </h2>
          <p className="text-xs text-navy-soft">
            {race.isLive
              ? `${t('race.toFinish')}: ${km(race.remainingKm, locale)}`
              : `${t('race.startsIn')} ${race.startsInLabel ?? ''}`}
          </p>
        </div>

        <ElevationProfile samples={race.profile} height={46} showEnds className="min-w-[16rem] flex-1 px-6" />

        {race.isLive && (
          <div className="flex items-center gap-6 border-l border-line pl-6">
            <Situation label={t('race.breakaway')}>
              <span className="flex justify-center gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <span key={i} className="h-2 w-2 rounded-full border border-teal" />
                ))}
              </span>
              <span className="mt-1 block text-2xs text-navy-muted">
                {race.breakawayRiders} {t('race.riders')}
              </span>
            </Situation>
            <Situation label={t('race.situation')}>
              <span className="text-sm font-semibold text-navy">{gap(race.breakawayGapSec)}</span>
            </Situation>
            <Situation label={t('race.peloton')}>
              <span className="text-sm font-semibold text-navy">{race.pelotonSize}</span>
            </Situation>
            <button
              type="button"
              className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
            >
              {t('race.watch')}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Situation({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-center">
      <span className="block text-2xs text-navy-muted">{label}</span>
      <span className="mt-1 block">{children}</span>
    </div>
  );
}
