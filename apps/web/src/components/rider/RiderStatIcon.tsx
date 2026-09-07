/**
 * Fixed-size box for a glossy /ride-icon PNG, shared by the Rider and
 * Training pages so every attribute/condition row renders its icon the same
 * way everywhere. `object-fit: contain` keeps source PNGs of differing size
 * and internal padding from ever changing row height/alignment. Never
 * CSS-recolored and never wrapped in a colored circle — the artwork already
 * carries its own color.
 *
 * When `src` is null (no dedicated asset for that attribute yet), renders a
 * small neutral placeholder dot in the same box instead of an icon, so rows
 * with and without a glossy icon still line up — and so a missing asset is
 * never silently filled in with an unrelated icon.
 */
export function RiderStatIcon({
  src, alt = '', size = 28, className = '',
}: {
  src: string | null;
  alt?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-contain" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-line" aria-hidden="true" />
      )}
    </span>
  );
}
