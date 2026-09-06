import { resolveAvatarSrc } from '@/lib/rider/avatarPool';
import { Icon } from '@/components/ui/Icon';

/**
 * Rider Avatar V1 — renders a deterministic complete portrait for a given
 * rider seed (same seed always resolves to the same portrait; see
 * lib/rider/avatarPool.ts). Falls back to the generic rider icon when no
 * portraits exist yet in public/avatars/male-complete/.
 */

const SIZE_PX: Record<'sm' | 'md' | 'lg' | 'xl', number> = {
  sm: 32,  // rider lists / results rows
  md: 56,  // dashboard summary card
  lg: 80,  // rider profile header
  xl: 128, // future large profile use
};

interface RiderAvatarProps {
  /** Stable per-rider identity used to pick a portrait deterministically (e.g. rider.id). */
  seed: string;
  size?: keyof typeof SIZE_PX;
  className?: string;
}

export function RiderAvatar({ seed, size = 'md', className = '' }: RiderAvatarProps) {
  const px = SIZE_PX[size];
  const src = resolveAvatarSrc(seed);

  if (!src) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-xl bg-navy text-teal ${className}`}
        style={{ width: px, height: px }}
      >
        <Icon name="rider" className="h-1/2 w-1/2" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={px}
      height={px}
      className={`shrink-0 rounded-xl object-cover ${className}`}
      style={{ width: px, height: px }}
    />
  );
}
