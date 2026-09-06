/**
 * Classification jersey, shown as the real jersey artwork rather than a shape.
 * Images live under /public/jerseys and are ~10 KB WebP each.
 *
 * `team` is included but only rendered where a team context exists (not in the
 * Rookie league, which has no teams yet).
 */
export type JerseyKind = 'gc' | 'points' | 'mountain' | 'youth' | 'team';

export function JerseyIcon({
  kind, className = 'h-10 w-10',
}: {
  kind: JerseyKind;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/jerseys/${kind}.webp`} alt="" aria-hidden="true"
      className={`object-contain ${className}`} />
  );
}
