import type { ReactNode } from 'react';
import type { T, Locale } from '@/i18n/config';
import { PublicHeader } from './PublicHeader';
import { CyclingHero } from './CyclingHero';
import { AuthForm } from './AuthForm';

/**
 * Split layout shared by register and login: form on the left, photograph on
 * the right. The two are real grid columns rather than an absolutely
 * positioned image, which previously painted over the form and cut it in half.
 *
 * On mobile the form comes first and the photo shrinks to a band below it.
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

      <div className="grid flex-1 lg:grid-cols-[minmax(0,48%)_minmax(0,52%)]">
        <main className="flex items-center px-4 py-10 sm:px-6 lg:px-12">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
            {helper && <p className="mt-1.5 text-sm text-navy-soft">{helper}</p>}

            <div className="mt-6">
              <AuthForm
                notConnectedText={t('auth.notConnected')}
                mismatchText={t('auth.passwordMismatch')}
              >
                {children}
              </AuthForm>
            </div>

            <div className="mt-5 space-y-3 text-sm">{footer}</div>
            <p className="mt-6 rounded-lg border border-line bg-surface px-3 py-2 text-2xs text-navy-muted">
              {t('auth.demoNotice')}
            </p>
          </div>
        </main>

        {/* Form first on mobile; the photo follows as a shorter band. */}
        <div className="h-40 w-full lg:h-auto">
          <CyclingHero className="h-full w-full" priority />
        </div>
      </div>
    </div>
  );
}
