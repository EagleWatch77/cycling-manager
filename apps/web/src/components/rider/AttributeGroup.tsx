import type { T } from '@/i18n/config';
import { PERFORMANCE_MAX, type SkillAttribute } from '@/lib/rider/config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
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
 * `showBars` defaults to on (the Rider page keeps the teal progress rail,
 * flex-laid-out row). The Training page turns it off for a 3-column grid
 * row instead — [icon+label] [value] [gain] — where the gain column has a
 * fixed reserved width whether or not a bonus exists, so the value's
 * position never shifts row to row.
 *
 * `bonuses` is an optional real-gain overlay: when a row's key is present,
 * a green "+N" renders in the gain column. Callers must only pass gains
 * that actually happened (e.g. the most recently processed training's
 * persisted primary/secondary gain) — never a guess or a preview, so this
 * stays trustworthy history rather than a fabricated number.
 */
export function AttributeGroup({
  t, titleKey, icon, keys, attributes, className = '', showStatIcons = false, showBars = true, statIconSize = 28, bonuses,
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
  bonuses?: Partial<Record<SkillAttribute, number>>;
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
          showBars ? (
            <li key={k} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              {showStatIcons && (
                <RiderStatIcon src={getSkillStatIcon(k)} alt={t(`attr.${k}`)} size={statIconSize} />
              )}
              <span className="min-w-0 flex-1 truncate text-[15px] text-navy" title={t(`attr.${k}`)}>
                {t(`attr.${k}`)}
              </span>
              <ProgressBar value={pct(attributes[k], k)} className="w-12 shrink-0 sm:w-16 lg:w-20" />
              <span className="flex shrink-0 items-baseline justify-end gap-1 text-right">
                <span className="text-base font-bold tabular-nums text-navy">{attributes[k]}</span>
                {bonuses?.[k] != null && (
                  <span className="text-xs font-bold tabular-nums text-teal-dark">+{bonuses[k]}</span>
                )}
              </span>
            </li>
          ) : (
            <li key={k} className="grid grid-cols-[minmax(0,1fr)_60px_42px] items-center gap-2 border-b border-line py-2 last:border-0">
              <span className="flex min-w-0 items-center gap-2.5">
                {showStatIcons && (
                  <RiderStatIcon src={getSkillStatIcon(k)} alt={t(`attr.${k}`)} size={statIconSize} />
                )}
                <span className="min-w-0 truncate text-[15px] text-navy" title={t(`attr.${k}`)}>
                  {t(`attr.${k}`)}
                </span>
              </span>
              <span className="text-right text-base font-semibold tabular-nums text-navy">{attributes[k]}</span>
              <span className="text-right text-xs font-bold tabular-nums text-teal-dark">
                {bonuses?.[k] != null ? `+${bonuses[k]}` : ''}
              </span>
            </li>
          )
        ))}
      </ul>
    </Card>
  );
}

/**
 * Bar-fill percentage — Development Model V2 (see the chat report):
 * the 7 canonical Performance attributes now have a 200 career ceiling,
 * while Tactics/Technique/experience keep their original 160 scale. Using
 * one shared max here would under-fill Performance bars (never reaching
 * 100% until 200) or over-fill the others, so the max is picked per
 * attribute family.
 */
function pct(v: number, key: SkillAttribute) {
  const max = (PERFORMANCE_FOCUS as readonly SkillAttribute[]).includes(key) ? PERFORMANCE_MAX : 160;
  return Math.max(0, Math.min(100, ((v - 90) / (max - 90)) * 100));
}
