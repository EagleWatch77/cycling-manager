import type { T } from '@/i18n/config';
import { PrimaryButton } from '../ui/PrimaryButton';
import { CyclingHero } from './CyclingHero';

const SPEC_KEYS = ['spec.seasons', 'spec.browser', 'spec.tactical', 'spec.oneRider', 'spec.noDownload'];

/** Landing hero: copy and calls to action on the left, scene bleeding in from the right. */
export function HeroSection({ t }: { t: T }) {
  return (
    <section className="relative overflow-hidden bg-card">
      <div className="absolute inset-y-0 right-0 hidden w-[58%] lg:block">
        <CyclingHero className="h-full w-full" priority />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 lg:pb-16 lg:pt-20">
        <div className="max-w-xl">
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-teal">{t('hero.eyebrow')}</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-5xl">
            {t('hero.headline')}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-navy-soft">{t('hero.subline')}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <PrimaryButton href="/register">{t('hero.ctaPrimary')}</PrimaryButton>
            <PrimaryButton href="/login" variant="secondary">{t('public.login')}</PrimaryButton>
          </div>
        </div>

        <div className="mt-10 h-44 w-full lg:hidden">
          <CyclingHero className="h-full w-full rounded-card" />
        </div>

        <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 lg:mt-14">
          {SPEC_KEYS.map((key) => (
            <li key={key} className="flex items-center gap-1.5 text-xs font-medium text-navy-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
