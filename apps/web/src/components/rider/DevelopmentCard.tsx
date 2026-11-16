import type { T } from '@/i18n/config';
import type { SegmentLevel } from '@/lib/rider/development';
import { getDevStatIcon, getSkillStatIcon } from '@/lib/rider/statIcons';
import { DEVELOPMENT_KEYS, type DevelopmentLevels } from '@/lib/rider/radar';
import { Card } from '../ui/Card';
import { CardTitle } from '../ui/CardTitle';
import { DevAttributeRow } from './DevAttributeRow';

/**
 * Rozvoj card: five compact rows — the four hidden development attributes (Potenciál,
 * Trénovateľnosť, Profesionalita, Regenerácia), each as the same 1-5 stars.
 * Receives only the already-bucketed levels (DB my_rider_estimates()) —
 * never the raw hidden values; a null level means "no authorised estimate"
 * and renders "Neznáme". Lives under "Silné stránky jazdca" in the right
 * column of Rider -> Prehľad.
 */
export function DevelopmentCard({
  t, levels, experience, className = '',
}: {
  t: T;
  levels: DevelopmentLevels;
  /** Public numeric Skúsenosti value (real data, shown as a number). */
  experience: number;
  className?: string;
}) {
  return (
    <Card title={<CardTitle icon="sprout">{t('group.development')}</CardTitle>} dense className={className}>
      <ul className="px-3.5 py-1.5">
        {DEVELOPMENT_KEYS.map((k) => (
          <DevAttributeRow key={k} variant="stars" icon={getDevStatIcon(k)} label={t(`dev.${k}`)}
            tooltip={t(`dev.${k}.tip`)} unknownLabel={t('dev.unknown')} level={levels[k] as SegmentLevel | null} />
        ))}
        <DevAttributeRow variant="number" icon={getSkillStatIcon('experience')} label={t('attr.experience')}
          tooltip={t('groupDesc.experience')} level={null} value={experience} />
      </ul>
    </Card>
  );
}
