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
 * "Môj jazdec" - compact overview of the player's own rider: portrait, name,
 * nationality, age, type, the shared overallRating() (no new OVR maths), the
 * persisted condition values and the remaining contract weeks. Values are
 * short table rows, no bars. The full attribute list lives on /rider.
 * `contractWeeksLeft = null` (no active contract / not deployed) hides that row.
 */
export function RiderSummaryCard({
  t, rider, contractWeeksLeft = null, className = '',
}: { t: T; rider: StoredRider | null; contractWeeksLeft?: number | null; className?: string }) {
  if (!rider) {
    return (
      <SectionCard icon="rider" title={t('rider.title')} dense={false} className={className}>
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
  const rows: { key: string; value: string | number; strong?: boolean }[] = [
    { key: 'rider.ovr', value: overallRating(rider.attributes), strong: true },
    { key: 'rider.energy', value: c.energy },
    { key: 'rider.fatigue', value: c.fatigue },
    { key: 'rider.form', value: c.form },
    { key: 'rider.fitness', value: c.fitness },
    { key: 'rider.morale', value: c.morale },
  ];
  if (contractWeeksLeft != null) rows.push({ key: 'contract.remaining', value: contractWeeksLeft });

  return (
    <SectionCard icon="rider" title={t('rider.title')} className={className}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <RiderAvatar seed={rider.id} size="md" />
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight text-navy">{rider.firstName} {rider.surname}</p>
          <p className="truncate text-2xs text-navy-muted">
            {FLAGS[rider.countryIso2] ?? '🏳️'} {rider.countryName} · {t('rider.age')} {rider.age}
          </p>
          <p className="truncate text-2xs text-navy-muted">{t('rider.style')}: {t(`style.${rider.inferredArchetype}`)}</p>
        </div>
      </div>
      <table className="w-full border-t border-line text-xs">
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key} data-row={r.key}>
              <th scope="row" className="px-3.5 py-1.5 text-left font-normal text-navy-soft">{t(r.key)}</th>
              <td className={`px-3.5 py-1.5 text-right tabular-nums ${r.strong ? 'text-sm font-bold text-teal-dark' : 'font-bold text-navy'}`}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <CardLink label={t('rider.detail')} href="/rider" />
    </SectionCard>
  );
}
