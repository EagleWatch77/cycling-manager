import type { T } from '@/i18n/config';
import type { SegmentLevel } from '@/lib/rider/development';
import { getDevStatIcon } from '@/lib/rider/statIcons';
import { Card } from '../ui/Card';
import { CardTitle } from '../ui/CardTitle';
import { DevAttributeRow } from './DevAttributeRow';

/**
 * Rozvoj card (Potenciál as stars, Trénovateľnosť as segments). Receives
 * only the already-bucketed 1-5 levels — never the raw hidden values. Lives
 * under "Silné stránky jazdca" in the right column of Rider → Prehľad.
 */
export function DevelopmentCard({
  t, potentialLevel, trainabilityLevel, className = '',
}: {
  t: T;
  potentialLevel: SegmentLevel;
  trainabilityLevel: SegmentLevel;
  className?: string;
}) {
  return (
    <Card title={<CardTitle icon="sprout">{t('group.development')}</CardTitle>} dense className={className}>
      <p className="px-3.5 pt-3 text-xs leading-snug text-navy-soft">{t('groupDesc.development')}</p>
      <ul className="px-3.5 pb-3.5 pt-1">
        <DevAttributeRow variant="stars" icon={getDevStatIcon('potential')} label={t('dev.potential')} level={potentialLevel} />
        <DevAttributeRow variant="segments" icon={getDevStatIcon('trainability')} label={t('dev.trainability')}
          level={trainabilityLevel} accentClass="bg-purple-500" />
      </ul>
    </Card>
  );
}
