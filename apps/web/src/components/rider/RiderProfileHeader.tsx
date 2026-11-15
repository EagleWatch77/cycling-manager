import type { T } from '@/i18n/config';
import type { StoredRider } from '@/lib/rider/repository';
import { overallRating } from '@/lib/rider/score';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { RiderPortrait } from './RiderPortrait';

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

/**
 * Shared identity header for the whole /rider/* profile — lives once in
 * app/rider/layout.tsx so no route repeats it.
 *
 * Left: portrait slot, name + nationality, age · style, league, and the
 * Celkové hodnotenie (the single shared overallRating()). Right: the four
 * condition meters. `portraitSrc` is whatever the existing avatar pool
 * resolves (null → neutral silhouette placeholder).
 */
export function RiderProfileHeader({
  t, rider, leagueLabel, portraitSrc,
}: {
  t: T;
  rider: StoredRider;
  leagueLabel: string;
  portraitSrc: string | null;
}) {
  const condition = [
    { key: 'rider.energy', value: rider.condition.energy },
    { key: 'rider.form', value: rider.condition.form },
    { key: 'rider.fitness', value: rider.condition.fitness },
    { key: 'rider.morale', value: rider.condition.morale },
  ];
  const fullName = `${rider.firstName} ${rider.surname}`;

  return (
    <Card className="col-span-12" dense>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 p-3.5">
        <div className="flex min-w-0 items-center gap-3.5">
          <RiderPortrait src={portraitSrc} alt={fullName} className="w-16 sm:w-[72px]" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold leading-tight text-navy sm:text-2xl">
              {FLAGS[rider.countryIso2] ?? ''} {fullName}
            </h1>
            <p className="mt-0.5 text-sm text-navy-soft">
              {rider.countryName} · {t('rider.age')} {rider.age} · {t('rider.style')}: {t(`style.${rider.inferredArchetype}`)}
            </p>
            <span className="mt-1.5 inline-block rounded bg-teal-light px-2 py-0.5 text-2xs font-bold uppercase text-teal-dark">
              {leagueLabel}
            </span>
          </div>
          <div className="shrink-0 rounded-lg bg-teal-rail px-3.5 py-2 text-center">
            <p className="text-3xl font-bold leading-none tabular-nums text-teal-dark">{overallRating(rider.attributes)}</p>
            <p className="mt-1 text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('rating.overall')}</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:ml-auto lg:flex lg:w-auto lg:gap-4">
          {condition.map((c) => (
            <div key={c.key} className="lg:w-28">
              <div className="flex items-baseline justify-between">
                <span className="text-2xs text-navy-muted">{t(c.key)}</span>
                <span className="text-2xs font-bold text-navy">{c.value}</span>
              </div>
              <ProgressBar value={c.value} className="mt-1" tone={c.value < 50 ? 'warn' : 'teal'} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
