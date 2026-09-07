import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import {
  SKILL_ATTRIBUTES, ATTR_MIN, ATTR_MAX,
  POTENTIAL_MIN, POTENTIAL_MAX, TRAINABILITY_MIN, TRAINABILITY_MAX,
  PROFESSIONALISM_MIN, PROFESSIONALISM_MAX, RECOVERY_MIN, RECOVERY_MAX,
  type SkillAttribute,
} from '@/lib/rider/config';
import { scoreToLevel, potentialToStars } from '@/lib/rider/development';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule } from '@/data/tourSchedule';
import { getTrainingPlan, listRecentCompletedTrainings } from '@/lib/training/repository';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { processCompletedTrainings } from '@/lib/training/engine';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { DevAttributeRow } from '@/components/rider/DevAttributeRow';
import { ConditionRow, type Trend } from '@/components/rider/ConditionRow';
import { getConditionStatIcon, getDevStatIcon, getSkillStatIcon, type ConditionKey } from '@/lib/rider/statIcons';
import { TrainingConfigForm } from '@/components/training/TrainingConfigForm';
import { saveTrainingAction } from './actions';

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

/**
 * Tactics/Technique attribute sets shown for reference on this page. Kept to
 * exactly the real SkillAttribute ids the rider data model has (see
 * lib/rider/config.ts) — the race engine's own AttributeKey type additionally
 * has `reaction` and `timeTrial`, which the web app's rider generator never
 * produces yet, and a `breakawayEffort` which is an in-race tactical choice
 * enum, not a persistent rider skill — none of the three are invented here.
 * See the chat report for the full architecture note.
 */
const TECHNIQUE_KEYS: SkillAttribute[] = ['descending', 'bikeHandling', 'cornering', 'packRiding', 'roughSurface'];
const TACTICS_KEYS: SkillAttribute[] = ['positioning', 'attackTiming', 'energyManagement'];

/**
 * Training decision page — separate top-level nav item (unchanged, see
 * lib/navigation.ts). Shows enough of the Rider to make a training call
 * without navigating away, but is not a second Rider profile: full Tactics/
 * Technique detail stays on /rider.
 *
 * Only Performance is trainable here — Tactics and Technique grow through
 * race processing, never through a plan created on this page (see
 * TrainingConfigForm, which only ever offers PERFORMANCE_FOCUS).
 *
 * Green "+N" bonuses shown anywhere on this page are real: they come only
 * from the most recently *processed* training's persisted primary/secondary
 * gain (lib/training/repository.ts), never fabricated or previewed.
 *
 * A plan, once confirmed, is permanent — no edit, no cancel — until the
 * engine processes it. Races never gate whether training can be scheduled;
 * `currentWeekHasRace` only drives the informational header badge.
 */
export default async function TrainingPage() {
  const { t, locale } = await getServerDictionary();
  const riderBeforeProcessing = await getMyRider();

  if (!riderBeforeProcessing) {
    return (
      <AppShell activeId="training" locale={locale}>
        <Card className="col-span-12">
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-rail text-teal">
              <Icon name="rider" className="h-8 w-8" />
            </span>
            <p className="text-sm font-bold text-navy">{t('rider.createTitle')}</p>
            <p className="max-w-xs text-xs text-navy-soft">{t('rider.createText')}</p>
            <a href="/rider"
              className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark">
              {t('rider.createCta')}
            </a>
          </div>
        </Card>
      </AppShell>
    );
  }

  const season = getCurrentSeasonInfo();

  // Resolves any past-week training the calendar has already moved on from —
  // see lib/training/engine.ts for why this is where that step lives. Must
  // run before the rider is re-read below, since it may update attributes.
  await processCompletedTrainings(season);
  const rider = (await getMyRider()) ?? riderBeforeProcessing;

  const scheduled = getSeasonSchedule(season);
  // Purely informational (header badge) — never gates training planning.
  const currentWeekHasRace = scheduled.some((v) => v.isCurrentWeek);

  // Training can only ever be scheduled one week ahead of right now — see
  // plannableWeekNumber() in lib/training/repository.ts, which enforces this
  // server-side too. Clamped at the season's last week (no week beyond it).
  // A race in this (or any) week has no bearing on whether it's plannable.
  const plannableWeek = Math.min(season.currentWeek + 1, season.totalWeeks);

  const [plan, recent] = await Promise.all([
    getTrainingPlan(season.seasonId, plannableWeek),
    listRecentCompletedTrainings(3),
  ]);

  const performanceOptions = PERFORMANCE_FOCUS.map((a) => ({ id: a, label: t(`attr.${a}`) }));

  // Rozvoj never shows exact development numbers — only a 1-5 visual read.
  // See lib/rider/development.ts for the centralized value->level mapping.
  const potentialStars = potentialToStars(rider.potential, POTENTIAL_MIN, POTENTIAL_MAX);
  const trainabilityLevel = scoreToLevel(rider.trainability, TRAINABILITY_MIN, TRAINABILITY_MAX);
  const professionalismLevel = scoreToLevel(rider.professionalism, PROFESSIONALISM_MIN, PROFESSIONALISM_MAX);
  const recoveryLevel = scoreToLevel(rider.recovery, RECOVERY_MIN, RECOVERY_MAX);
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

  // Stav jazdca trends: a direction, never a fabricated number. The engine
  // (lib/training/engine.ts) is the only thing that ever changes condition,
  // and it always costs energy and adds fatigue when a plan is processed —
  // form/fitness/morale have no driver of change yet, so their trend is
  // honestly flat until the game design gives them one. `hasProcessedTraining`
  // is a real persisted fact (at least one applied training exists), not a
  // guess about "now".
  const hasProcessedTraining = recent.length > 0;
  const conditionRows: { key: string; conditionKey: ConditionKey; value: number; trend: Trend; goodDirection: 'up' | 'down' }[] = [
    { key: 'rider.energy', conditionKey: 'energy', value: rider.condition.energy, trend: hasProcessedTraining ? 'down' : 'flat', goodDirection: 'up' },
    { key: 'rider.fatigue', conditionKey: 'fatigue', value: rider.condition.fatigue, trend: hasProcessedTraining ? 'up' : 'flat', goodDirection: 'down' },
    { key: 'rider.form', conditionKey: 'form', value: rider.condition.form, trend: 'flat', goodDirection: 'up' },
    { key: 'rider.fitness', conditionKey: 'fitness', value: rider.condition.fitness, trend: 'flat', goodDirection: 'up' },
    { key: 'rider.morale', conditionKey: 'morale', value: rider.condition.morale, trend: 'flat', goodDirection: 'up' },
  ];

  // "Posledné tréningy": completed weeks plus the currently scheduled one
  // (if any), so the player sees where it sits relative to what already ran.
  type HistoryRow = { key: string; weekNumber: number; label: string; done: boolean };
  const historyRows: HistoryRow[] = [
    ...recent.map((h): HistoryRow => ({
      key: h.id,
      weekNumber: h.weekNumber,
      label: SKILL_ATTRIBUTES.includes(h.focus as SkillAttribute) ? t(`attr.${h.focus}`) : h.focus,
      done: true,
    })),
    ...(plan && !plan.appliedAt
      ? [{
          key: plan.id,
          weekNumber: plan.weekNumber,
          label: SKILL_ATTRIBUTES.includes(plan.focus as SkillAttribute) ? t(`attr.${plan.focus}`) : plan.focus,
          done: false,
        } satisfies HistoryRow]
      : []),
  ];

  return (
    <AppShell activeId="training" locale={locale}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-navy">{t('trainingPage.title')}</h1>
            <p className="mt-0.5 text-sm font-medium text-navy-soft">{t('trainingPage.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-2xs text-navy-muted">
            <Icon name="calendar" className="h-3.5 w-3.5 text-teal" />
            <span>
              {t('races.season')} {season.seasonNumber} · {t('races.week')} {season.currentWeek} / {season.totalWeeks}
            </span>
            <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
              currentWeekHasRace ? 'bg-warn/10 text-warn' : 'bg-teal-rail text-teal-dark'
            }`}>
              {currentWeekHasRace ? t('trainingPage.raceWeek') : t('trainingPage.freeWeek')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3">
          {/* LEFT — rider summary + performance attributes */}
          <div className="col-span-12 space-y-3 lg:col-span-3">
            <Card dense>
              <div className="flex items-center gap-3 p-3.5">
                <RiderAvatar seed={rider.id} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-base font-bold leading-tight text-navy">
                    {rider.firstName} {rider.surname}
                  </p>
                  <p className="text-2xs text-navy-muted">
                    {FLAGS[rider.countryIso2] ?? '🏳️'} {rider.countryName} · {rider.age} {t('rider.age').toLowerCase()}
                  </p>
                  <p className="text-2xs text-navy-muted">{t(`style.${rider.inferredArchetype}`)}</p>
                  <span className="mt-1 inline-block rounded bg-teal-light px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-dark">
                    {t('league.rookie')}
                  </span>
                </div>
              </div>
            </Card>

            <AttributeGroup t={t} titleKey="group.performance" icon="chart" keys={PERFORMANCE_FOCUS} attributes={rider.attributes}
              showStatIcons statIconSize={24} showBars={false} bonuses={bonuses} />
          </div>

          {/* CENTER — training configuration */}
          <div className="col-span-12 lg:col-span-6">
            <Card dense>
              <div className="p-4">
                <TrainingConfigForm
                  seasonId={season.seasonId}
                  weekNumber={plannableWeek}
                  totalWeeks={season.totalWeeks}
                  initialPlan={plan}
                  performanceFocus={performanceOptions}
                  labels={{
                    forWeek: t('trainingPage.forWeek'),
                    confirmedTitle: t('trainingPage.savedTitle'),
                    statusLabel: t('trainingPage.statusLabel'),
                    statusPlanned: t('trainingPage.statusPlanned'),
                    weekTypePerformance: t('trainingPage.weekTypePerformance'),
                    focusLabel: t('trainingPage.focus'),
                    intensityLabel: t('trainingPage.intensity'),
                    intensityLight: t('trainingPage.intensityLight'),
                    intensityNormal: t('trainingPage.intensityNormal'),
                    intensityHard: t('trainingPage.intensityHard'),
                    save: t('trainingPage.save'),
                    saving: t('trainingPage.saving'),
                    focusRequired: t('trainingPage.focusRequired'),
                    saveError: t('trainingPage.saveError'),
                  }}
                  saveAction={saveTrainingAction}
                />
              </div>
            </Card>
          </div>

          {/* RIGHT — development, condition */}
          <div className="col-span-12 space-y-3 lg:col-span-3">
            <Card title={<span className="text-sm text-teal-dark">{t('group.development')}</span>} dense>
              <ul className="p-3.5">
                <DevAttributeRow variant="stars" icon={getDevStatIcon('potential')} label={t('dev.potential')} level={potentialStars} />
                <DevAttributeRow variant="segments" icon={getDevStatIcon('trainability')} label={t('dev.trainability')} level={trainabilityLevel} accentClass="bg-purple-500" />
                <DevAttributeRow variant="segments" icon={getDevStatIcon('professionalism')} label={t('dev.professionalism')} level={professionalismLevel} accentClass="bg-blue-500" />
                <DevAttributeRow variant="segments" icon={getDevStatIcon('recovery')} label={t('dev.recovery')} level={recoveryLevel} accentClass="bg-green-500" />
                <DevAttributeRow variant="segments" icon={getSkillStatIcon('experience')} label={t('attr.experience')} level={experienceLevel} accentClass="bg-orange-500" />
              </ul>
            </Card>

            <Card title={<span className="text-sm text-teal-dark">{t('group.condition')}</span>} dense>
              <ul className="p-3.5">
                {conditionRows.map((c) => (
                  <ConditionRow key={c.key} icon={getConditionStatIcon(c.conditionKey)} label={t(c.key)}
                    value={c.value} trend={c.trend} goodDirection={c.goodDirection} />
                ))}
              </ul>
            </Card>
          </div>
        </div>

        {/* BOTTOM — recent training history, tactics, technique, side by side */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_0.9fr_1fr]">
          <Card title={<span className="text-sm text-teal-dark">{t('trainingPage.recentHistory')}</span>} dense>
            {historyRows.length === 0 ? (
              <p className="p-3.5 text-sm text-navy-soft">{t('trainingPage.noHistory')}</p>
            ) : (
              <ul className="p-3.5">
                {historyRows.map((h) => (
                  <li key={h.key} className="flex items-center justify-between gap-2.5 border-b border-line py-2 last:border-0">
                    <span className="min-w-0 truncate text-[15px] text-navy">
                      {t('races.weekN', { n: h.weekNumber })} · {h.label}
                    </span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold uppercase ${
                      h.done ? 'bg-surface text-navy-muted' : 'bg-teal-rail text-teal-dark'
                    }`}>
                      {h.done ? t('trainingPage.statusDone') : t('trainingPage.statusPlanned')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <AttributeGroup t={t} titleKey="group.tactics" icon="bolt" keys={TACTICS_KEYS} attributes={rider.attributes}
            showBars={false} bonuses={bonuses} />

          <Card title={<span className="text-sm text-teal-dark">{t('group.technique')}</span>} dense>
            <ul className="p-3.5">
              {TECHNIQUE_KEYS.map((k) => (
                <li key={k} className="grid grid-cols-[minmax(0,1fr)_60px_42px] items-center gap-2 border-b border-line py-2 last:border-0">
                  <span className="min-w-0 truncate text-[15px] text-navy" title={t(`attr.${k}`)}>
                    {t(`attr.${k}`)}
                  </span>
                  <span className="text-right text-base font-semibold tabular-nums text-navy">{rider.attributes[k]}</span>
                  <span className="text-right text-xs font-bold tabular-nums text-teal-dark">
                    {bonuses[k] != null ? `+${bonuses[k]}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
