import type { T } from '@/i18n/config';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CatalogEntry } from '@/lib/sponsors/catalog';

/**
 * Catalogue of the approved main sponsors. NOT the player's offers: it only lists which fictional companies exist in the game,
 * so the names can be checked. Clearly separated from the personal market above it.
 */
export function SponsorCatalog({ entries, loaded, t }: { entries: CatalogEntry[]; loaded: boolean; t: T }) {
  return (
    <SectionCard icon="building" title={t('sp.catalog.title')}
      action={loaded ? <span className="text-2xs font-semibold text-navy-muted">{t('sp.catalog.count', { n: entries.length })}</span> : undefined}>
      <div className="space-y-3 p-3.5">
        <p className="rounded-lg bg-teal-rail px-3 py-2 text-xs text-navy-soft">{t('sp.catalog.note')}</p>
        {!loaded || entries.length === 0 ? (
          <EmptyState icon="building" text={t('sp.catalog.empty')} compact />
        ) : (
          <ol className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5" data-testid="sponsor-catalog">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-rail text-2xs font-bold tabular-nums text-teal-dark">{e.no}</span>
                <span className="min-w-0 truncate text-sm font-semibold text-navy" title={e.name}>{e.name}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </SectionCard>
  );
}
