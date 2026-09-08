import { getServerDictionary } from '@/i18n/server';
import { isAdmin } from '@/lib/admin/auth';
import { getMyFacilities, getFacilityCaps, getMyLeague, getEffectiveFacilities } from '@/lib/facilities/repository';
import {
  TRAINING_BONUS, RECOVERY_BONUS, TECHNICAL_RISK_REDUCTION, TEAM_CENTER_RIDER_CAPACITY, TEAM_CENTER_STAFF_CAPACITY,
  upgradePrice, type FacilityId, type FacilityLevel,
} from '@/lib/facilities/config';
import { scoutingAccuracyLabelKey } from '@/lib/facilities/scouting';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { FacilityCard, type FacilityCardProps } from '@/components/facilities/FacilityCard';

/**
 * Real local assets only — verified to exist under public/ground/.
 */
const FACILITY_META: Record<FacilityId, { icon: string; nameKey: string; descKey: string; image: string }> = {
  training: { icon: 'chart', nameKey: 'facilities.trainingCenter', descKey: 'facilities.trainingDesc', image: '/ground/training.png' },
  recovery: { icon: 'heart', nameKey: 'facilities.recoveryCenter', descKey: 'facilities.recoveryDesc', image: '/ground/regeneracne.png' },
  scouting: { icon: 'search', nameKey: 'facilities.scoutingDept', descKey: 'facilities.scoutingDesc', image: '/ground/scouting.png' },
  technical: { icon: 'cog', nameKey: 'facilities.technicalFacility', descKey: 'facilities.technicalDesc', image: '/ground/technicke.png' },
  teamCenter: { icon: 'team', nameKey: 'facilities.teamCenter', descKey: 'facilities.teamCenterDesc', image: '/ground/timove.png' },
};

/** Card render order — Zázemie UI redesign V2 (see the chat report, item 3). */
const FACILITY_ORDER: readonly FacilityId[] = ['training', 'recovery', 'scouting', 'technical', 'teamCenter'];

function pct(v: number): number {
  return Math.round(v * 100);
}

/**
 * Zázemie — a single page (no per-facility detail routes, no Bike Service
 * section, no "Ako funguje Zázemie" info panel — both removed in the
 * Zázemie UI redesign V2, see the chat report: this page is now just a
 * header + 5 compact facility cards). All effect numbers still come from
 * lib/facilities/config.ts (the one canonical source, UNCHANGED — this is
 * a visual/UX redesign only, no game-logic/economy change); all
 * level/cap state comes from lib/facilities/repository.ts, which defers
 * every real cap/bypass decision to the server (upgrade_facility(), see
 * supabase/schema.sql).
 */
export default async function FacilitiesPage() {
  const { t, locale } = await getServerDictionary();
  const [facilities, league, admin] = await Promise.all([getMyFacilities(), getMyLeague(), isAdmin()]);
  const caps = await getFacilityCaps(league, facilities);
  const effective = getEffectiveFacilities(facilities, caps);

  /**
   * Current-effect title/subtitle per facility — Training Center uses the
   * already-agreed age-focused identity per level (item 9 of the chat
   * report: NEVER an invented percentage — the numeric subtitle is the
   * SAME canonical TRAINING_BONUS this page always used, just paired with
   * the identity text instead of a bare "+X%" line; L1 has a 0% bonus so
   * no subtitle is shown there, only the identity). Every other facility
   * keeps its existing single-line canonical effect text as the title,
   * unchanged from before this redesign.
   */
  function currentEffect(id: FacilityId, level: FacilityLevel): { title: string; subtitle: string | null } {
    if (id === 'training') {
      const title = t(`facilities.trainingIdentity.l${level}`);
      const bonus = TRAINING_BONUS[level];
      return { title, subtitle: bonus > 0 ? t('facilities.trainingBonus', { pct: pct(bonus) }) : null };
    }
    if (id === 'recovery') return { title: t('facilities.recoveryEffect', { pct: pct(RECOVERY_BONUS[level]) }), subtitle: null };
    if (id === 'scouting') return { title: t(scoutingAccuracyLabelKey(level)), subtitle: null };
    if (id === 'technical') return { title: t('facilities.technicalEffect', { pct: pct(TECHNICAL_RISK_REDUCTION[level]) }), subtitle: null };
    return { title: t('facilities.teamCenterEffect', { riders: TEAM_CENTER_RIDER_CAPACITY[level], staff: TEAM_CENTER_STAFF_CAPACITY[level] }), subtitle: null };
  }

  function effectFlat(id: FacilityId, level: FacilityLevel): string {
    const { title, subtitle } = currentEffect(id, level);
    return subtitle ? `${title} — ${subtitle}` : title;
  }

  const cardLabels = {
    levelLabel: t('facilities.levelLabel'),
    currentEffect: t('facilities.currentEffect'),
    nextEffect: t('facilities.nextEffect'),
    levelTransition: t('facilities.levelTransition'),
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

  const cards: FacilityCardProps[] = FACILITY_ORDER.map((id) => {
    const storedLevel = facilities[id];
    const effectiveLevel = effective[id];
    const cap = caps[id];
    const atMax = storedLevel >= 5;
    const locked = rookieLockedForEveryone || (!atMax && storedLevel >= cap);
    const name = t(FACILITY_META[id].nameKey);
    const effect = currentEffect(id, effectiveLevel);

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
      currentEffectTitle: effect.title,
      currentEffectSubtitle: effect.subtitle,
      nextEffectText: atMax ? null : effectFlat(id, (storedLevel + 1) as FacilityLevel),
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
      <div className="space-y-2.5">
        <PageHeader icon={<Icon name="building" className="h-4.5 w-4.5" />} title={t('nav.facilities')} subtitle={t('facilities.subtitle')} />

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((card) => <FacilityCard key={card.id} {...card} />)}
        </div>
      </div>
    </AppShell>
  );
}
