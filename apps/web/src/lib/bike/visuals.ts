import type { BikeEquipmentId } from './equipment';

/**
 * Main bike picture by the OWNED FRAME level — never by league and never by the
 * level currently selected in the upgrade panel (C-060). Only the frame level
 * decides the picture; the other four components keep their own levels.
 *
 * Anchors are fractions (0-1) of the picture, so leader lines follow the picture
 * at any size. Files live in public/images/bikes (transparent WebP).
 */
export type BikeVisualKey = 'steel' | 'rookie' | 'amateur' | 'continental' | 'pro' | 'elite';

export interface BikeVisual {
  key: BikeVisualKey;
  /** Frame levels that use this picture. */
  levels: readonly number[];
  /** Existing file under public/. */
  file: string;
  /** True when the picture is borrowed from a lower variant until its own one exists (none at the moment). */
  temporary: boolean;
  anchors: Record<BikeEquipmentId, { x: number; y: number }>;
  /** Top of the saddle (picture fractions): where the small level badge of the Home window sits. */
  saddle: { x: number; y: number };
}

const fr = (px: number, py: number) => ({ x: +(px / 1536).toFixed(4), y: +(py / 1024).toFixed(4) });

export const BIKE_VISUALS: readonly BikeVisual[] = [
  { key: 'steel', levels: [1], file: '/images/bikes/steel-lvl1.webp', temporary: false,
    saddle: fr(470, 85),
    anchors: { frame: fr(780, 275), wheels: fr(1440, 640), tires: fr(1427, 877), brakes: fr(1120, 395), drivetrain: fr(320, 650) } },
  { key: 'rookie', levels: [2], file: '/images/bikes/rookie-lvl2.webp', temporary: false,
    saddle: fr(475, 80),
    anchors: { frame: fr(790, 300), wheels: fr(1440, 640), tires: fr(1430, 880), brakes: fr(1140, 390), drivetrain: fr(315, 650) } },
  { key: 'amateur', levels: [3, 4], file: '/images/bikes/amateur-lvl4.webp', temporary: false,
    saddle: fr(455, 70),
    anchors: { frame: fr(800, 270), wheels: fr(1440, 640), tires: fr(1430, 880), brakes: fr(1145, 385), drivetrain: fr(315, 655) } },
  { key: 'continental', levels: [5, 6], file: '/images/bikes/continental-lvl6.webp', temporary: false,
    saddle: fr(455, 85),
    anchors: { frame: fr(800, 300), wheels: fr(1440, 650), tires: fr(1430, 890), brakes: fr(1145, 395), drivetrain: fr(310, 665) } },
  { key: 'pro', levels: [7, 8], file: '/images/bikes/pro-lvl8.webp', temporary: false,
    saddle: fr(465, 60),
    anchors: { frame: fr(800, 290), wheels: fr(1440, 690), tires: fr(1445, 890), brakes: fr(1150, 630), drivetrain: fr(290, 665) } },
  { key: 'elite', levels: [9, 10], file: '/images/bikes/elite-lvl10.webp', temporary: false,
    saddle: fr(456, 78),
    anchors: { frame: fr(780, 270), wheels: fr(1450, 640), tires: fr(1420, 880), brakes: fr(1150, 630), drivetrain: fr(290, 660) } },
];

/** The picture for an owned frame level; unknown levels fall back to the basic steel bike. */
export function bikeVisualForFrameLevel(level: number): BikeVisual {
  return BIKE_VISUALS.find((v) => v.levels.includes(level)) ?? BIKE_VISUALS[0];
}

/** Picture proportions (all pictures share them): 1536 x 1024. */
export const BIKE_PICTURE_RATIO = { w: 3, h: 2 } as const;
