import type { BikeEquipmentId } from '@/lib/bike/equipment';

/** Anchor points (viewBox units) where each component's leader line ends on the drawing. */
export const BIKE_ANCHORS: Record<BikeEquipmentId, { x: number; y: number }> = {
  frame: { x: 359, y: 205 },
  wheels: { x: 625, y: 262 },
  tires: { x: 597, y: 336 },
  brakes: { x: 515, y: 186 },
  drivetrain: { x: 253, y: 278 },
};

export const BIKE_VIEWBOX = { w: 760, h: 400 } as const;

const SPOKES = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8);

function Wheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className="fill-none stroke-navy" strokeWidth={9} />
      <circle cx={cx} cy={cy} r={r - 6} className="fill-none stroke-navy-muted" strokeWidth={3} />
      {SPOKES.map((a, i) => (
        <line key={i} x1={cx + Math.cos(a) * 9} y1={cy + Math.sin(a) * 9} x2={cx + Math.cos(a) * (r - 7)} y2={cy + Math.sin(a) * (r - 7)} className="stroke-navy-muted" strokeWidth={0.9} />
      ))}
      <circle cx={cx} cy={cy} r={7} className="fill-card stroke-navy" strokeWidth={3} />
    </g>
  );
}

/**
 * Technical side-view drawing of a road bike in the game's teal style. Pure SVG
 * (no raster asset). The selected component gets a soft halo; the invisible hit
 * areas call `onSelect` so the drawing itself is clickable.
 */
export function BikeIllustration({
  selected, onSelect, className = '',
}: {
  selected?: BikeEquipmentId;
  onSelect?: (id: BikeEquipmentId) => void;
  className?: string;
}) {
  const halo = 'fill-none stroke-teal opacity-30';
  const hit = (id: BikeEquipmentId) => ({ onClick: () => onSelect?.(id), className: 'cursor-pointer', 'aria-hidden': true as const });
  return (
    <svg viewBox={`0 0 ${BIKE_VIEWBOX.w} ${BIKE_VIEWBOX.h}`} className={className} role="img" aria-hidden="true" focusable="false">
      <g transform="translate(25 0)">
      {/* selection halos */}
      {selected === 'wheels' && <><circle cx={215} cy={270} r={96} className={halo} strokeWidth={16} /><circle cx={510} cy={270} r={96} className={halo} strokeWidth={16} /></>}
      {selected === 'tires' && <><circle cx={215} cy={270} r={104} className={halo} strokeWidth={14} /><circle cx={510} cy={270} r={104} className={halo} strokeWidth={14} /></>}
      {selected === 'frame' && <path d="M355 292 L322 152 L468 148 L482 172 Z M322 158 L215 270 L355 292 M355 292 L482 172" className={halo} strokeWidth={20} strokeLinejoin="round" strokeLinecap="round" />}
      {selected === 'brakes' && <><circle cx={489} cy={190} r={26} className={halo} strokeWidth={10} /><circle cx={246} cy={202} r={22} className={halo} strokeWidth={10} /></>}
      {selected === 'drivetrain' && <><circle cx={355} cy={292} r={52} className={halo} strokeWidth={12} /><circle cx={215} cy={270} r={30} className={halo} strokeWidth={12} /></>}

      {/* wheels and tyres */}
      <Wheel cx={215} cy={270} r={100} />
      <Wheel cx={510} cy={270} r={100} />

      {/* chain + drivetrain */}
      <circle cx={355} cy={292} r={34} className="fill-none stroke-navy-soft" strokeWidth={5} />
      <circle cx={355} cy={292} r={22} className="fill-none stroke-navy-muted" strokeWidth={2} />
      <circle cx={215} cy={270} r={17} className="fill-card stroke-navy-soft" strokeWidth={4} />
      <circle cx={215} cy={270} r={9} className="fill-none stroke-navy-muted" strokeWidth={2} />
      <path d="M355 258 L215 253 M355 326 L215 287" className="stroke-navy-soft" strokeWidth={3} fill="none" />
      <path d="M222 292 l14 20 l-10 8 l-8 -14" className="fill-navy-soft stroke-navy-soft" strokeWidth={2} strokeLinejoin="round" />
      <line x1={355} y1={292} x2={330} y2={346} className="stroke-navy" strokeWidth={9} strokeLinecap="round" />
      <rect x={312} y={344} width={34} height={9} rx={3} className="fill-navy" />

      {/* frame */}
      <g className="stroke-teal-dark" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M322 152 L468 148" strokeWidth={9} />
        <path d="M355 292 L482 172" strokeWidth={13} />
        <path d="M355 292 L322 152" strokeWidth={9} />
        <path d="M322 158 L215 270" strokeWidth={6} />
        <path d="M355 292 L215 270" strokeWidth={6} />
        <path d="M468 140 L484 176" strokeWidth={13} />
        <path d="M483 176 Q 496 224 510 270" strokeWidth={8} />
        <path d="M322 152 L322 132" strokeWidth={6} />
      </g>
      <path d="M392 168 L452 152" className="stroke-teal" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
      {/* bottle */}
      <rect x={394} y={190} width={14} height={34} rx={4} transform="rotate(-38 401 207)" className="fill-teal-light stroke-teal-dark" strokeWidth={2} />

      {/* cockpit + saddle */}
      <path d="M468 138 L500 124" className="stroke-navy" strokeWidth={8} strokeLinecap="round" fill="none" />
      <path d="M498 124 Q 524 116 532 140 Q 536 160 520 166" className="stroke-navy" strokeWidth={7} strokeLinecap="round" fill="none" />
      <path d="M298 128 Q 322 122 352 128 L346 134 Q 322 132 302 136 Z" className="fill-navy stroke-navy" strokeWidth={4} strokeLinejoin="round" />

      {/* brakes */}
      <path d="M481 178 q 14 -2 20 10 q 2 10 -8 14 l-4 -8 q 4 -4 0 -8 z" className="fill-navy-soft stroke-navy" strokeWidth={2} />
      <path d="M236 192 q 14 -2 20 10 q 2 10 -8 14 l-4 -8 q 4 -4 0 -8 z" className="fill-navy-soft stroke-navy" strokeWidth={2} />

      {/* axles */}
      <circle cx={510} cy={270} r={4} className="fill-teal-dark" />
      <circle cx={355} cy={292} r={7} className="fill-teal-dark" />

      {/* clickable regions */}
      <g>
        <circle cx={215} cy={270} r={104} fill="transparent" {...hit('wheels')} />
        <circle cx={510} cy={270} r={104} fill="transparent" {...hit('wheels')} />
        <path d="M355 292 L322 152 L468 148 L482 172 Z" fill="transparent" stroke="transparent" strokeWidth={16} {...hit('frame')} />
        <circle cx={489} cy={190} r={24} fill="transparent" {...hit('brakes')} />
        <circle cx={355} cy={292} r={46} fill="transparent" {...hit('drivetrain')} />
        <circle cx={215} cy={270} r={26} fill="transparent" {...hit('drivetrain')} />
      </g>
      </g>
    </svg>
  );
}
