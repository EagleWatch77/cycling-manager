import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { SKILL_ATTRIBUTES, ATTR_MIN, ATTR_MAX, POTENTIAL_MIN, POTENTIAL_MAX, type SkillAttribute } from '@/lib/rider/config';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule } from '@/data/tourSchedule';
import { getTrainingPlan, countTechnicalWeeksUsed, listRecentCompletedTrainings } from '@/lib/training/repository';
import { PERFORMANCE_FOCUS, TECHNICAL_FOCUS, MAX_TECHNICAL_WEEKS_PER_SEASON, potentialCeiling } from '@/lib/training/config';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { TrainingConfigForm } from '@/components/training/TrainingConfigForm';
import { saveTrainingAction } from './actions';

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

/** 55–95 "development rating" scale (trainability/professionalism/recovery) -> 0–100 bar. */
function pctDev(v: number) {
  return Math.max(0, Math.min(100, ((v - POTENTIAL_MIN) / (POTENTIAL_MAX - POTENTIAL_MIN)) * 100));
}
/** Same normalisation AttributeGroup uses for the 100–160 skill scale. */
function pctAttr(v: number) {
  return Math.max(0, Math.min(100, ((v - 90) / (ATTR_MAX - 90)) * 100));
}

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
  const rider = await getMyRider();

  if (!rider) {
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

  const condition = [
    { key: 'rider.energy', value: rider.condition.energy },
    { key: 'rider.fatigue', value: rider.condition.fatigue },
    { key: 'rider.form', value: rider.condition.form },
    { key: 'rider.fitness', value: rider.condition.fitness },
    { key: 'rider.morale', value: rider.condition.morale },
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

            <AttributeGroup t={t} titleKey="group.performance" icon="chart" keys={PERFORMANCE_FOCUS} attributes={rider.attributes} />
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
            <Card title={t('group.development')} dense>
              <ul className="space-y-2.5 p-3.5">
                <li>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xs text-navy-muted">{t('dev.potential')}</span>
                    <span className="text-xs font-bold text-navy">{potentialLow}–{potentialHigh}</span>
                  </div>
                </li>
                <li>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xs text-navy-muted">{t('dev.trainability')}</span>
                    <span className="text-xs font-bold text-navy">{rider.trainability}</span>
                  </div>
                  <ProgressBar value={pctDev(rider.trainability)} className="mt-1" />
                </li>
                <li>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xs text-navy-muted">{t('dev.professionalism')}</span>
                    <span className="text-xs font-bold text-navy">{rider.professionalism}</span>
                  </div>
                  <ProgressBar value={pctDev(rider.professionalism)} className="mt-1" />
                </li>
                <li>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xs text-navy-muted">{t('dev.recovery')}</span>
                    <span className="text-xs font-bold text-navy">{rider.recovery}</span>
                  </div>
                  <ProgressBar value={pctDev(rider.recovery)} className="mt-1" />
                </li>
                <li>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xs text-navy-muted">{t('attr.experience')}</span>
                    <span className="text-xs font-bold text-navy">{rider.attributes.experience}</span>
                  </div>
                  <ProgressBar value={pctAttr(rider.attributes.experience)} className="mt-1" />
                </li>
              </ul>
            </Card>

            <Card title={t('group.condition')} dense>
              <ul className="space-y-2.5 p-3.5">
                {condition.map((c) => (
                  <li key={c.key}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xs text-navy-muted">{t(c.key)}</span>
                      <span className="text-xs font-bold text-navy">{c.value}</span>
                    </div>
                    <ProgressBar value={c.value} tone={c.value < 40 ? 'warn' : 'teal'} className="mt-1" />
                  </li>
                ))}
              </ul>
            </Card>

            <AttributeGroup t={t} titleKey="group.tactics" icon="bolt" keys={TACTICS_KEYS} attributes={rider.attributes} />

            <Card title={t('group.technique')} dense>
              <ul className="space-y-1.5 p-3.5">
                {TECHNIQUE_PREVIEW.map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-2xs text-navy-soft">{t(`attr.${k}`)}</span>
                    <ProgressBar value={pctAttr(rider.attributes[k])} className="flex-1" />
                    <span className="w-7 text-right text-2xs font-bold tabular-nums text-navy">{rider.attributes[k]}</span>
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
