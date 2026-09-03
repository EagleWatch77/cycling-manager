import type { T } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import { Logo } from './Logo';
import { LanguageSelector } from './LanguageSelector';

/** Top bar for every public page. Collapses to logo + language + log in on mobile. */
export function PublicHeader({ t, locale }: { t: T; locale: Locale }) {
  return (
    <header className="relative z-20 border-b border-line/70 bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <a href="/" aria-label={t('app.name')} className="flex items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
          <Logo className="h-auto w-36" width={144} />
        </a>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          <HeaderLink href="/how-to-play">{t('public.howToPlay')}</HeaderLink>
          <HeaderLink href="/about">{t('public.about')}</HeaderLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSelector locale={locale} label={t('lang.label')} />
          <a
            href="/login"
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            {t('public.login')}
          </a>
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-navy-soft transition-colors hover:bg-teal-rail hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
    >
      {children}
    </a>
  );
}
