import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { SKILL_ATTRIBUTES, ATTR_MIN, ATTR_MAX, type SkillAttribute } from '@/lib/rider/config';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule } from '@/data/tourSchedule';
import { getTrainingPlan, countTechnicalWeeksUsed, listRecentCompletedTrainings } from '@/lib/training/repository';
import { PERFORMANCE_FOCUS, TECHNICAL_FOCUS, MAX_TECHNICAL_WEEKS_PER_SEASON, potentialCeiling } from '@/lib/training/config';
import { processCompletedTrainings } from '@/lib/training/engine';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { RiderStatIcon } from '@/components/rider/RiderStatIcon';
import { getConditionStatIcon, getDevStatIcon, getSkillStatIcon, type ConditionKey } from '@/lib/rider/statIcons';
import { TrainingConfigForm } from '@/components/training/TrainingConfigForm';
import { saveTrainingAction } from './actions';

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

const TECHNIQUE_PREVIEW: SkillAttribute[] = ['descending', 'bikeHandling', 'cornering', 'packRiding'];
const TACTICS_KEYS: SkillAttribute[] = ['positioning', 'attackTiming', 'energyManagement'];

/**
 * Training decision page — separate top-level nav item (unchanged, see
 * lib/navigation.ts). Shows enough of the Rider to make a training call
 * without navigating away, but is not a second Rider profile: full Tactics/
 * Technique detail stays on /rider.
 *
 * Deliberately never shows a predicted gain. See lib/training/growth.ts for
 * why: the formula exists, but nothing computes or previews it here.
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
  const isRaceWeek = scheduled.some((v) => v.isCurrentWeek);

  const [plan, technicalUsed, recent] = await Promise.all([
    getTrainingPlan(season.seasonId, season.currentWeek),
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
              isRaceWeek ? 'bg-warn/10 text-warn' : 'bg-teal-rail text-teal-dark'
            }`}>
              {isRaceWeek ? t('trainingPage.raceWeek') : t('trainingPage.freeWeek')}
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
              showStatIcons statIconSize={20} showBars={false} />
          </div>

          {/* CENTER — training configuration */}
          <div className="col-span-12 lg:col-span-6">
            <Card dense>
              <div className="p-4">
                <TrainingConfigForm
                  seasonId={season.seasonId}
                  weekNumber={season.currentWeek}
                  isRaceWeek={isRaceWeek}
                  isCurrentWeek
                  initialPlan={plan}
                  performanceFocus={performanceOptions}
                  technicalFocus={technicalOptions}
                  technicalWeeksUsed={technicalUsed}
                  maxTechnicalWeeks={MAX_TECHNICAL_WEEKS_PER_SEASON}
                  labels={{
                    heading: t('trainingPage.settings'),
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
                    savedTitle: t('trainingPage.savedTitle'),
                    savedWeekType: t('trainingPage.weekTypeTechnical'),
                    raceWeekLocked: t('trainingPage.raceWeekLocked'),
                    technicalLimitReached: t('trainingPage.technicalLimitReached'),
                    technicalWeeksUsedLabel: t('trainingPage.technicalWeeksUsedLabel'),
                    focusRequired: t('trainingPage.focusRequired'),
                    saveError: t('trainingPage.saveError'),
                    saveSuccess: t('trainingPage.saveSuccess'),
                  }}
                  saveAction={saveTrainingAction}
                />
              </div>
            </Card>
          </div>

          {/* RIGHT — development, condition, tactics/technique */}
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
                  <span className="shrink-0 text-base font-bold tabular-nums text-navy">{rider.attributes.experience}</span>
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

            <AttributeGroup t={t} titleKey="group.tactics" icon="bolt" keys={TACTICS_KEYS} attributes={rider.attributes} showBars={false} />

            <Card title={<span className="text-sm text-teal-dark">{t('group.technique')}</span>} dense>
              <ul className="p-3.5">
                {TECHNIQUE_PREVIEW.map((k) => (
                  <li key={k} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-[15px] text-navy" title={t(`attr.${k}`)}>
                      {t(`attr.${k}`)}
                    </span>
                    <span className="shrink-0 text-base font-bold tabular-nums text-navy">{rider.attributes[k]}</span>
                  </li>
                ))}
              </ul>
              <a href="/rider"
                className="flex items-center justify-center gap-1 border-t border-line px-3.5 py-2 text-xs font-medium text-teal transition-colors hover:bg-teal-rail">
                {t('trainingPage.viewAll')}
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </Card>
          </div>
        </div>

        {/* BOTTOM — recent training history */}
        <Card title={t('trainingPage.recentHistory')} dense>
          {recent.length === 0 ? (
            <p className="p-3.5 text-sm text-navy-soft">{t('trainingPage.noHistory')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((h) => {
                const label = SKILL_ATTRIBUTES.includes(h.focus as SkillAttribute) ? t(`attr.${h.focus}`) : h.focus;
                const intensityLabel = h.intensity === 'light' ? t('trainingPage.intensityLight')
                  : h.intensity === 'hard' ? t('trainingPage.intensityHard') : t('trainingPage.intensityNormal');
                return (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">{label}</p>
                      <p className="text-2xs text-navy-muted">{intensityLabel} · {t('races.weekN', { n: h.weekNumber })}</p>
                    </div>
                    {h.primaryGain !== null && (
                      <span className="shrink-0 text-xs font-bold text-teal">
                        +{h.primaryGain} {t(`attr.${h.primaryAttr}`)}
                        {h.secondaryGain !== null && h.secondaryAttr && (
                          <>, +{h.secondaryGain} {t(`attr.${h.secondaryAttr}`)}</>
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
