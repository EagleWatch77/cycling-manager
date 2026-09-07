import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { SKILL_ATTRIBUTES, type SkillAttribute } from '@/lib/rider/config';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Icon } from '@/components/ui/Icon';
import { AbilityRadar } from '@/components/rider/AbilityRadar';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { RiderStatIcon } from '@/components/rider/RiderStatIcon';
import { getSkillStatIcon } from '@/lib/rider/statIcons';

const FLAGS: Record<string, string> = {
  SK:'🇸🇰',CZ:'🇨🇿',PL:'🇵🇱',FR:'🇫🇷',IT:'🇮🇹',ES:'🇪🇸',BE:'🇧🇪',NL:'🇳🇱',
  DE:'🇩🇪',GB:'🇬🇧',US:'🇺🇸',AU:'🇦🇺',CO:'🇨🇴',DK:'🇩🇰',NO:'🇳🇴',SI:'🇸🇮',
};

const TABS = [
  'profile.overview', 'profile.stats', 'profile.results', 'profile.training',
  'profile.calendar', 'profile.development', 'profile.contract', 'profile.history',
];

/**
 * Attribute groups, following the reference layout, filled ONLY with the
 * attributes the engine actually has. Performance / Tactics / Technique split
 * the 15 skills into readable families; Experience sits on its own.
 */
const GROUPS: { titleKey: string; icon: string; keys: SkillAttribute[] }[] = [
  { titleKey: 'group.performance', icon: 'chart', keys: ['climbing', 'hills', 'flat', 'sprint', 'endurance', 'acceleration'] },
  { titleKey: 'group.tactics', icon: 'bolt', keys: ['positioning', 'attackTiming', 'energyManagement'] },
  { titleKey: 'group.technique', icon: 'wheel', keys: ['descending', 'bikeHandling', 'cornering', 'packRiding', 'roughSurface'] },
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

/** Full rider profile, built entirely from the player's real stored rider. */
export default async function RiderPage() {
  const { t, locale } = await getServerDictionary();
  const rider = await getMyRider();

  if (!rider) {
    return (
      <AppShell activeId="rider" locale={locale}>
        <Card className="col-span-12">
          <p className="text-sm text-navy-soft">{t('profile.noRider')}</p>
        </Card>
      </AppShell>
    );
  }

  const condition = [
    { key: 'rider.energy', value: rider.condition.energy },
    { key: 'rider.form', value: rider.condition.form },
    { key: 'rider.fitness', value: rider.condition.fitness },
    { key: 'rider.morale', value: rider.condition.morale },
  ];

  const strengths = [...SKILL_ATTRIBUTES]
    .map((k) => ({ key: k, value: rider.attributes[k] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <AppShell activeId="rider" locale={locale}>
      <div className="space-y-3">
        {/* Header */}
        <Card className="col-span-12" dense>
          <div className="flex flex-wrap items-center gap-5 p-4">
            <RiderAvatar seed={rider.id} size="lg" className="rounded-2xl" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight text-navy">
                {FLAGS[rider.countryIso2] ?? ''} {rider.firstName} {rider.surname}
              </h1>
              <p className="mt-0.5 text-sm text-navy-soft">
                {t('rider.age')} {rider.age} · {t('rider.style')}: {t(`style.${rider.inferredArchetype}`)}
              </p>
              <span className="mt-1.5 inline-block rounded bg-teal-light px-2 py-0.5 text-2xs font-bold uppercase text-teal-dark">
                {t('league.rookie')}
              </span>
            </div>
            <div className="ml-auto flex flex-wrap gap-4">
              {condition.map((c) => (
                <div key={c.key} className="w-28">
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xs text-navy-muted">{t(c.key)}</span>
                    <span className="text-2xs font-bold text-navy">{c.value}</span>
                  </div>
                  <ProgressBar value={c.value} className="mt-1" tone={c.value < 50 ? 'warn' : 'teal'} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1 border-t border-line px-4 py-2">
            {TABS.map((key, i) => (
              <span key={key}
                className={i === 0
                  ? 'rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white'
                  : 'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-navy-muted/70'}>
                {t(key)}
                {i > 0 && <span className="text-[9px]">· {t('profile.soon')}</span>}
              </span>
            ))}
          </div>
        </Card>

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

        {/* Attribute groups + strengths + potential */}
        <div className="grid grid-cols-12 gap-3">
          {GROUPS.map((g) => (
            <AttributeGroup key={g.titleKey} t={t} titleKey={g.titleKey} icon={g.icon}
              keys={g.keys} attributes={rider.attributes}
              showStatIcons={g.titleKey === 'group.performance'}
              className="col-span-12 sm:col-span-6 lg:col-span-3" />
          ))}
        </div>

        <div className="grid grid-cols-12 gap-3">
          <Card title={t('profile.strengths')} dense className="col-span-12 lg:col-span-6">
            <ul className="p-3.5">
              {strengths.map((s) => (
                <li key={s.key} className="flex items-center justify-between border-b border-line py-1.5 last:border-0">
                  <span className="flex items-center gap-2 text-sm text-navy-soft">
                    <RiderStatIcon src={getSkillStatIcon(s.key)} alt={t(`attr.${s.key}`)} size={24} />
                    {t(`attr.${s.key}`)}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-navy">{s.value}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('group.development')} dense className="col-span-12 lg:col-span-6">
            <div className="flex items-center gap-4 p-3.5">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
                style={{ background: `conic-gradient(#0e9384 ${rider.potential * 3.6}deg, #e8f4f2 0deg)` }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-sm font-bold text-navy">
                  {rider.potential}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-navy">{t('dev.potential')}</p>
                <p className="text-2xs leading-snug text-navy-soft">{t('profile.potentialNote')}</p>
                <p className="mt-1.5 flex items-center gap-2 text-2xs text-navy-muted">
                  {t('dev.trainability')}
                  <span className="font-bold text-navy">{rider.trainability}</span>
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
