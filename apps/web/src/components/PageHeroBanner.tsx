import Image from 'next/image';

/**
 * Shared atmospheric banner for every authenticated game page except Home
 * (see AppShell.tsx — hidden when `activeId === 'home'`, so no per-page
 * wiring is needed anywhere else). Purely decorative: no title, no CTA, no
 * overlay content — each page's own title/subtitle still renders below it
 * exactly as before this change.
 *
 * `/public/topbar.png` is a wide (2172x724, ~3:1) transparent-PNG scene —
 * mountains/forest across the full width with a road cyclist positioned
 * toward the right, and a teal graphic accent along the bottom. The actual
 * painted content sits in a horizontal band roughly centered vertically
 * (~28%-64% of the image height); at every realistic banner height (item 5
 * of the request: ~100-140px desktop, shorter on mobile) the rendered
 * container is always far wider than the image's own 3:1 ratio, so
 * `object-cover` fills the full width with no horizontal cropping (the
 * cyclist's relative x-position is preserved) and only crops vertically —
 * `objectPosition` is tuned to that band's real center (not a bare 50%) so
 * the crop keeps the mountains and the cyclist in frame rather than an
 * arbitrary vertical slice. `bg-surface` shows through only if a sliver of
 * the PNG's transparent margin were ever visible, keeping it inside the
 * app's own light palette rather than flashing white/transparent.
 */
export function PageHeroBanner() {
  return (
    <div className="relative mb-3 h-16 w-full shrink-0 overflow-hidden rounded-card bg-surface sm:h-24 lg:h-32">
      <Image
        src="/topbar.png"
        alt=""
        fill
        sizes="100vw"
        className="object-cover"
        style={{ objectPosition: 'center 46%' }}
      />
    </div>
  );
}
