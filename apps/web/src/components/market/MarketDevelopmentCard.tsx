import type { T } from '@/i18n/config';
import type { SegmentLevel } from '@/lib/rider/development';
import { MARKET_ESTIMATE_KEYS, type MarketEstimateLevels, type MarketEstimateKey } from '@/lib/market/estimates';
import { getDevStatIcon, getSkillStatIcon } from '@/lib/rider/statIcons';
import { Card } from '../ui/Card';
import { CardTitle } from '../ui/CardTitle';
import { Icon } from '../ui/Icon';
import { RiderStatIcon } from '../rider/RiderStatIcon';

/**
 * Rozvoj of a MARKET rider. Five hidden values (Potenciál, Trénovateľnosť, Profesionalita, Regenerácia, Vitalita) as a rough 1-5 read-out - five small
 * dashes + a plain word, never a number, interval or percentage (3/5 = roughly the middle, 5/5 = the highest level, not "100 %"). Skúsenosti is a public
 * attribute and is shown as the exact number. A null level = the estimate is not available (the database function is not installed / returned nothing):
 * then NO dashes are drawn - only a quiet text - so an empty or invented scale can never be mistaken for a real estimate.
 */
const ICON: Record<MarketEstimateKey, string | null> = {
  potential: getDevStatIcon('potential'), trainability: getDevStatIcon('trainability'), professionalism: getDevStatIcon('professionalism'),
  recovery: getDevStatIcon('recovery'), vitality: null,
};
// Restrained: one teal family, darker for higher levels - no traffic-light rainbow.
const BAR_ON = ['bg-navy-muted', 'bg-navy-soft', 'bg-teal', 'bg-teal', 'bg-teal-dark'];

export function MarketDevelopmentCard({ t, levels, className = '' }: { t: T; levels: MarketEstimateLevels; className?: string }) {
  return (
    <Card title={<CardTitle icon="sprout">{t('group.development')}</CardTitle>} dense className={className}>
      <ul className="px-3.5 py-1">
        {MARKET_ESTIMATE_KEYS.map((k) => {
          const level = levels[k] as SegmentLevel | null;
          const name = t(`dev.${k}`);
          const word = level ? t(`market.level.${level}`) : null;
          return (
            <li key={k} title={t(`dev.${k}.tip`)} className="flex items-center gap-2.5 border-b border-line py-2">
              {ICON[k]
                ? <RiderStatIcon src={ICON[k]} alt={name} size={24} />
                : <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-teal"><Icon name="heart" className="h-4 w-4" /></span>}
              <span className="min-w-0 flex-1 truncate text-sm text-navy">{name}</span>
              {level && word ? (
                <span className="flex shrink-0 items-center gap-2" aria-label={`${name}: ${word}`}>
                  <span className="flex items-center gap-1" aria-hidden="true">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className={`h-2 w-3.5 rounded-full ${i < level ? BAR_ON[level - 1] : 'bg-line'}`} />
                    ))}
                  </span>
                  <span className="w-[5.5rem] text-right text-xs font-semibold text-navy">{word}</span>
                </span>
              ) : (
                <span className="shrink-0 text-xs font-medium text-navy-muted">{t('market.detail.devUnavailable')}</span>
              )}
            </li>
          );
        })}
        <li title={t('groupDesc.experience')} className="flex items-center gap-2.5 py-2">
          <RiderStatIcon src={getSkillStatIcon('experience')} alt={t('attr.experience')} size={24} />
          <span className="min-w-0 flex-1 truncate text-sm text-navy">{t('attr.experience')}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-navy">{levels.experience}</span>
        </li>
      </ul>
      <p className="border-t border-line px-3.5 py-2 text-2xs text-navy-muted">{t('market.detail.devNote')}</p>
    </Card>
  );
}
