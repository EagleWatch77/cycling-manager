'use client';

import { useEffect, useState } from 'react';

/**
 * Reusable rider portrait: head-and-shoulders, 3:4, neutral background.
 * Shows `src` when given and loadable; otherwise (no src, or the image
 * fails to load) a neutral silhouette placeholder. It only DISPLAYS an
 * image — it does not generate, assign or store portraits.
 *
 * Size comes from `className` width (e.g. "w-16"); height follows 3:4.
 */
export function RiderPortrait({
  src, alt = '', className = 'w-16',
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={`relative aspect-[3/4] shrink-0 overflow-hidden rounded-lg border border-line bg-surface ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src as string} alt={alt} onError={() => setFailed(true)}
          className="h-full w-full object-cover object-top" />
      ) : (
        <svg viewBox="0 0 90 120" role="img" aria-label={alt || undefined} aria-hidden={alt ? undefined : true}
          className="h-full w-full text-navy-muted/30">
          <circle cx="45" cy="44" r="19" fill="currentColor" />
          <path d="M8 120c0-26 16-40 37-40s37 14 37 40z" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}
