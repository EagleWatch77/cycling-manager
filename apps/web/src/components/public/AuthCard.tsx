import type { ReactNode } from 'react';
import type { T, Locale } from '@/i18n/config';
import { PublicHeader } from './PublicHeader';
import { CyclingHero } from './CyclingHero';

/**
 * Split layout shared by register and login: form on the left, hero on the
 * right. On mobile the form comes first and the hero shrinks to a band.
 */
export function AuthCard({
  t, locale, title, helper, children, footer,
}: {
  t: T;
  locale: Locale;
  title: string;
  helper?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-card">
      <PublicHeader t={t} locale={locale} />
      <div className="relative flex flex-1 flex-col lg:flex-row">
        <div className="order-2 h-40 w-full lg:absolute lg:inset-y-0 lg:right-0 lg:order-none lg:h-auto lg:w-[52%]">
          <CyclingHero className="h-full w-full" priority />
        </div>

        <main className="order-1 flex flex-1 items-center px-4 py-10 sm:px-6 lg:order-none lg:w-[48%] lg:px-12">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
            {helper && <p className="mt-1.5 text-sm text-navy-soft">{helper}</p>}
            <div className="mt-6 space-y-4">{children}</div>
            <div className="mt-5 space-y-3 text-sm">{footer}</div>
            <p className="mt-6 rounded-lg border border-line bg-card px-3 py-2 text-2xs text-navy-muted">
              {t('auth.demoNotice')}
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
