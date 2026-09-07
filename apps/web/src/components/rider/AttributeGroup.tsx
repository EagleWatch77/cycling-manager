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
 * `showStatIcons` opts a group into the per-row /ride-icon treatment used
 * for Performance on both the Rider and Training pages. Groups that don't
 * have dedicated icon assets yet (Tactics, Technique, Other) simply omit the
 * prop — no icon, glossy or outline, is introduced for those so nothing gets
 * mixed within a single row list.
 *
 * `showBars` defaults to on (the Rider page keeps the teal progress rail).
 * The Training page turns it off for a quieter label/value list — see the
 * training page for the reasoning.
 */
export function AttributeGroup({
  t, titleKey, icon, keys, attributes, className = '', showStatIcons = false, showBars = true, statIconSize = 28,
}: {
  t: T;
  titleKey: string;
  icon: string;
  keys: readonly SkillAttribute[];
  attributes: Record<SkillAttribute, number>;
  className?: string;
  showStatIcons?: boolean;
  showBars?: boolean;
  statIconSize?: number;
}) {
  return (
    <Card dense className={className}
      title={
        <span className="flex items-center gap-1.5 text-sm text-teal-dark">
          <Icon name={icon} className="h-3.5 w-3.5 text-teal" />
          {t(titleKey)}
        </span>
      }>
      <ul className="p-3.5">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
            {showStatIcons && (
              <RiderStatIcon src={getSkillStatIcon(k)} alt={t(`attr.${k}`)} size={statIconSize} />
            )}
            <span className="min-w-0 flex-1 truncate text-[15px] text-navy" title={t(`attr.${k}`)}>
              {t(`attr.${k}`)}
            </span>
            {showBars && (
              <ProgressBar value={pct(attributes[k])} className="w-12 shrink-0 sm:w-16 lg:w-20" />
            )}
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
