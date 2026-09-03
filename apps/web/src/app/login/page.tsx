import { getServerDictionary } from '@/i18n/server';
import { AuthCard } from '@/components/public/AuthCard';
import { AuthField } from '@/components/public/AuthField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

/** Login. The form does not authenticate anything yet. */
export default async function LoginPage() {
  const { t, locale } = await getServerDictionary();

  return (
    <AuthCard
      t={t}
      locale={locale}
      title={t('auth.loginTitle')}
      footer={
        <>
          <a href="/forgot-password" className="block font-medium text-teal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
            {t('auth.forgot')}
          </a>
          <p className="text-navy-soft">
            {t('auth.noAccount')}{' '}
            <a href="/register" className="font-semibold text-teal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
              {t('public.register')}
            </a>
          </p>
        </>
      }
    >
      <AuthField id="email" label={t('auth.email')} type="email" autoComplete="email" placeholder="jan@example.com" />
      <AuthField id="password" label={t('auth.password')} type="password" autoComplete="current-password" />
      <PrimaryButton type="submit" full>{t('auth.loginCta')}</PrimaryButton>
    </AuthCard>
  );
}
