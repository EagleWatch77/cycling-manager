import { getServerDictionary } from '@/i18n/server';
import { LOCALES, LOCALE_NAMES } from '@/i18n/config';
import { AuthCard } from '@/components/public/AuthCard';
import { AuthField } from '@/components/public/AuthField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

/**
 * Registration. No rider attributes, country, team or league are chosen here —
 * those belong to onboarding after the account exists.
 *
 * The form does not submit anywhere yet: there is no backend in this milestone.
 */
export default async function RegisterPage() {
  const { t, locale } = await getServerDictionary();

  return (
    <AuthCard
      t={t}
      locale={locale}
      title={t('auth.registerTitle')}
      helper={t('auth.registerHelper')}
      footer={
        <p className="text-navy-soft">
          {t('auth.haveAccount')}{' '}
          <a href="/login" className="font-semibold text-teal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
            {t('public.login')}
          </a>
        </p>
      }
    >
      <AuthField id="email" label={t('auth.email')} type="email" autoComplete="email" placeholder="jan@example.com" />
      <AuthField id="displayName" label={t('auth.displayName')} hint={t('auth.optional')} required={false} autoComplete="nickname" />
      <AuthField id="password" label={t('auth.password')} type="password" autoComplete="new-password" />
      <AuthField id="confirmPassword" label={t('auth.confirmPassword')} type="password" autoComplete="new-password" />

      <AuthField id="language" label={t('auth.language')}>
        <select
          id="language"
          name="language"
          defaultValue={locale}
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-navy focus-visible:border-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
          ))}
        </select>
      </AuthField>

      <label htmlFor="terms" className="flex items-start gap-2 text-xs leading-snug text-navy-soft">
        <input
          id="terms"
          name="terms"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        />
        {t('auth.terms')}
      </label>

      <PrimaryButton type="submit" full>{t('auth.registerCta')}</PrimaryButton>
    </AuthCard>
  );
}
