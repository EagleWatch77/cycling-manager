import type { BikeEquipmentId } from '@/lib/bike/equipment';

/** Small illustration of one component (frame tube, wheel, tyre, brake, drivetrain), drawn in the game's teal style. */
export function BikeGlyph({ id, className = 'h-10 w-10' }: { id: BikeEquipmentId; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      {id === 'frame' && (
        <g className="stroke-teal-dark" strokeWidth={4}>
          <path d="M10 36 L18 14 H34 L10 36 M18 14 L26 36 H10 M34 14 L26 36" />
          <circle cx={10} cy={36} r={2} className="fill-teal-dark" />
        </g>
      )}
      {id === 'wheels' && (
        <g>
          <circle cx={24} cy={24} r={17} className="stroke-navy" strokeWidth={3} />
          {Array.from({ length: 8 }, (_, i) => <line key={i} x1={24} y1={24} x2={24 + Math.cos((i * Math.PI) / 4) * 16} y2={24 + Math.sin((i * Math.PI) / 4) * 16} className="stroke-navy-muted" strokeWidth={1} />)}
          <circle cx={24} cy={24} r={3} className="fill-card stroke-navy" strokeWidth={1.5} />
        </g>
      )}
      {id === 'tires' && (
        <g>
          <path d="M8 36 A 18 18 0 0 1 40 36" className="stroke-navy" strokeWidth={8} />
          <path d="M12 36 A 14 14 0 0 1 36 36" className="stroke-teal" strokeWidth={2} strokeDasharray="3 3" />
        </g>
      )}
      {id === 'brakes' && (
        <g className="stroke-navy" strokeWidth={3}>
          <path d="M14 38 V20 Q14 10 24 10 Q34 10 34 20 V38" />
          <path d="M14 30 H20 M34 30 H28" className="stroke-teal-dark" />
          <rect x={20} y={14} width={8} height={10} rx={2} className="fill-teal-light stroke-teal-dark" strokeWidth={2} />
        </g>
      )}
      {id === 'drivetrain' && (
        <g>
          <circle cx={19} cy={28} r={11} className="stroke-navy-soft" strokeWidth={4} />
          <circle cx={19} cy={28} r={4} className="fill-card stroke-navy" strokeWidth={2} />
          <circle cx={37} cy={17} r={6} className="stroke-teal-dark" strokeWidth={3} />
          <path d="M19 17 L37 11 M19 39 L37 23" className="stroke-navy-muted" strokeWidth={2} />
        </g>
      )}
    </svg>
  );
}
