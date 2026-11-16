import type { BikeEquipmentId } from '@/lib/bike/equipment';
import type { BikeVisual } from '@/lib/bike/visuals';

/** Drawing area (SVG units). The picture sits in the middle, the callout cards use the side margins. */
export const BIKE_VIEWBOX = { w: 760, h: 400 } as const;
export const BIKE_IMAGE_BOX = { x: 137, y: 38, w: 486, h: 324 } as const;

/** Anchor of a component in drawing units — derived from the picture-relative fractions, so it follows the picture at any size. */
export function anchorPoint(visual: BikeVisual, id: BikeEquipmentId): { x: number; y: number } {
  const a = visual.anchors[id];
  return { x: BIKE_IMAGE_BOX.x + a.x * BIKE_IMAGE_BOX.w, y: BIKE_IMAGE_BOX.y + a.y * BIKE_IMAGE_BOX.h };
}

const IDS: readonly BikeEquipmentId[] = ['frame', 'wheels', 'tires', 'brakes', 'drivetrain'];

/**
 * The bike picture (a separate transparent WebP asset, chosen by the owned
 * frame level) with a soft ring on the selected component and clickable
 * regions at the component anchors. Labels, lines and cards stay HTML/SVG
 * elements outside the picture. Two SVGs share the same coordinates: the
 * wide one for desktop (with room for callouts) and a tight one for mobile.
 */
export function BikeIllustration({
  visual, selected, onSelect, className = '',
}: {
  visual: BikeVisual;
  selected?: BikeEquipmentId;
  onSelect?: (id: BikeEquipmentId) => void;
  className?: string;
}) {
  const b = BIKE_IMAGE_BOX;
  const body = (
    <>
      <image href={visual.file} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="xMidYMid meet" data-bike-image={visual.key} />
      {IDS.map((id) => {
        const p = anchorPoint(visual, id);
        const on = id === selected;
        const r = id === 'wheels' ? 40 : id === 'frame' ? 30 : 24;
        return (
          <g key={id}>
            {on && <circle cx={p.x} cy={p.y} r={r * 0.62} className="fill-teal/20 stroke-teal" strokeWidth={2.5} />}
            <circle cx={p.x} cy={p.y} r={r} fill="transparent" className="cursor-pointer" aria-hidden="true" onClick={() => onSelect?.(id)} />
          </g>
        );
      })}
    </>
  );
  return (
    <>
      <svg viewBox={`0 0 ${BIKE_VIEWBOX.w} ${BIKE_VIEWBOX.h}`} className={`hidden md:block ${className}`} role="img" aria-hidden="true" focusable="false">{body}</svg>
      <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} className={`md:hidden ${className}`} role="img" aria-hidden="true" focusable="false">{body}</svg>
    </>
  );
}
