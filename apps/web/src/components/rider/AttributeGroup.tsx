import type { T } from '@/i18n/config';
import type { SkillAttribute } from '@/lib/rider/config';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { ProgressBar } from '../ui/ProgressBar';

/** One themed attribute panel, e.g. Performance or Technique. */
export function AttributeGroup({
  t, titleKey, icon, keys, attributes, className = '',
}: {
  t: T;
  titleKey: string;
  icon: string;
  keys: readonly SkillAttribute[];
  attributes: Record<SkillAttribute, number>;
  className?: string;
}) {
  return (
    <Card dense className={className}
      title={
        <span className="flex items-center gap-1.5">
          <Icon name={icon} className="h-3.5 w-3.5 text-teal" />
          {t(titleKey)}
        </span>
      }>
      <ul className="space-y-1.5 p-3.5">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="w-32 shrink-0 text-2xs text-navy-soft">{t(`attr.${k}`)}</span>
            <ProgressBar value={pct(attributes[k])} className="flex-1" />
            <span className="w-7 text-right text-2xs font-bold tabular-nums text-navy">
              {attributes[k]}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function pct(v: number) {
  return Math.max(0, Math.min(100, ((v - 90) / (160 - 90)) * 100));
}
