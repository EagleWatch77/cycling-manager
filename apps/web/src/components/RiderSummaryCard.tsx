import type { T } from '@/i18n/config';
import type { Player } from '@/mock/dashboard';
import { Card, CardLink } from './ui/Card';
import { Icon } from './ui/Icon';
import { ProgressBar } from './ui/ProgressBar';

/**
 * The player's own rider. Attributes and condition values are the canonical
 * ones the game already tracks; nothing new is invented for the UI.
 */
export function RiderSummaryCard({
  t, player, attributes,
}: {
  t: T;
  player: Player;
  attributes: { labelKey: string; value: number }[];
}) {
  const condition = [
    { key: 'rider.energy', value: player.energy },
    { key: 'rider.form', value: player.form },
    { key: 'rider.fitness', value: player.fitness },
    { key: 'rider.morale', value: player.morale },
  ];
  return (
    <Card title={t('rider.title')} dense className="col-span-12 lg:col-span-3 row-span-2">
      <div className="flex items-center gap-3 p-3.5 pb-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-navy text-teal">
          <Icon name="rider" className="h-8 w-8" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight text-navy">
            {player.countryFlag} {player.riderName}
          </p>
          <p className="text-2xs text-navy-muted">
            {t('rider.age')} {player.age} · {t('rider.style')}: {t(player.styleKey)}
          </p>
          <span className="mt-1 inline-block rounded bg-teal-light px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-dark">
            {t(`league.${player.league}`)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line px-3.5 py-3">
        {condition.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline justify-between">
              <span className="text-2xs text-navy-muted">{t(c.key)}</span>
              <span className="text-2xs font-bold text-navy">{c.value}</span>
            </div>
            <ProgressBar value={c.value} tone={c.value < 50 ? 'warn' : 'teal'} className="mt-1" />
          </div>
        ))}
      </div>

      <div className="border-t border-line px-3.5 py-3">
        <p className="pb-2 text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('rider.attributes')}</p>
        <ul className="space-y-1.5">
          {attributes.map((a) => (
            <li key={a.labelKey} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-2xs text-navy-soft">{t(a.labelKey)}</span>
              <ProgressBar value={a.value} className="flex-1" />
              <span className="w-6 text-right text-2xs font-bold tabular-nums text-navy">{a.value}</span>
            </li>
          ))}
        </ul>
      </div>
      <CardLink label={t('nav.rider')} />
    </Card>
  );
}
