import Link from 'next/link';
import type { T } from '@/i18n/config';

/**
 * Pure Link-based pagination — changing pages is a normal navigation (new
 * URL, new server-side query via getMarketPage), never a client-side slice
 * of an already-fetched array. `buildHref` lets the caller keep whatever
 * filter query params are active while only changing `page`.
 */
export function MarketPagination({
  t, page, pageSize, total, buildHref,
}: {
  t: T;
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, page + 2);
  const pages = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);

  function PageLink({ target, label, disabled }: { target: number; label: string; disabled?: boolean }) {
    if (disabled) {
      return <span className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-navy-muted/50">{label}</span>;
    }
    return (
      <Link href={buildHref(target)}
        className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-navy-soft transition-colors hover:bg-teal-rail hover:text-teal-dark">
        {label}
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-navy-muted">
        {t('market.showingRange', { from, to, total })}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <PageLink target={1} label="«" disabled={page <= 1} />
        <PageLink target={page - 1} label="‹" disabled={page <= 1} />
        {windowStart > 1 && <span className="px-1 text-xs text-navy-muted">…</span>}
        {pages.map((p) => (
          p === page ? (
            <span key={p} className="rounded-lg bg-teal px-2.5 py-1.5 text-xs font-bold text-white">{p}</span>
          ) : (
            <Link key={p} href={buildHref(p)}
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-navy-soft transition-colors hover:bg-teal-rail hover:text-teal-dark">
              {p}
            </Link>
          )
        ))}
        {windowEnd < totalPages && <span className="px-1 text-xs text-navy-muted">…</span>}
        <PageLink target={page + 1} label="›" disabled={page >= totalPages} />
        <PageLink target={totalPages} label="»" disabled={page >= totalPages} />
      </div>
    </div>
  );
}
