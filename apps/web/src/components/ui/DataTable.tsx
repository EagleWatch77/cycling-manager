import Link from 'next/link';
import type { ReactNode } from 'react';

export interface DataTableColumn<T> {
  header: ReactNode;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

/**
 * Generic compact data table — a real <table>, not a div/CSS "display:table"
 * trick (MarketTable and RankingsTable both learned that lesson the hard
 * way: an earlier Link-as-table-row version broke row-height calculation
 * badly). One <Link> per cell keeps "whole row clickable" working via
 * `:hover` on the <tr>, without client JS, whenever `rowHref` is given.
 */
export function DataTable<T>({
  columns, rows, rowKey, rowHref, emptyText,
}: {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-card border border-line bg-card p-6 text-center text-sm text-navy-soft shadow-card">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs font-semibold uppercase tracking-wide text-navy-muted">
            {columns.map((col, i) => (
              <th key={i} className={`px-3.5 py-2.5 font-semibold ${col.align === 'right' ? 'text-right' : ''}`}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr key={rowKey(row)} className="border-b border-line text-navy transition-colors last:border-0 hover:bg-surface">
                {columns.map((col, i) => (
                  <td key={i} className={`p-0 ${col.align === 'right' ? 'text-right' : ''}`}>
                    {href ? (
                      <Link href={href} className="block px-3.5 py-2">{col.render(row)}</Link>
                    ) : (
                      <div className="px-3.5 py-2">{col.render(row)}</div>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
