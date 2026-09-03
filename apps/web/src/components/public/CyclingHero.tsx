import Image from 'next/image';

/**
 * Hero photograph for the public pages.
 *
 * The white fade on the left is baked into the asset, so whatever sits over it
 * must be on a white background — see the `bg-card` on the hero sections. The
 * source is a 2.2 MB PNG re-encoded to WebP (199 kB); Next/Image narrows it
 * further per viewport.
 */
export function CyclingHero({
  className = '', priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden bg-card ${className}`}>
      <Image
        src="/hero-climb.webp"
        alt=""
        aria-hidden="true"
        fill
        priority={priority}
        sizes="(max-width: 1024px) 100vw, 60vw"
        className="object-cover object-right"
      />
    </div>
  );
}
