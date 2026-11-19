import type { T } from '@/i18n/config';
import type { SegmentLevel } from '@/lib/rider/development';
import { MARKET_ESTIMATE_KEYS, type MarketEstimateLevels, type MarketEstimateKey } from '@/lib/market/estimates';
import { getDevStatIcon, getSkillStatIcon } from '@/lib/rider/statIcons';
import { Card } from '../ui/Card';
import { CardTitle } from '../ui/CardTitle';
import { Icon } from '../ui/Icon';
import { RiderStatIcon } from '../rider/RiderStatIcon';

/**
 * Rozvoj of a MARKET rider: all six values (Potenciál, Trénovateľnosť, Profesionalita, Regenerácia, Vitalita, Skúsenosti) as a rough 1-5 read-out
 * (five bars + a plain word) - never a number, never an interval. Receives only levels (lib/market/estimates.ts); a null level = "not available"
 * (the database function is not installed / returned nothing), shown as a quiet dash, never as a guessed value. The exact values stay hidden until
 * the rider is signed.
 */
const ICON: Record<MarketEstimateKey, string | null> = {
  potential: getDevStatIcon('potential'), trainability: getDevStatIcon('trainability'), professionalism: getDevStatIcon('professionalism'),
  recovery: getDevStatIcon('recovery'), vitality: null, experience: getSkillStatIcon('experience'),
};
// Verbal scale colour: restrained - one teal shade per level group, no traffic-light rainbow.
const BAR_ON = ['bg-navy-muted', 'bg-navy-soft', 'bg-teal', 'bg-teal', 'bg-teal-dark'];

export function MarketDevelopmentCard({ t, levels, className = '' }: { t: T; levels: MarketEstimateLevels; className?: string }) {
  return (
    <Card title={<CardTitle icon="sprout">{t('group.development')}</CardTitle>} dense className={className}>
      <ul className="px-3.5 py-1">
        {MARKET_ESTIMATE_KEYS.map((k) => {
          const level = levels[k] as SegmentLevel | null;
          const name = k === 'experience' ? t('attr.experience') : t(`dev.${k}`);
          const tip = k === 'experience' ? t('groupDesc.experience') : t(`dev.${k}.tip`);
          const word = level ? t(`market.level.${level}`) : t('market.detail.devUnavailable');
          return (
            <li key={k} title={tip} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              {ICON[k]
                ? <RiderStatIcon src={ICON[k]} alt={name} size={24} />
                : <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-teal"><Icon name="heart" className="h-4 w-4" /></span>}
              <span className="min-w-0 flex-1 truncate text-sm text-navy">{name}</span>
              <span className="flex shrink-0 items-center gap-2" aria-label={`${name}: ${word}${level ? ` (${level}/5)` : ''}`}>
                <span className="flex items-center gap-1" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={`h-2 w-3.5 rounded-full ${level && i < level ? BAR_ON[level - 1] : 'bg-line'}`} />
                  ))}
                </span>
                <span className={`w-[5.5rem] text-right text-xs font-semibold ${level ? 'text-navy' : 'text-navy-muted'}`}>{word}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-3.5 py-2 text-2xs text-navy-muted">{t('market.detail.devNote')}</p>
    </Card>
  );
}
