import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { SKILL_ATTRIBUTES, ATTR_MIN, ATTR_MAX, type SkillAttribute } from '@/lib/rider/config';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule } from '@/data/tourSchedule';
import { getTrainingPlan, countTechnicalWeeksUsed, listRecentCompletedTrainings } from '@/lib/training/repository';
import { PERFORMANCE_FOCUS, TECHNICAL_FOCUS, MAX_TECHNICAL_WEEKS_PER_SEASON, potentialCeiling } from '@/lib/training/config';
import { processCompletedTrainings } from '@/lib/training/engine';
import { calculateGrowth } from '@/lib/training/growth';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { RiderStatIcon } from '@/components/rider/RiderStatIcon';
import { getConditionStatIcon, getDevStatIcon, getSkillStatIcon, type ConditionKey } from '@/lib/rider/statIcons';
import { TrainingConfigForm, type ExpectedGrowthPreview } from '@/components/training/TrainingConfigForm';
import { saveTrainingAction, cancelTrainingAction } from './actions';

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

const TECHNIQUE_PREVIEW: SkillAttribute[] = ['descending', 'bikeHandling', 'cornering', 'packRiding', 'roughSurface'];
const TACTICS_KEYS: SkillAttribute[] = ['positioning', 'attackTiming', 'energyManagement'];

/**
 * Training decision page — separate top-level nav item (unchanged, see
 * lib/navigation.ts). Shows enough of the Rider to make a training call
 * without navigating away, but is not a second Rider profile: full Tactics/
 * Technique detail stays on /rider.
 *
 * Green "+N" bonuses shown anywhere on this page are real: they come only
 * from the most recently *processed* training's persisted primary/secondary
 * gain (lib/training/repository.ts), never fabricated. The one exception is
 * the "Očakávané prírastky" preview inside the still-scheduled plan card,
 * which is explicitly labelled as an estimate and computed live from the
 * real formula — see TrainingConfigForm.
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
  const currentWeekHasRace = scheduled.some((v) => v.isCurrentWeek);

  // Training can only ever be scheduled one week ahead of right now — see
  // plannableWeekNumber() in lib/training/repository.ts, which enforces this
  // server-side too. Clamped at the season's last week (no week beyond it).
  const plannableWeek = Math.min(season.currentWeek + 1, season.totalWeeks);
  const plannableWeekHasRace = scheduled.some((v) => v.schedule.weekNumber === plannableWeek);

  const [plan, technicalUsed, recent] = await Promise.all([
    getTrainingPlan(season.seasonId, plannableWeek),
    countTechnicalWeeksUsed(season.seasonId),
    listRecentCompletedTrainings(3),
  ]);

  const performanceOptions = PERFORMANCE_FOCUS.map((a) => ({ id: a, label: t(`attr.${a}`) }));
  const technicalOptions = TECHNICAL_FOCUS.map((a) => ({ id: a, label: t(`attr.${a}`) }));

  // Potential stays hidden: only a rescaled range around the true value, never the exact number.
  const ceiling = potentialCeiling(rider.potential);
  const potentialLow = Math.round(Math.max(ATTR_MIN, ceiling - 15));
  const potentialHigh = Math.round(Math.min(ATTR_MAX, ceiling + 15));

  const condition: { key: string; conditionKey: ConditionKey; value: number }[] = [
    { key: 'rider.energy', conditionKey: 'energy', value: rider.condition.energy },
    { key: 'rider.fatigue', conditionKey: 'fatigue', value: rider.condition.fatigue },
    { key: 'rider.form', conditionKey: 'form', value: rider.condition.form },
    { key: 'rider.fitness', conditionKey: 'fitness', value: rider.condition.fitness },
    { key: 'rider.morale', conditionKey: 'morale', value: rider.condition.morale },
  ];

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

  // Live estimate for the still-scheduled plan — same formula the engine
  // uses, computed against today's stats. Never persisted, never shown as
  // final; TrainingConfigForm labels it "expected", not "actual".
  const expectedGrowth: ExpectedGrowthPreview | null = plan && !plan.appliedAt
    ? (() => {
        const focus = plan.focus as SkillAttribute;
        const g = calculateGrowth({
          focus,
          intensity: plan.intensity,
          currentValue: rider.attributes[focus],
          trainability: rider.trainability,
          professionalism: rider.professionalism,
          age: rider.age,
          potential: rider.potential,
        });
        return {
          primaryLabel: t(`attr.${g.primaryAttr}`),
          primaryGain: g.primaryGain,
          secondaryLabel: g.secondaryAttr ? t(`attr.${g.secondaryAttr}`) : null,
          secondaryGain: g.secondaryGain ?? null,
        };
      })()
    : null;

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
            <p className="mt-0.5 text-sm text-navy-soft">{t('trainingPage.subtitle')}</p>
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
              showStatIcons statIconSize={20} showBars={false} bonuses={bonuses} />
          </div>

          {/* CENTER — training configuration */}
          <div className="col-span-12 lg:col-span-6">
            <Card dense>
              <div className="p-4">
                <TrainingConfigForm
                  seasonId={season.seasonId}
                  weekNumber={plannableWeek}
                  totalWeeks={season.totalWeeks}
                  isRaceWeek={plannableWeekHasRace}
                  // Always true: this form only ever targets `plannableWeek`
                  // (the one editable week), never a past or later one.
                  isCurrentWeek
                  initialPlan={plan}
                  performanceFocus={performanceOptions}
                  technicalFocus={technicalOptions}
                  technicalWeeksUsed={technicalUsed}
                  maxTechnicalWeeks={MAX_TECHNICAL_WEEKS_PER_SEASON}
                  expectedGrowth={expectedGrowth}
                  labels={{
                    heading: t('trainingPage.settings'),
                    windowTitle: t('trainingPage.windowTitle'),
                    plannedTitle: t('trainingPage.savedTitle'),
                    appliesTo: t('trainingPage.appliesTo'),
                    typeLabel: t('trainingPage.type'),
                    planningNote: t('trainingPage.planningNote'),
                    expectedGains: t('trainingPage.expectedGains'),
                    focusLabel: t('trainingPage.focus'),
                    intensityLabel: t('trainingPage.intensity'),
                    weekTypeLabel: t('trainingPage.weekType'),
                    weekTypePerformance: t('trainingPage.weekTypePerformance'),
                    weekTypeTechnical: t('trainingPage.weekTypeTechnical'),
                    intensityLight: t('trainingPage.intensityLight'),
                    intensityNormal: t('trainingPage.intensityNormal'),
                    intensityHard: t('trainingPage.intensityHard'),
                    save: t('trainingPage.save'),
                    saveEdit: t('trainingPage.saveEdit'),
                    saving: t('trainingPage.saving'),
                    edit: t('trainingPage.edit'),
                    cancelEdit: t('trainingPage.cancelEdit'),
                    cancelPlan: t('trainingPage.cancelPlan'),
                    cancelling: t('trainingPage.cancelling'),
                    savedTitle: t('trainingPage.savedTitle'),
                    savedWeekType: t('trainingPage.weekTypeTechnical'),
                    raceWeekLocked: t('trainingPage.raceWeekLocked'),
                    technicalLimitReached: t('trainingPage.technicalLimitReached'),
                    technicalWeeksUsedLabel: t('trainingPage.technicalWeeksUsedLabel'),
                    focusRequired: t('trainingPage.focusRequired'),
                    saveError: t('trainingPage.saveError'),
                    saveSuccess: t('trainingPage.saveSuccess'),
                    cancelError: t('trainingPage.cancelError'),
                  }}
                  saveAction={saveTrainingAction}
                  cancelAction={cancelTrainingAction}
                />
              </div>
            </Card>
          </div>

          {/* RIGHT — development, condition */}
          <div className="col-span-12 space-y-3 lg:col-span-3">
            <Card title={<span className="text-sm text-teal-dark">{t('group.development')}</span>} dense>
              <ul className="p-3.5">
                <li className="flex items-center gap-2.5 border-b border-line py-2">
                  <RiderStatIcon src={getDevStatIcon('potential')} alt={t('dev.potential')} size={20} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-navy">{t('dev.potential')}</span>
                  <span className="shrink-0 text-base font-bold tabular-nums text-navy">{potentialLow}–{potentialHigh}</span>
                </li>
                <li className="flex items-center gap-2.5 border-b border-line py-2">
                  <RiderStatIcon src={getDevStatIcon('trainability')} alt={t('dev.trainability')} size={20} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-navy">{t('dev.trainability')}</span>
                  <span className="shrink-0 text-base font-bold tabular-nums text-navy">{rider.trainability}</span>
                </li>
                <li className="flex items-center gap-2.5 border-b border-line py-2">
                  <RiderStatIcon src={getDevStatIcon('professionalism')} alt={t('dev.professionalism')} size={20} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-navy">{t('dev.professionalism')}</span>
                  <span className="shrink-0 text-base font-bold tabular-nums text-navy">{rider.professionalism}</span>
                </li>
                <li className="flex items-center gap-2.5 border-b border-line py-2">
                  <RiderStatIcon src={getDevStatIcon('recovery')} alt={t('dev.recovery')} size={20} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-navy">{t('dev.recovery')}</span>
                  <span className="shrink-0 text-base font-bold tabular-nums text-navy">{rider.recovery}</span>
                </li>
                <li className="flex items-center gap-2.5 py-2">
                  <RiderStatIcon src={getSkillStatIcon('experience')} alt={t('attr.experience')} size={20} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-navy">{t('attr.experience')}</span>
                  <span className="flex shrink-0 items-baseline justify-end gap-1 text-right">
                    <span className="text-base font-bold tabular-nums text-navy">{rider.attributes.experience}</span>
                    {bonuses.experience != null && (
                      <span className="text-xs font-bold tabular-nums text-teal-dark">+{bonuses.experience}</span>
                    )}
                  </span>
                </li>
              </ul>
            </Card>

            <Card title={<span className="text-sm text-teal-dark">{t('group.condition')}</span>} dense>
              <ul className="p-3.5">
                {condition.map((c) => (
                  <li key={c.key} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
                    <RiderStatIcon src={getConditionStatIcon(c.conditionKey)} alt={t(c.key)} size={20} />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-navy" title={t(c.key)}>
                      {t(c.key)}
                    </span>
                    <span className="shrink-0 text-base font-bold tabular-nums text-navy">{c.value}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        {/* BOTTOM — recent training history, tactics, technique, side by side */}
        <div className="grid grid-cols-12 gap-3">
          <Card title={<span className="text-sm text-teal-dark">{t('trainingPage.recentHistory')}</span>} dense
            className="col-span-12 lg:col-span-4">
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
            showBars={false} bonuses={bonuses} className="col-span-12 lg:col-span-4" />

          <Card title={<span className="text-sm text-teal-dark">{t('group.technique')}</span>} dense
            className="col-span-12 lg:col-span-4">
            <ul className="p-3.5">
              {TECHNIQUE_PREVIEW.map((k) => (
                <li key={k} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
                  <span className="min-w-0 flex-1 truncate text-[15px] text-navy" title={t(`attr.${k}`)}>
                    {t(`attr.${k}`)}
                  </span>
                  <span className="flex shrink-0 items-baseline justify-end gap-1 text-right">
                    <span className="text-base font-bold tabular-nums text-navy">{rider.attributes[k]}</span>
                    {bonuses[k] != null && (
                      <span className="text-xs font-bold tabular-nums text-teal-dark">+{bonuses[k]}</span>
                    )}
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
