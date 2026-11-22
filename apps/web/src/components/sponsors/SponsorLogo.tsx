import { sponsorLogoUrl, sponsorMarkUrl } from '@/lib/sponsors/logos';
import type { SponsorKind } from '@/lib/sponsors/rules';

/**
 * Company name shown as its approved logo (looked up by kind + exact name). Without a logo the plain text name is shown, as before.
 * `variant="logo"` = horizontal logo (800x200) for cards, `"mark"` = compact symbol (190x200) for Detail panels. Transparent SVG, aspect ratio
 * kept (h-* + w-auto), never wider than its box, so it fits narrow phones. The image carries the name as alt text.
 */
export function SponsorName({ name, kind, variant = 'logo', className = '' }: { name: string; kind: SponsorKind; variant?: 'logo' | 'mark'; className?: string }) {
  const url = variant === 'logo' ? sponsorLogoUrl(kind, name) : sponsorMarkUrl(kind, name);
  if (!url) return <span className="min-w-0 break-words">{name}</span>;
  const [w, h] = variant === 'logo' ? [800, 200] : [190, 200];
  // plain <img>: static transparent SVG files from /public, nothing for the image optimiser to do
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} width={w} height={h} loading="lazy" decoding="async"
    className={`block w-auto max-w-full object-contain object-left ${variant === 'logo' ? 'h-12 sm:h-14' : 'h-9'} ${className}`} />;
}
