import { getServerDictionary } from '@/i18n/server';
import { PublicHeader } from '@/components/public/PublicHeader';
import { HeroSection } from '@/components/public/HeroSection';
import { Icon } from '@/components/ui/Icon';

const STEPS = [
  { titleKey: 'how.step1.title', textKey: 'how.step1.text' },
  { titleKey: 'how.step2.title', textKey: 'how.step2.text' },
  { titleKey: 'how.step3.title', textKey: 'how.step3.text' },
];

const FEATURES = [
  { titleKey: 'feature.develop', textKey: 'feature.developText', icon: 'chart' },
  { titleKey: 'feature.plan', textKey: 'feature.planText', icon: 'calendar' },
  { titleKey: 'feature.compete', textKey: 'feature.competeText', icon: 'flag' },
  { titleKey: 'feature.tactics', textKey: 'feature.tacticsText', icon: 'bolt' },
];

/** Public landing page. A visitor sees this, never the dashboard. */
export default async function LandingPage() {
  const { t, locale } = await getServerDictionary();

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <PublicHeader t={t} locale={locale} />
      <main className="flex-1">
        <HeroSection t={t} />

        <section className="border-t border-line bg-card">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <h2 className="text-lg font-bold text-navy">{t('how.title')}</h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.titleKey} className="rounded-card border border-line p-4">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-light text-sm font-bold text-teal-dark">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 text-sm font-bold text-navy">{t(s.titleKey)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-navy-soft">{t(s.textKey)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <h2 className="text-lg font-bold text-navy">{t('feature.title')}</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <li key={f.titleKey} className="rounded-card border border-line bg-card p-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-rail text-teal">
                    <Icon name={f.icon} className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="mt-3 text-sm font-bold text-navy">{t(f.titleKey)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-navy-soft">{t(f.textKey)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-2xs text-navy-muted sm:px-6">
          <span className="font-semibold text-navy-soft">{t('app.name')}</span>
          <span>{t('app.tagline')}</span>
        </div>
      </footer>
    </div>
  );
}
