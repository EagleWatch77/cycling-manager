import { FLAG_SVG } from '@/lib/flagSvg';

/**
 * Small country flag from the ISO-2 code (inline SVG, see lib/flagSvg.ts). Fixed 3:2 frame so every flag has the same size and
 * lines up in tables; `title` (the country name) is the tooltip and the accessible name. Unknown/missing code => a neutral grey
 * frame with a dash, never a guessed flag. Server-component safe (no client JS).
 */
export function CountryFlag({ iso2, name, className = '' }: { iso2: string | null | undefined; name?: string; className?: string }) {
  const key = (iso2 ?? '').toUpperCase();
  const art = /^[A-Z]{2}$/.test(key) ? FLAG_SVG[key] : undefined;
  const label = name || (art ? key : '');
  const frame = `inline-block h-[15px] w-[22px] shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10 align-middle ${className}`;
  if (!art) {
    return (
      <span className={`${frame} bg-surface text-center text-2xs leading-[15px] text-navy-muted`} title={label || undefined}
        role="img" aria-label={label || 'neznáma krajina'}>–</span>
    );
  }
  return (
    <span className={frame} title={label} role="img" aria-label={label}>
      <svg viewBox={art.viewBox} preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: art.inner }} />
    </span>
  );
}
