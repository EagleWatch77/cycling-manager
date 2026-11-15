import Link from 'next/link';

/**
 * One shared "Zobraziť históriu" switch above the Výkon / Taktika / Technika
 * cards. A plain link to ?history=1 (and back), so the state is in the URL and
 * the cards stay server-rendered; off = the original clean design.
 */
export function HistoryToggle({
  on, href, label, hint,
}: { on: boolean; href: string; label: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {on && hint && <p className="text-xs text-navy-muted">{hint}</p>}
      <Link href={href} scroll={false} aria-pressed={on}
        className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${on ? 'border border-teal bg-teal text-white' : 'border border-line bg-card text-navy-soft hover:bg-teal-rail'}`}>
        {label}
      </Link>
    </div>
  );
}
