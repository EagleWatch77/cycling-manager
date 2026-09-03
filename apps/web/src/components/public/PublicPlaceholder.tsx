import { getServerDictionary } from '@/i18n/server';
import { PublicHeader } from './PublicHeader';
import { PrimaryButton } from '../ui/PrimaryButton';

/** Public route that exists but has no content yet. */
export async function PublicPlaceholder({ titleKey, textKey }: { titleKey: string; textKey: string }) {
  const { t, locale } = await getServerDictionary();
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <PublicHeader t={t} locale={locale} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold text-navy">{t(titleKey)}</h1>
        <p className="mt-2 text-sm text-navy-soft">{t(textKey)}</p>
        <PrimaryButton href="/" variant="secondary" className="mt-6">{t('auth.backHome')}</PrimaryButton>
      </main>
    </div>
  );
}
