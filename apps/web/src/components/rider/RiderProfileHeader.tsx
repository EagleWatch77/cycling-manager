import type { T } from '@/i18n/config';
import type { StoredRider } from '@/lib/rider/repository';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { RiderAvatar } from './RiderAvatar';

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

/**
 * Shared identity header for the whole /rider/* profile — lives once in
 * app/rider/layout.tsx so no route repeats it (name/country/age/archetype/
 * rookie badge/condition were previously duplicated between the Rider page
 * and a second small card on the Training page; that duplication is gone
 * now that both are tabs of the same profile).
 */
export function RiderProfileHeader({ t, rider }: { t: T; rider: StoredRider }) {
  const condition = [
    { key: 'rider.energy', value: rider.condition.energy },
    { key: 'rider.form', value: rider.condition.form },
    { key: 'rider.fitness', value: rider.condition.fitness },
    { key: 'rider.morale', value: rider.condition.morale },
  ];

  return (
    <Card className="col-span-12" dense>
      <div className="flex flex-wrap items-center gap-5 p-4">
        <RiderAvatar seed={rider.id} size="lg" className="rounded-2xl" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-navy">
            {FLAGS[rider.countryIso2] ?? ''} {rider.firstName} {rider.surname}
          </h1>
          <p className="mt-0.5 text-sm text-navy-soft">
            {t('rider.age')} {rider.age} · {t('rider.style')}: {t(`style.${rider.inferredArchetype}`)}
          </p>
          <span className="mt-1.5 inline-block rounded bg-teal-light px-2 py-0.5 text-2xs font-bold uppercase text-teal-dark">
            {t('league.rookie')}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap gap-4">
          {condition.map((c) => (
            <div key={c.key} className="w-28">
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
