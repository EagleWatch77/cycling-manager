import { getServerDictionary } from '@/i18n/server';
import { HeroSection } from '@/components/public/HeroSection';
import { LeaguePathCard } from '@/components/public/LeaguePathCard';

const STEPS = [
  { titleKey: 'how.step1.title', textKey: 'how.step1.text' },
  { titleKey: 'how.step2.title', textKey: 'how.step2.text' },
  { titleKey: 'how.step3.title', textKey: 'how.step3.text' },
];

/**
 * Public landing page. Sized to fit one screen on desktop so a visitor sees the
 * whole offer without scrolling; below `lg` it falls back to normal flow.
 */
export default async function LandingPage() {
  const { t, locale } = await getServerDictionary();

  return (
    <div className="flex min-h-screen flex-col bg-card lg:h-screen lg:overflow-hidden">
      <HeroSection t={t} locale={locale} />

      <div className="border-t border-line">
        <div className="mx-auto grid max-w-7xl gap-3 px-4 py-3 sm:px-6 lg:grid-cols-5">
          <section className="rounded-card border border-line bg-card p-3 lg:col-span-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">
              {t('how.title')}
            </h2>
            <ol className="mt-2.5 grid gap-3 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.titleKey} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-teal-light text-2xs font-bold text-teal-dark">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-navy">{t(s.titleKey)}</span>
                    <span className="mt-0.5 block text-2xs leading-snug text-navy-soft">
                      {t(s.textKey)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="lg:col-span-2">
            <LeaguePathCard t={t} />
          </div>
        </div>
      </div>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-2xs text-navy-muted sm:px-6">
          <span className="font-semibold text-navy-soft">{t('app.name')}</span>
          <span className="hidden sm:inline">{t('app.tagline')}</span>
          <a href="/how-to-play" className="ml-auto rounded hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
            {t('public.howToPlay')}
          </a>
          <a href="/about" className="rounded hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
            {t('public.about')}
          </a>
        </div>
      </footer>
    </div>
  );
}
