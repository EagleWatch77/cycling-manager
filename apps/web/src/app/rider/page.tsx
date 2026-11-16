import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { AbilityRadar } from '@/components/rider/AbilityRadar';
import { buildRadarModel } from '@/lib/rider/radar';
import { getDevelopmentEstimates } from '@/lib/rider/developmentEstimates';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { StrengthsCard } from '@/components/rider/StrengthsCard';
import type { DevelopmentLevels } from '@/lib/rider/radar';
import { DevelopmentCard } from '@/components/rider/DevelopmentCard';

/**
 * Attribute groups, following the reference layout, filled ONLY with the
 * attributes the engine actually has. Performance / Tactics / Technique split
 * the 18 skills below into readable families; Skúsenosti lives in the Rozvoj card.
 */
const GROUPS: { titleKey: string; descKey: string; icon: string; keys: readonly SkillAttribute[]; }[] = [
  { titleKey: 'group.performance', descKey: 'groupDesc.performance', icon: 'chart', keys: PERFORMANCE_FOCUS },
  { titleKey: 'group.tactics', descKey: 'groupDesc.tactics', icon: 'bolt', keys: TACTICS_ATTRIBUTES },
  { titleKey: 'group.technique', descKey: 'groupDesc.technique', icon: 'wheel', keys: TECHNIQUE_ATTRIBUTES },
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
  // 1-5 stars computed in the database for the player's own rider — the raw hidden values never reach the app.
  const devLevels: DevelopmentLevels = {
    potential: rider.estimates.potentialStars, trainability: rider.estimates.trainabilityLevel,
    professionalism: rider.estimates.professionalismLevel, recovery: rider.estimates.recoveryLevel,
  };

  return (
    <>
      {/* Left: radar. Right: Silné stránky jazdca, then Rozvoj. Mobile order = DOM order:
          radar, strengths, Rozvoj, then the detailed attribute cards. */}
      <div className="grid grid-cols-12 gap-3">
        <AbilityRadar title={t('profile.radarTitle')} className="col-span-12 lg:col-span-7"
          model={buildRadarModel(rider.attributes, getDevelopmentEstimates(rider.id), t, devLevels)}
          labels={{
            overview: t('radar.overview'), estimate: t('radar.estimate'), unknown: t('radar.unknown'),
            note: t('radar.devNote'), noteUnknown: t('radar.devNoteUnknown'), aria: t('radar.aria'),
          }} />

        <div className="col-span-12 flex flex-col gap-3 lg:col-span-5">
          <StrengthsCard t={t} attributes={rider.attributes} archetype={rider.inferredArchetype} />
          <DevelopmentCard t={t} levels={devLevels} experience={rider.attributes.experience} />
        </div>
      </div>

      {/* Attribute groups */}
      <div className="grid grid-cols-12 gap-3">
        {GROUPS.map((g) => (
          <AttributeGroup key={g.titleKey} t={t} titleKey={g.titleKey} icon={g.icon}
            keys={g.keys} attributes={rider.attributes}
            descriptionKey={g.descKey}
            showStatIcons statIconSize={24}
            className="col-span-12 lg:col-span-4" />
        ))}
      </div>
    </>
  );
}
