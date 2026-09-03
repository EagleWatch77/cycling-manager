import { getDictionary, DEFAULT_LOCALE } from '@/i18n/config';
import { AppShell } from './AppShell';
import { Card } from './ui/Card';

/**
 * Route that exists but has no screen yet. It states what will appear here
 * rather than apologising or showing an empty box.
 */
export function PlaceholderPage({ navId, titleKey }: { navId: string; titleKey: string }) {
  const t = getDictionary(DEFAULT_LOCALE);
  return (
    <AppShell activeId={navId}>
      <Card className="col-span-12">
        <h1 className="text-lg font-bold text-navy">{t(titleKey)}</h1>
        <p className="mt-1 text-sm text-navy-soft">{t('page.placeholder')}</p>
      </Card>
    </AppShell>
  );
}
