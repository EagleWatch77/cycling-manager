/**
 * Per-asset alignment offsets for compositing avatar overlay layers (hair, beard)
 * on top of a base face. All source canvases are 1254x1254, but the artwork
 * within each canvas is not pre-registered to the same anchor points, so each
 * overlay file needs its own calibrated offset.
 *
 * x/y are percentages of the container size (so they scale with AVATAR_SIZE).
 * scale is a multiplier applied on top of the base 100% container fit.
 */

export interface AvatarLayerAlignment {
  x: number;
  y: number;
  scale: number;
}

const DEFAULT_ALIGNMENT: AvatarLayerAlignment = { x: 0, y: 0, scale: 1 };

export const HAIR_ALIGNMENT: Record<string, AvatarLayerAlignment> = {
  '1a.png': { x: 0, y: -13, scale: 1.06 },
};

export const BEARD_ALIGNMENT: Record<string, AvatarLayerAlignment> = {
  '1b.png': { x: 0, y: 15, scale: 1.0 },
};

function fileNameFromPath(path: string): string {
  return path.split('/').pop() ?? path;
}

export function getHairAlignment(path: string): AvatarLayerAlignment {
  return HAIR_ALIGNMENT[fileNameFromPath(path)] ?? DEFAULT_ALIGNMENT;
}

export function getBeardAlignment(path: string): AvatarLayerAlignment {
  return BEARD_ALIGNMENT[fileNameFromPath(path)] ?? DEFAULT_ALIGNMENT;
}
