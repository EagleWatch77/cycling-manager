import type { T } from '@/i18n/config';
import type { SkillAttribute } from '@/lib/rider/config';
import { topStrengths } from '@/lib/rider/strengths';
import { getSkillStatIcon } from '@/lib/rider/statIcons';
import { Card } from '../ui/Card';
import { CardTitle } from '../ui/CardTitle';
import { RiderStatIcon } from './RiderStatIcon';

/**
 * Silné stránky jazdca: the rider's three highest visible skills (with a
 * short racing explanation) and a small Pretekársky profil built from the
 * existing rider style. Purely informational — no bonuses, no comparison
 * with other riders, no invented suitability numbers.
 */
export function StrengthsCard({
  t, attributes, archetype, className = '',
}: {
  t: T;
  attributes: Record<SkillAttribute, number>;
  archetype: string;
  className?: string;
}) {
  const strengths = topStrengths(attributes);
  return (
    <Card title={<CardTitle icon="trend">{t('profile.strengths')}</CardTitle>} dense className={className}>
      <ul className="px-3.5 pb-1 pt-1">
        {strengths.map((s) => (
          <li key={s.key} className="flex items-start gap-2.5 border-b border-line py-2 last:border-0">
            <RiderStatIcon src={getSkillStatIcon(s.key)} alt="" size={30} className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-navy">{t(`attr.${s.key}`)}</span>
              <span className="mt-0.5 block text-xs leading-snug text-navy-soft">{t(`attrDesc.${s.key}`)}</span>
            </span>
            <span className="shrink-0 text-base font-bold tabular-nums text-navy">{s.value}</span>
          </li>
        ))}
      </ul>
      <div className="mx-3.5 mb-3.5 mt-1 rounded-lg bg-teal-rail px-3 py-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('strengths.profile')}</p>
        <p className="mt-0.5 text-sm font-bold text-teal-dark">{t(`style.${archetype}`)}</p>
        <p className="mt-0.5 text-xs leading-snug text-navy-soft">{t(`styleDesc.${archetype}`)}</p>
      </div>
    </Card>
  );
}
