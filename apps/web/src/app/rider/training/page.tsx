import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import {
  SKILL_ATTRIBUTES,
  ATTR_MIN,
  ATTR_MAX,
  TACTICS_ATTRIBUTES,
  TECHNIQUE_ATTRIBUTES,
  type SkillAttribute,
} from '@/lib/rider/config';
import { scoreToLevel } from '@/lib/rider/development';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule, getScheduleForTour } from '@/data/tourSchedule';
import { getMySeasonRegistrations } from '@/lib/races/registration';
import { plannableWeek as getPlannableWeek } from '@/lib/training/planning';
import { getTrainingPlan, listRecentCompletedTrainings } from '@/lib/training/repository';
import { PERFORMANCE_FOCUS, TECHNICAL_FOCUS } from '@/lib/training/config';
import { processCompletedTrainings } from '@/lib/training/engine';
import { Card } from '@/components/ui/Card';
import { CardTitle } from '@/components/ui/CardTitle';
import { Icon } from '@/components/ui/Icon';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { DevAttributeRow } from '@/components/rider/DevAttributeRow';
import { ConditionRow, type Trend } from '@/components/rider/ConditionRow';
import { getConditionStatIcon, getDevStatIcon, getSkillStatIcon, type ConditionKey } from '@/lib/rider/statIcons';
import { HistoryToggle } from '@/components/training/HistoryToggle';
import { RiderProgressCard } from '@/components/rider/RiderProgressCard';
import { getMyRiderProgress } from '@/lib/rider/progressRepository';
import { TrainingConfigForm } from '@/components/training/TrainingConfigForm';
import { saveTrainingAction } from './actions';

// Tactics/Technique attribute sets shown for reference on this page now come
// from the centralized TACTICS_ATTRIBUTES/TECHNIQUE_ATTRIBUTES (see
// lib/rider/config.ts) — previously duplicated locally here.

/**
 * Tréning tab of the rider profile (moved from the old top-level /training
 * route — see lib/navigation.ts). Reuses the exact same training
 * components/repository/engine/DB tables as before; only the shell changed.
 * Identity (avatar/name/country/age/archetype/rookie badge) is no longer
 * duplicated here — RiderProfileHeader in app/rider/layout.tsx already shows
 * it once above the tabs. rider is guaranteed non-null here (layout already
 * returned the empty state otherwise), but training processing below may
 * still change it, so we keep the "before/after" resilience pattern.
 *
 * Unified Weekly Training V1 (see the chat report): a rider plans exactly
 * ONE plan per week, of exactly one of two types — Performance (7 focuses,
 * Light/Normal/Hard session count) or Technical (6 Technique focuses,
 * always 1 session, hard-capped at +1 integer point/week). Tactics is
 * never trainable here — it grows only through a future race-situations
 * system (see TrainingConfigForm, which offers exactly PERFORMANCE_FOCUS
 * and TECHNICAL_FOCUS, nothing else).
 *
 * Green "+N" bonuses shown anywhere on this page are real: they come only
 * from the most recently *processed* training's persisted primary/secondary
 * gain (lib/training/repository.ts), never fabricated or previewed.
 *
 * A plan, once confirmed, is permanent — no edit, no cancel — until the
 * engine processes it. Races never gate whether training can be scheduled;
 * `currentWeekHasRace` only drives the informational header badge.
 */
export default async function RiderTrainingPage({
  searchParams,
}: {
  searchParams?: Promise<{ history?: string }>;
}) {
  const { t } = await getServerDictionary();
  const riderBeforeProcessing = (await getMyRider())!;

  const season = getCurrentSeasonInfo();

  // Resolves any past-week training the calendar has already moved on from —
  // see lib/training/engine.ts for why this is where that step lives. Must
  // run before the rider is re-read below, since it may update attributes.
  await processCompletedTrainings(season);
  const rider = (await getMyRider()) ?? riderBeforeProcessing;

  const scheduled = getSeasonSchedule(season);
  // Purely informational (header badge) — never gates training planning.
  const currentWeekHasRace = scheduled.some((v) => v.isCurrentWeek);

  // Training is planned for the NEXT game week only (deadline Sunday 24:00 UTC);
  // in the last week (10) nothing is plannable. Display mirror of
  // public.training_plannable_week() — save_my_training_plan() recomputes it
  // server-side and never takes a season/week from the client.
  const plannable = getPlannableWeek(season);

  const [plan, recent, progress] = await Promise.all([
    getTrainingPlan(season.seasonId, plannable ?? season.currentWeek),
    listRecentCompletedTrainings(1),
    // Real baseline + (Premium) history; null (card hidden) when nothing is stored yet.
    getMyRiderProgress(rider.id),
  ]);

  // "Zobraziť históriu": per-attribute baseline/now/diff inside the existing cards. Only with a stored baseline.
  const showHistory = progress != null && (await searchParams)?.history === '1';
  const compareLabels = progress ? {
    from: progress.baseline.kind === 'tracking_start' ? t('progress.colStart') : t('progress.colAcquired'),
    now: t('progress.colNow'),
    delta: t('progress.colDelta'),
  } : null;
  const compare = showHistory && progress && compareLabels ? { from: progress.baseline.attributes, labels: compareLabels } : undefined;

  // Why a NEW plan cannot be made right now (a confirmed plan is always shown locked instead).
  // The Tour conflict is informational here; the database enforces it in both directions.
  let blocked: 'season-end' | 'tour-conflict' | null = null;
  if (!plan) {
    if (plannable == null) {
      blocked = 'season-end';
    } else {
      const registrations = await getMySeasonRegistrations(scheduled.map((v) => v.tour.id));
      if (registrations.some((r) => getScheduleForTour(r.tourId)?.weekNumber === plannable)) blocked = 'tour-conflict';
    }
  }
  const seasonLabel = `${t('races.season')} ${season.seasonNumber}`;
  const planCardTitle = plannable != null
    ? `${t('trainingPage.forWeek')} ${plannable} / ${season.totalWeeks} · ${seasonLabel}`
    : `${seasonLabel} · ${t('races.week')} ${season.currentWeek} / ${season.totalWeeks}`;

  const performanceOptions = PERFORMANCE_FOCUS.map((a) => ({ id: a, label: t(`attr.${a}`) }));
  const technicalOptions = TECHNICAL_FOCUS.map((a) => ({ id: a, label: t(`attr.${a}`) }));

  const dayLabels = [
    t('day.mon'), t('day.tue'), t('day.wed'), t('day.thu'), t('day.fri'), t('day.sat'), t('day.sun'),
  ];

  // Rozvoj never shows exact development numbers — only a 1-5 visual read.
  // See lib/rider/development.ts for the centralized value->level mapping.
  const { potentialStars, trainabilityLevel, professionalismLevel, recoveryLevel } = rider.estimates;
  const experienceLevel = scoreToLevel(rider.attributes.experience, ATTR_MIN, ATTR_MAX);

  // Real bonus overlay: only the single most recently processed training,
  // never anything guessed. Condition fields have no such gain in the real
  // model (training only ever costs energy/adds fatigue), so they never
  // carry a "+N" here.
  const lastCompleted = recent[0] ?? null;
  const bonuses: Partial<Record<SkillAttribute, number>> = {};
  if (lastCompleted?.primaryAttr && lastCompleted.primaryGain !== null) {
    bonuses[lastCompleted.primaryAttr as SkillAttribute] = lastCompleted.primaryGain;
  }
  if (lastCompleted?.secondaryAttr && lastCompleted.secondaryGain !== null) {
    bonuses[lastCompleted.secondaryAttr as SkillAttribute] = lastCompleted.secondaryGain;
  }

  // Stav jazdca trends: a real before/after diff, never inferred from "a
  // training happened recently". rider.conditionPrevious is a snapshot
  // written by the engine (lib/training/engine.ts) every time it changes
  // condition — see lib/rider/repository.ts. Equal to `condition` until the
  // rider's first processed training, so trend reads flat until then.
  const trendOf = (key: ConditionKey): Trend => {
    const now = rider.condition[key];
    const before = rider.conditionPrevious[key];
    if (now === before) return 'flat';
    return now > before ? 'up' : 'down';
  };
  const conditionRows: { key: string; conditionKey: ConditionKey; value: number; trend: Trend; goodDirection: 'up' | 'down' }[] = [
    { key: 'rider.energy', conditionKey: 'energy', value: rider.condition.energy, trend: trendOf('energy'), goodDirection: 'up' },
    { key: 'rider.fatigue', conditionKey: 'fatigue', value: rider.condition.fatigue, trend: trendOf('fatigue'), goodDirection: 'down' },
    { key: 'rider.form', conditionKey: 'form', value: rider.condition.form, trend: trendOf('form'), goodDirection: 'up' },
    { key: 'rider.fitness', conditionKey: 'fitness', value: rider.condition.fitness, trend: trendOf('fitness'), goodDirection: 'up' },
    { key: 'rider.morale', conditionKey: 'morale', value: rider.condition.morale, trend: trendOf('morale'), goodDirection: 'up' },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page text-navy">{t('trainingPage.title')}</h1>
          <p className="mt-0.5 text-sm font-medium text-navy-soft">{t('trainingPage.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-2xs text-navy-muted">
          <Icon name="calendar" className="h-3.5 w-3.5 text-teal" />
          <span>
            {t('races.season')} {season.seasonNumber} · {t('races.week')} {season.currentWeek} / {season.totalWeeks}
          </span>
          <span className={`ml-1 rounded px-1.5 py-0.5 text-2xs font-bold uppercase ${
            currentWeekHasRace ? 'bg-warn/10 text-warn' : 'bg-teal-rail text-teal-dark'
          }`}>
            {currentWeekHasRace ? t('trainingPage.raceWeek') : t('trainingPage.freeWeek')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* LEFT (wider) — planning is the main element. Training history is NOT shown here (kept in the database for later use, see DECISIONS C-041). */}
        <div className="col-span-12 space-y-3 lg:col-span-8">
          <Card title={<CardTitle icon="calendar">{planCardTitle}</CardTitle>} dense>
            <div className="p-3.5">
              <TrainingConfigForm
                weekNumber={plannable ?? season.totalWeeks}
                blocked={blocked}
                totalWeeks={season.totalWeeks}
                initialPlan={plan}
                performanceFocus={performanceOptions}
                technicalFocus={technicalOptions}
                dayLabels={dayLabels}
                labels={{
                  forWeek: t('trainingPage.forWeek'),
                  confirmedTitle: t('trainingPage.savedTitle'),
                  statusLabel: t('trainingPage.statusLabel'),
                  statusPlanned: t('trainingPage.statusPlanned'),
                  typePerformance: t('trainingPage.typePerformance'),
                  typeTechnical: t('trainingPage.typeTechnical'),
                  focusLabel: t('trainingPage.focus'),
                  intensityLabel: t('trainingPage.intensity'),
                  intensityLight: t('trainingPage.intensityLight'),
                  intensityNormal: t('trainingPage.intensityNormal'),
                  intensityHard: t('trainingPage.intensityHard'),
                  technicalSessionNote: t('trainingPage.technicalSessionNote'),
                  save: t('trainingPage.save'),
                  saving: t('trainingPage.saving'),
                  focusRequired: t('trainingPage.focusRequired'),
                  saveError: t('trainingPage.saveError'),
                  lockedNote: t('trainingPage.lockedNote'),
                  alreadyPlanned: t('trainingPage.alreadyPlanned'),
                  deadlineNote: t('trainingPage.deadlineNote'),
                  blockedSeasonEnd: t('trainingPage.blockedSeasonEnd'),
                  blockedTour: t('trainingPage.blockedTour'),
                }}
                saveAction={saveTrainingAction}
              />
            </div>
          </Card>
          {progress && (
            <RiderProgressCard
              t={t}
              baseline={progress.baseline.attributes}
              baselineKind={progress.baseline.kind}
              current={rider.attributes}
              history={progress.history}
            />
          )}
        </div>

        {/* RIGHT (narrower) — condition, then development */}
        <div className="col-span-12 space-y-3 lg:col-span-4">
          <Card title={<CardTitle icon="heart">{t('group.condition')}</CardTitle>} dense>
            <ul className="px-3.5 py-1">
              {conditionRows.map((c) => (
                <ConditionRow key={c.key} icon={getConditionStatIcon(c.conditionKey)} label={t(c.key)}
                  value={c.value} trend={c.trend} goodDirection={c.goodDirection} />
              ))}
            </ul>
          </Card>

          <Card title={<CardTitle icon="sprout">{t('group.development')}</CardTitle>} dense>
            <ul className="px-3.5 py-1">
              <DevAttributeRow variant="stars" icon={getDevStatIcon('potential')} label={t('dev.potential')} level={potentialStars} />
              <DevAttributeRow variant="segments" icon={getDevStatIcon('trainability')} label={t('dev.trainability')} level={trainabilityLevel} accentClass="bg-purple-500" />
              <DevAttributeRow variant="segments" icon={getDevStatIcon('professionalism')} label={t('dev.professionalism')} level={professionalismLevel} accentClass="bg-blue-500" />
              <DevAttributeRow variant="segments" icon={getDevStatIcon('recovery')} label={t('dev.recovery')} level={recoveryLevel} accentClass="bg-green-500" />
              <DevAttributeRow variant="segments" icon={getSkillStatIcon('experience')} label={t('attr.experience')} level={experienceLevel} accentClass="bg-orange-500"
                compare={compare ? { from: compare.from.experience, now: rider.attributes.experience, labels: compare.labels } : undefined} />
            </ul>
          </Card>
        </div>
      </div>

      {/* BOTTOM — the three detail cards in one row (same card as on Prehľad) */}
      {progress && (
        <div className="mb-3">
          <HistoryToggle on={showHistory} href={showHistory ? '/rider/training' : '/rider/training?history=1'}
            label={showHistory ? t('progress.hideHistory') : t('progress.showHistory')}
            hint={`${t('progress.compareWith')}: ${compareLabels?.from}`} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <AttributeGroup t={t} titleKey="group.performance" icon="chart" keys={PERFORMANCE_FOCUS} attributes={rider.attributes}
          showStatIcons statIconSize={24} showBars={false} bonuses={compare ? undefined : bonuses} compare={compare} />
        <AttributeGroup t={t} titleKey="group.tactics" icon="bolt" keys={TACTICS_ATTRIBUTES} attributes={rider.attributes}
          showStatIcons statIconSize={24} showBars={false} bonuses={compare ? undefined : bonuses} compare={compare} />
        <AttributeGroup t={t} titleKey="group.technique" icon="wheel" keys={TECHNIQUE_ATTRIBUTES} attributes={rider.attributes}
          showStatIcons statIconSize={24} showBars={false} bonuses={compare ? undefined : bonuses} compare={compare} />
      </div>
    </>
  );
}
