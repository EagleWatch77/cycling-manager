import type { T } from '@/i18n/config';
import type { StoredRider } from '@/lib/rider/repository';
import { overallRating } from '@/lib/rider/score';
import { CardLink } from './ui/Card';
import { SectionCard } from './ui/SectionCard';
import { Icon } from './ui/Icon';
import { RiderAvatar } from './rider/RiderAvatar';

const FLAGS: Record<string, string> = {
  SK:'🇸🇰',CZ:'🇨🇿',PL:'🇵🇱',FR:'🇫🇷',IT:'🇮🇹',ES:'🇪🇸',BE:'🇧🇪',NL:'🇳🇱',
  DE:'🇩🇪',GB:'🇬🇧',US:'🇺🇸',AU:'🇦🇺',CO:'🇨🇴',DK:'🇩🇰',NO:'🇳🇴',SI:'🇸🇮',
};

/**
 * "Môj jazdec" (top right of Home): name, nationality, age and type on the
 * left, the existing portrait/avatar on the right, the shared overallRating()
 * as a large OVR figure, and the persisted condition values (energy, fatigue,
 * form, fitness, morale) plus remaining contract weeks as a compact grid. No
 * new maths, no bars. `contractWeeksLeft = null` hides that cell.
 */
export function RiderSummaryCard({
  t, rider, contractWeeksLeft = null, className = '',
}: { t: T; rider: StoredRider | null; contractWeeksLeft?: number | null; className?: string }) {
  if (!rider) {
    return (
      <SectionCard icon="rider" title={t('rider.title')} tone="tint" dense={false} className={className}>
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-rail text-teal">
            <Icon name="rider" className="h-8 w-8" />
          </span>
          <div>
            <p className="text-sm font-bold text-navy">{t('rider.createTitle')}</p>
            <p className="mt-1 text-xs text-navy-soft">{t('rider.createText')}</p>
          </div>
          <a href="/rider" className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
            {t('rider.createCta')}
          </a>
        </div>
      </SectionCard>
    );
  }

  const c = rider.condition;
  const cells: { key: string; value: string | number }[] = [
    { key: 'rider.energy', value: c.energy },
    { key: 'rider.fatigue', value: c.fatigue },
    { key: 'rider.form', value: c.form },
    { key: 'rider.fitness', value: c.fitness },
    { key: 'rider.morale', value: c.morale },
  ];
  if (contractWeeksLeft != null) cells.push({ key: 'contract.remaining', value: contractWeeksLeft });

  return (
    <SectionCard icon="rider" title={t('rider.title')} tone="tint" className={className}>
      <div className="flex items-start justify-between gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold leading-tight text-navy">{rider.firstName} {rider.surname}</p>
          <p className="mt-0.5 truncate text-xs text-navy-soft">
            {FLAGS[rider.countryIso2] ?? '🏳️'} {rider.countryName} · {t('rider.age')} {rider.age}
          </p>
          <span className="mt-1.5 inline-block rounded bg-teal-light px-1.5 py-0.5 text-2xs font-bold uppercase text-teal-dark">
            {t(`style.${rider.inferredArchetype}`)}
          </span>
          <div data-row="rider.ovr" className="mt-3 flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold leading-none tabular-nums text-teal-dark">{overallRating(rider.attributes)}</span>
            <span className="text-xs font-bold uppercase tracking-wide text-navy-muted">{t('rider.ovr')}</span>
          </div>
        </div>
        <RiderAvatar seed={rider.id} size="xl" />
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line text-xs">
        {cells.map((r) => (
          <div key={r.key} data-row={r.key} className="flex items-baseline justify-between gap-2 bg-card px-3.5 py-1.5">
            <dt className="truncate text-navy-soft">{t(r.key)}</dt>
            <dd className="font-bold tabular-nums text-navy">{r.value}</dd>
          </div>
        ))}
      </dl>
      <CardLink label={t('rider.detail')} href="/rider" />
    </SectionCard>
  );
}
