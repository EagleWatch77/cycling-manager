import type { T } from '@/i18n/config';
import type { SkillAttribute } from '@/lib/rider/config';
import { getSkillStatIcon } from '@/lib/rider/statIcons';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { ProgressBar } from '../ui/ProgressBar';
import { RiderStatIcon } from './RiderStatIcon';

/**
 * One themed attribute panel, e.g. Performance or Technique.
 *
 * `showStatIcons` opts a group into the glossy per-row /ride-icon treatment
 * (bigger label/value type, ~28px icon before each label) used for
 * Performance on both the Rider and Training pages. Groups that don't have
 * dedicated icon assets yet (Tactics, Technique, Other) simply omit the prop
 * and keep the original compact text+bar rows — no icon, glossy or outline,
 * is introduced for those so nothing gets mixed within a single row list.
 */
export function AttributeGroup({
  t, titleKey, icon, keys, attributes, className = '', showStatIcons = false,
}: {
  t: T;
  titleKey: string;
  icon: string;
  keys: readonly SkillAttribute[];
  attributes: Record<SkillAttribute, number>;
  className?: string;
  showStatIcons?: boolean;
}) {
  return (
    <Card dense className={className}
      title={
        <span className="flex items-center gap-1.5 text-sm">
          <Icon name={icon} className="h-3.5 w-3.5 text-teal" />
          {t(titleKey)}
        </span>
      }>
      <ul className="space-y-2.5 p-3.5">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-2.5">
            {showStatIcons && (
              <RiderStatIcon src={getSkillStatIcon(k)} alt={t(`attr.${k}`)} size={28} />
            )}
            <span className="min-w-0 flex-1 truncate text-[15px] text-navy-soft" title={t(`attr.${k}`)}>
              {t(`attr.${k}`)}
            </span>
            <ProgressBar value={pct(attributes[k])} className="w-12 shrink-0 sm:w-16 lg:w-20" />
            <span className="w-9 shrink-0 text-right text-base font-bold tabular-nums text-navy">
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
