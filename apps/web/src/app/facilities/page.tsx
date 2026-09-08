import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { isAdmin } from '@/lib/admin/auth';
import { getMyFacilities, getFacilityCaps, getMyLeague } from '@/lib/facilities/repository';
import {
  TRAINING_BONUS, RECOVERY_BONUS, TECHNICAL_RISK_REDUCTION, TEAM_CENTER_RIDER_CAPACITY, TEAM_CENTER_STAFF_CAPACITY,
  upgradePrice, type FacilityId, type FacilityLevel,
} from '@/lib/facilities/config';
import { scoutingAccuracyLabelKey } from '@/lib/facilities/scouting';
import { getMyBikeCondition, computeServiceQuote, processCompletedBikeWear } from '@/lib/facilities/bike';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { FacilityCard, type FacilityCardProps } from '@/components/facilities/FacilityCard';
import { BikeServiceCard } from '@/components/facilities/BikeServiceCard';

const FACILITY_META: Record<FacilityId, { icon: string; nameKey: string }> = {
  training: { icon: 'chart', nameKey: 'facilities.trainingCenter' },
  recovery: { icon: 'heart', nameKey: 'facilities.recoveryCenter' },
  scouting: { icon: 'search', nameKey: 'facilities.scoutingDept' },
  technical: { icon: 'cog', nameKey: 'facilities.technicalFacility' },
  teamCenter: { icon: 'team', nameKey: 'facilities.teamCenter' },
};

function pct(v: number): number {
  return Math.round(v * 100);
}

/**
 * Zázemie — a single page, five facility cards + a Bike Service section.
 * All effect numbers come from lib/facilities/config.ts (the one canonical
 * source, per item 17); all level state and caps come from
 * lib/facilities/repository.ts, which itself defers every real cap/bypass
 * decision to the server. See the chat report for what's real vs. what's
 * a documented BALANCE_PLACEHOLDER.
 */
export default async function FacilitiesPage() {
  const { t, locale } = await getServerDictionary();
  const rider = await getMyRider();
  const [facilities, league, admin] = await Promise.all([getMyFacilities(), getMyLeague(), isAdmin()]);
  const caps = await getFacilityCaps(league, facilities);

  let bikeSection = null;
  if (rider) {
    await processCompletedBikeWear(rider.id);
    const condition = await getMyBikeCondition(rider.id);
    const quote = computeServiceQuote(condition, facilities.technical);
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
  };

  const cards: FacilityCardProps[] = (Object.keys(FACILITY_META) as FacilityId[]).map((id) => {
    const level = facilities[id];
    const cap = caps[id];
    const atMax = level >= 5;
    const locked = !atMax && level >= cap;
    const name = t(FACILITY_META[id].nameKey);

    // Which limit is actually binding right now: whichever of the two caps
    // is lower is why `cap` has the value it does (see computeFacilityCaps
    // in lib/facilities/capMath.ts — cap is always the min of both). This
    // works unchanged for an admin/dev override too: getFacilityCaps()
    // already folds the override into `leagueCapForThisCall` before caps
    // are computed, so when Team Center is the binding constraint even for
    // an admin, teamCenterCap === cap is still exactly true.
    let lockedReason: string | null = null;
    if (locked) {
      const nextLevel = level + 1;
      const teamCenterCap = id === 'teamCenter' ? 5 : Math.min(5, facilities.teamCenter + 1);
      const isTeamCenterBound = id !== 'teamCenter' && teamCenterCap === cap;
      lockedReason = isTeamCenterBound
        ? t('facilities.lockedTeamCenter', { level: nextLevel })
        : t('facilities.lockedLeague', { level: nextLevel });
    }

    return {
      id,
      icon: FACILITY_META[id].icon,
      name,
      level,
      cap,
      currentEffectText: effectText(id, level),
      nextEffectText: atMax ? null : effectText(id, (level + 1) as FacilityLevel),
      price: atMax ? null : upgradePrice(id, level) ?? null,
      lockedReason,
      devOverrideActive: admin && league !== 'pro' && league !== 'elite' && cap === 5,
      labels: {
        ...cardLabels,
        confirmTitle: t('facilities.confirmTitle', { name, level: atMax ? level : level + 1 }),
      },
    };
  });

  return (
    <AppShell activeId="facilities" locale={locale}>
      <div className="space-y-3">
        <PageHeader icon={<Icon name="building" className="h-4.5 w-4.5" />} title={t('nav.facilities')} subtitle={t('facilities.subtitle')} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => <FacilityCard key={card.id} {...card} />)}
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
