import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { isAdmin } from '@/lib/admin/auth';
import { getMyFacilities, getFacilityCaps, getMyLeague, getEffectiveFacilities } from '@/lib/facilities/repository';
import {
  TRAINING_BONUS, RECOVERY_BONUS, TECHNICAL_RISK_REDUCTION, TEAM_CENTER_RIDER_CAPACITY, TEAM_CENTER_STAFF_CAPACITY,
  upgradePrice, type FacilityId, type FacilityLevel,
} from '@/lib/facilities/config';
import { scoutingAccuracyLabelKey } from '@/lib/facilities/scouting';
import { getMyBikeCondition, computeServiceQuote, processCompletedBikeWear } from '@/lib/facilities/bike';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { FacilityCard, type FacilityCardProps } from '@/components/facilities/FacilityCard';
import { BikeServiceCard } from '@/components/facilities/BikeServiceCard';

/**
 * Real local assets only (see the chat report — the requested path was
 * `/groundoka/...`, the files actually live under `public/ground/...`;
 * verified the 5 files exist there and used the real path rather than
 * silently guessing). Never remote, never a shared/duplicate image.
 */
const FACILITY_META: Record<FacilityId, { icon: string; nameKey: string; descKey: string; image: string }> = {
  training: { icon: 'chart', nameKey: 'facilities.trainingCenter', descKey: 'facilities.trainingDesc', image: '/ground/training.png' },
  recovery: { icon: 'heart', nameKey: 'facilities.recoveryCenter', descKey: 'facilities.recoveryDesc', image: '/ground/regeneracne.png' },
  scouting: { icon: 'search', nameKey: 'facilities.scoutingDept', descKey: 'facilities.scoutingDesc', image: '/ground/scouting.png' },
  technical: { icon: 'cog', nameKey: 'facilities.technicalFacility', descKey: 'facilities.technicalDesc', image: '/ground/technicke.png' },
  teamCenter: { icon: 'team', nameKey: 'facilities.teamCenter', descKey: 'facilities.teamCenterDesc', image: '/ground/timove.png' },
};

function pct(v: number): number {
  return Math.round(v * 100);
}

/**
 * Zázemie — a single page (no per-facility detail routes), five facility
 * cards in a 3-column grid + a compact info panel as the 6th cell + a Bike
 * Service section. All effect numbers come from lib/facilities/config.ts
 * (the one canonical source); all level/cap state comes from
 * lib/facilities/repository.ts, which defers every real cap/bypass
 * decision to the server (upgrade_facility(), see supabase/schema.sql).
 */
export default async function FacilitiesPage() {
  const { t, locale } = await getServerDictionary();
  const rider = await getMyRider();
  const [facilities, league, admin] = await Promise.all([getMyFacilities(), getMyLeague(), isAdmin()]);
  const caps = await getFacilityCaps(league, facilities);
  const effective = getEffectiveFacilities(facilities, caps);

  let bikeSection = null;
  if (rider) {
    await processCompletedBikeWear(rider.id);
    const condition = await getMyBikeCondition(rider.id);
    const quote = computeServiceQuote(condition, effective.technical);
    bikeSection = (
      <BikeServiceCard
        overall={condition.overall}
        riskBand={condition.riskBand}
        items={quote.items}
        discountedPrice={quote.discountedPrice}
        labels={{
          overall: t('facilities.bikeOverall'),
          tires: t('facilities.bikeTires'), brakes: t('facilities.bikeBrakes'), drivetrain: t('facilities.bikeDrivetrain'),
          recommended: t('facilities.bikeRecommended'),
          serviceCta: t('facilities.bikeServiceCta'),
          servicePrice: t('facilities.bikeServicePrice'),
          fullCondition: t('facilities.bikeFullCondition'),
          risk: {
            normal: t('facilities.riskNormal'), elevated: t('facilities.riskElevated'),
            high: t('facilities.riskHigh'), veryHigh: t('facilities.riskVeryHigh'),
          },
          financeNote: t('facilities.financeNote'),
          serviceError: t('facilities.serviceError'),
          componentLabel: { tires: t('facilities.bikeTires'), brakes: t('facilities.bikeBrakes'), drivetrain: t('facilities.bikeDrivetrain') },
        }}
      />
    );
  }

  function effectText(id: FacilityId, level: FacilityLevel): string {
    if (id === 'training') return t('facilities.trainingEffect', { pct: pct(TRAINING_BONUS[level]) });
    if (id === 'recovery') return t('facilities.recoveryEffect', { pct: pct(RECOVERY_BONUS[level]) });
    if (id === 'scouting') return t(scoutingAccuracyLabelKey(level));
    if (id === 'technical') return t('facilities.technicalEffect', { pct: pct(TECHNICAL_RISK_REDUCTION[level]) });
    return t('facilities.teamCenterEffect', { riders: TEAM_CENTER_RIDER_CAPACITY[level], staff: TEAM_CENTER_STAFF_CAPACITY[level] });
  }

  const cardLabels = {
    levelLabel: t('facilities.levelLabel'),
    currentEffect: t('facilities.currentEffect'),
    nextEffect: t('facilities.nextEffect'),
    priceLabel: t('facilities.price'),
    priceProvisional: t('facilities.priceProvisional'),
    upgradeCta: t('facilities.upgradeCta'),
    maxLevel: t('facilities.maxLevel'),
    cancel: t('facilities.cancel'),
    confirmUpgrade: t('facilities.confirmUpgrade'),
    upgrading: t('facilities.upgrading'),
    upgradeError: t('facilities.upgradeError'),
    devOverrideBadge: t('facilities.devOverrideBadge'),
    storedLevelNote: t('facilities.storedLevelNote'),
  };

  // Rookie is an onboarding league with facility progression locked
  // entirely (see lib/leagues.ts: maxFacilityLevel('rookie') === 1, so a
  // freshly-created rider is already AT the cap) — the admin/dev override
  // bypasses this for testing (isAdmin() forces the cap to 5 server-side,
  // see getFacilityCaps()), so an admin viewing their own Rookie account
  // never sees the Rookie-specific lock message.
  const rookieLockedForEveryone = league === 'rookie' && !admin;

  const cards: FacilityCardProps[] = (Object.keys(FACILITY_META) as FacilityId[]).map((id) => {
    const storedLevel = facilities[id];
    const effectiveLevel = effective[id];
    const cap = caps[id];
    const atMax = storedLevel >= 5;
    const locked = rookieLockedForEveryone || (!atMax && storedLevel >= cap);
    const name = t(FACILITY_META[id].nameKey);

    // Which limit is actually binding right now: whichever of the two caps
    // is lower is why `cap` has the value it does (see computeFacilityCaps
    // in lib/facilities/capMath.ts — cap is always the min of both). Works
    // unchanged for an admin/dev override too, since getFacilityCaps()
    // already folds the override into the league cap before caps are
    // computed.
    let lockedReason: string | null = null;
    if (rookieLockedForEveryone) {
      lockedReason = t('facilities.rookieLocked');
    } else if (locked) {
      const nextLevel = storedLevel + 1;
      const teamCenterCap = id === 'teamCenter' ? 5 : Math.min(5, facilities.teamCenter + 1);
      const isTeamCenterBound = id !== 'teamCenter' && teamCenterCap === cap;
      lockedReason = isTeamCenterBound
        ? t('facilities.lockedTeamCenter', { level: nextLevel })
        : t('facilities.lockedLeague', { level: nextLevel });
    }

    return {
      id,
      icon: FACILITY_META[id].icon,
      image: FACILITY_META[id].image,
      name,
      description: t(FACILITY_META[id].descKey),
      storedLevel,
      effectiveLevel,
      cap,
      currentEffectText: effectText(id, effectiveLevel),
      nextEffectText: atMax ? null : effectText(id, (storedLevel + 1) as FacilityLevel),
      price: atMax ? null : upgradePrice(id, storedLevel) ?? null,
      rookieLocked: rookieLockedForEveryone,
      lockedReason,
      devOverrideActive: admin && league === 'rookie' && cap > 1,
      labels: {
        ...cardLabels,
        confirmTitle: t('facilities.confirmTitle', { name, level: atMax ? storedLevel : storedLevel + 1 }),
      },
    };
  });

  return (
    <AppShell activeId="facilities" locale={locale}>
      <div className="space-y-3">
        <PageHeader icon={<Icon name="building" className="h-4.5 w-4.5" />} title={t('nav.facilities')} subtitle={t('facilities.subtitle')} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => <FacilityCard key={card.id} {...card} />)}

          <div className="flex flex-col justify-center rounded-card border border-line bg-surface p-4">
            <p className="text-sm font-bold text-navy">{t('facilities.infoPanelTitle')}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-navy-soft">{t('facilities.infoPanelText')}</p>
          </div>
        </div>

        {bikeSection && (
          <div>
            <p className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('facilities.bikeServiceTitle')}</p>
            {bikeSection}
          </div>
        )}
      </div>
    </AppShell>
  );
}
