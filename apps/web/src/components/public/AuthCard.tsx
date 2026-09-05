import type { ReactNode } from 'react';
import type { T, Locale } from '@/i18n/config';
import { CyclingHero } from './CyclingHero';
import { LanguageSelector } from './LanguageSelector';
import { Logo } from './Logo';
import { AuthForm } from './AuthForm';

const MESSAGE_KEYS = [
  'auth.errorGeneric',
  'auth.invalidCredentials',
  'auth.emailInUse',
  'auth.weakPassword',
  'auth.passwordMismatch',
  'auth.emailNotConfirmed',
  'auth.checkEmail',
] as const;

/** Resolve the error strings on the server so the client gets plain text. */
function authMessages(t: T): Record<string, string> {
  return Object.fromEntries(MESSAGE_KEYS.map((k) => [k, t(k)]));
}

/**
 * Split layout shared by register and login, mirroring the landing page: no
 * separate top bar, the wordmark sits above the heading in the same column as
 * the form, and the language switcher floats top right over the photograph.
 *
 * The two halves are real grid columns rather than an absolutely positioned
 * image, which previously painted over the form and cut it in half.
 *
 * The page itself does not scroll on desktop; if a viewport is too short for
 * the form, only the form column scrolls.
 */
import type { AuthResult } from '@/app/auth/actions';

export function AuthCard({
  t, locale, title, helper, action, children, footer,
}: {
  t: T;
  locale: Locale;
  title: string;
  helper?: string;
  action: (formData: FormData) => Promise<AuthResult>;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-card lg:h-screen lg:overflow-hidden">
      {/* Over the photo on desktop, over white at the top on mobile. */}
      <div className="absolute right-4 top-4 z-10 sm:right-6">
        <LanguageSelector locale={locale} label={t('lang.label')} />
      </div>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,46%)_minmax(0,54%)]">
        <main className="flex items-center px-4 py-8 sm:px-6 lg:overflow-y-auto lg:px-10">
          <div className="mx-auto w-full max-w-sm">
            <a href="/" aria-label={t('app.name')} className="inline-block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
              <Logo className="h-auto w-44" width={176} />
            </a>

            <h1 className="mt-6 text-2xl font-bold tracking-tight text-navy">{title}</h1>
            {helper && <p className="mt-1 text-sm text-navy-soft">{helper}</p>}

            <div className="mt-5">
              <AuthForm action={action} messages={authMessages(t)}>
                {children}
              </AuthForm>
            </div>

            <div className="mt-4 space-y-2 text-sm">{footer}</div>

            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-2xs text-navy-muted">
              <a href="/how-to-play" className="rounded hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                {t('public.howToPlay')}
              </a>
              <a href="/about" className="rounded hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                {t('public.about')}
              </a>
            </div>
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
