import type { T, Locale } from '@/i18n/config';
import { PrimaryButton } from '../ui/PrimaryButton';
import { CyclingHero } from './CyclingHero';
import { LanguageSelector } from './LanguageSelector';
import { Logo } from './Logo';

const SPEC_KEYS = ['spec.seasons', 'spec.browser', 'spec.tactical', 'spec.oneRider', 'spec.noDownload'];

/**
 * Landing hero. No separate top bar: the wordmark sits above the headline and
 * the language switcher floats over the photograph.
 */
export function HeroSection({ t, locale }: { t: T; locale: Locale }) {
  return (
    <section className="relative flex-1 overflow-hidden bg-card">
      <div className="absolute inset-y-0 right-0 hidden w-[58%] lg:block">
        <CyclingHero className="h-full w-full" priority />
      </div>

      <div className="absolute right-4 top-4 z-10 sm:right-6">
        <LanguageSelector locale={locale} label={t('lang.label')} />
      </div>

      <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-center px-4 py-8 sm:px-6 lg:py-6">
        <div className="max-w-xl">
          <Logo className="h-auto w-48 sm:w-60 lg:w-64" width={256} priority />
          <h1 className="mt-5 text-3xl font-bold leading-[1.08] tracking-tight text-navy sm:text-4xl lg:text-[2.75rem]">
            {t('hero.headline')}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-navy-soft lg:text-base">
            {t('hero.subline')}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <PrimaryButton href="/register">{t('hero.ctaPrimary')}</PrimaryButton>
            <PrimaryButton href="/login" variant="secondary">{t('public.login')}</PrimaryButton>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-1.5">
            {SPEC_KEYS.map((key) => (
              <li key={key} className="flex items-center gap-1.5 text-2xs font-medium text-navy-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 h-40 w-full lg:hidden">
          <CyclingHero className="h-full w-full rounded-card" />
        </div>
      </div>
    </section>
  );
}
