import type { T } from '@/i18n/config';
import type { StoredRider } from '@/lib/rider/repository';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { Card, CardLink } from './ui/Card';
import { Icon } from './ui/Icon';
import { ProgressBar } from './ui/ProgressBar';
import { RiderAvatar } from './rider/RiderAvatar';

/** Six attributes worth surfacing on the compact card; the rest live on /rider. */
const HIGHLIGHT: SkillAttribute[] = ['climbing', 'hills', 'flat', 'sprint', 'endurance', 'descending'];
const ATTR_LABEL: Record<string, string> = {
  climbing: 'attr.climbing', hills: 'attr.hills', flat: 'attr.flat',
  sprint: 'attr.sprint', endurance: 'attr.endurance', descending: 'attr.descending',
};
const FLAGS: Record<string, string> = {
  SK:'🇸🇰',CZ:'🇨🇿',PL:'🇵🇱',FR:'🇫🇷',IT:'🇮🇹',ES:'🇪🇸',BE:'🇧🇪',NL:'🇳🇱',
  DE:'🇩🇪',GB:'🇬🇧',US:'🇺🇸',AU:'🇦🇺',CO:'🇨🇴',DK:'🇩🇰',NO:'🇳🇴',SI:'🇸🇮',
};

/**
 * The player's own rider, loaded from Supabase. When the player has no rider
 * yet it shows a create prompt instead of any mock data.
 */
export function RiderSummaryCard({ t, rider }: { t: T; rider: StoredRider | null }) {
  if (!rider) {
    return (
      <Card title={t('rider.title')} className="col-span-12 lg:col-span-3 row-span-2">
        <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
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
      </Card>
    );
  }

  const c = rider.condition;
  const condition = [
    { key: 'rider.energy', value: c.energy },
    { key: 'rider.form', value: c.form },
    { key: 'rider.fitness', value: c.fitness },
    { key: 'rider.morale', value: c.morale },
  ];

  return (
    <Card title={t('rider.title')} dense className="col-span-12 lg:col-span-3 row-span-2">
      <div className="flex items-center gap-3 p-3.5 pb-3">
        <RiderAvatar seed={rider.id} size="md" />
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight text-navy">
            {FLAGS[rider.countryIso2] ?? '🏳️'} {rider.firstName} {rider.surname}
          </p>
          <p className="text-2xs text-navy-muted">
            {t('rider.age')} {rider.age} · {t('rider.style')}: {t(`style.${rider.inferredArchetype}`)}
          </p>
          <span className="mt-1 inline-block rounded bg-teal-light px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-dark">
            {t('league.rookie')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line px-3.5 py-3">
        {condition.map((x) => (
          <div key={x.key}>
            <div className="flex items-baseline justify-between">
              <span className="text-2xs text-navy-muted">{t(x.key)}</span>
              <span className="text-2xs font-bold text-navy">{x.value}</span>
            </div>
            <ProgressBar value={x.value} tone={x.value < 50 ? 'warn' : 'teal'} className="mt-1" />
          </div>
        ))}
      </div>

      <div className="border-t border-line px-3.5 py-3">
        <p className="pb-2 text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('rider.attributes')}</p>
        <ul className="space-y-1.5">
          {HIGHLIGHT.map((a) => (
            <li key={a} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-2xs text-navy-soft">{t(ATTR_LABEL[a])}</span>
              <ProgressBar value={rider.attributes[a]} className="flex-1" />
              <span className="w-6 text-right text-2xs font-bold tabular-nums text-navy">{rider.attributes[a]}</span>
            </li>
          ))}
        </ul>
      </div>
      <CardLink label={t('nav.rider')} />
      <span className="hidden">{SKILL_ATTRIBUTES.length}</span>
    </Card>
  );
}
