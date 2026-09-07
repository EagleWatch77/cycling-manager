import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { SKILL_ATTRIBUTES, POTENTIAL_MIN, POTENTIAL_MAX, TRAINABILITY_MIN, TRAINABILITY_MAX, type SkillAttribute } from '@/lib/rider/config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { potentialToStars, scoreToLevel } from '@/lib/rider/development';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { AbilityRadar } from '@/components/rider/AbilityRadar';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { RiderStatIcon } from '@/components/rider/RiderStatIcon';
import { DevAttributeRow } from '@/components/rider/DevAttributeRow';
import { getSkillStatIcon, getDevStatIcon } from '@/lib/rider/statIcons';

/**
 * Attribute groups, following the reference layout, filled ONLY with the
 * attributes the engine actually has. Performance / Tactics / Technique split
 * the 19 canonical skills into readable families; Experience sits on its own.
 */
const GROUPS: { titleKey: string; icon: string; keys: readonly SkillAttribute[] }[] = [
  { titleKey: 'group.performance', icon: 'chart', keys: PERFORMANCE_FOCUS },
  { titleKey: 'group.tactics', icon: 'bolt', keys: ['positioning', 'attackTiming', 'reaction', 'energyManagement', 'breakawaySkill'] },
  { titleKey: 'group.technique', icon: 'wheel', keys: ['descending', 'bikeHandling', 'cornering', 'packRiding', 'wetHandling', 'roughSurface'] },
  { titleKey: 'group.other', icon: 'trophy', keys: ['experience'] },
];

/** The five main areas, shown with a one-line explanation like the reference. */
const AREAS = [
  { key: 'areas.performance', titleKey: 'group.performance', icon: 'chart' },
  { key: 'areas.tactics', titleKey: 'group.tactics', icon: 'bolt' },
  { key: 'areas.technique', titleKey: 'group.technique', icon: 'wheel' },
  { key: 'areas.development', titleKey: 'group.development', icon: 'trophy' },
  { key: 'areas.condition', titleKey: 'group.condition', icon: 'heart' },
];

/**
 * Prehľad tab — "kto je a aké má schopnosti" (see the chat report's UX
 * goal). Identity/condition already shown once by RiderLayout's header;
 * this is purely the ability/strengths content. rider is guaranteed
 * non-null here — RiderLayout already returned the empty state otherwise.
 */
export default async function RiderOverviewPage() {
  const { t } = await getServerDictionary();
  const rider = (await getMyRider())!;

  const strengths = [...SKILL_ATTRIBUTES]
    .map((k) => ({ key: k, value: rider.attributes[k] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <>
      {/* Radar + areas explainer */}
      <div className="grid grid-cols-12 gap-3">
        <Card title={t('profile.radarTitle')} dense className="col-span-12 lg:col-span-7">
          <div className="p-3.5">
            <AbilityRadar t={t} attributes={rider.attributes} />
          </div>
        </Card>

        <Card title={t('areas.title')} dense className="col-span-12 lg:col-span-5">
          <ul className="p-3.5">
            {AREAS.map((a) => (
              <li key={a.key} className="flex items-start gap-2.5 border-b border-line py-2 last:border-0">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
                  <Icon name={a.icon} className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-navy">{t(a.titleKey)}</span>
                  <span className="block text-2xs leading-snug text-navy-soft">{t(a.key)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Attribute groups */}
      <div className="grid grid-cols-12 gap-3">
        {GROUPS.map((g) => (
          <AttributeGroup key={g.titleKey} t={t} titleKey={g.titleKey} icon={g.icon}
            keys={g.keys} attributes={rider.attributes}
            showStatIcons={g.titleKey === 'group.performance'}
            className="col-span-12 sm:col-span-6 xl:col-span-3" />
        ))}
      </div>

      <div className="grid grid-cols-12 gap-3">
        <Card title={<span className="text-sm">{t('profile.strengths')}</span>} dense className="col-span-12 lg:col-span-6">
          <ul className="p-3.5">
            {strengths.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-2.5 border-b border-line py-2 last:border-0">
                <span className="flex min-w-0 items-center gap-2.5 text-[15px] text-navy-soft">
                  <RiderStatIcon src={getSkillStatIcon(s.key)} alt={t(`attr.${s.key}`)} size={26} />
                  <span className="truncate" title={t(`attr.${s.key}`)}>{t(`attr.${s.key}`)}</span>
                </span>
                <span className="shrink-0 text-base font-bold tabular-nums text-navy">{s.value}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="text-sm">{t('group.development')}</span>} dense className="col-span-12 lg:col-span-6">
          <p className="px-3.5 pt-3.5 text-sm leading-snug text-navy-soft">{t('profile.potentialNote')}</p>
          <ul className="p-3.5 pt-2">
            <DevAttributeRow variant="stars" icon={getDevStatIcon('potential')} label={t('dev.potential')}
              level={potentialToStars(rider.potential, POTENTIAL_MIN, POTENTIAL_MAX)} />
            <DevAttributeRow variant="segments" icon={getDevStatIcon('trainability')} label={t('dev.trainability')}
              level={scoreToLevel(rider.trainability, TRAINABILITY_MIN, TRAINABILITY_MAX)} accentClass="bg-purple-500" />
          </ul>
        </Card>
      </div>
    </>
  );
}
