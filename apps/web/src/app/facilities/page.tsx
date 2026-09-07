import { getServerDictionary } from '@/i18n/server';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * Zázemie — visual/cards shell only. No facilities table (level, effect,
 * upgrade cost) exists in the DB yet, so no level or bonus is invented —
 * each card names a real future category and states plainly that it isn't
 * configured yet. Reusable so a real level/effect/upgrade-cost model can
 * fill these same cards in later without restructuring the page.
 */
const CATEGORIES = [
  { icon: 'chart', labelKey: 'facilities.trainingCenter' },
  { icon: 'heart', labelKey: 'facilities.recoveryCenter' },
  { icon: 'search', labelKey: 'facilities.scoutingDept' },
  { icon: 'building', labelKey: 'facilities.technicalFacility' },
] as const;

export default async function FacilitiesPage() {
  const { t, locale } = await getServerDictionary();

  return (
    <AppShell activeId="facilities" locale={locale}>
      <div className="space-y-3">
        <PageHeader icon={<Icon name="building" className="h-4.5 w-4.5" />} title={t('nav.facilities')} subtitle={t('facilities.subtitle')} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CATEGORIES.map((c) => (
            <div key={c.labelKey} className="flex flex-col items-center gap-2.5 rounded-card border border-line bg-card p-5 text-center shadow-card">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-rail text-teal">
                <Icon name={c.icon} className="h-6 w-6" />
              </span>
              <p className="text-sm font-bold text-navy">{t(c.labelKey)}</p>
              <p className="text-2xs text-navy-soft">{t('facilities.notConfigured')}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
