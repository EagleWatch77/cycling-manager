import type { SegmentLevel } from '@/lib/rider/development';
import { RiderStatIcon } from './RiderStatIcon';

/**
 * One row in the Rozvoj (Development) card: icon + label + a purely visual
 * 1-5 read-out — never the underlying exact score (1-200 in the data
 * model). `variant: 'stars'` is used only for Potenciál (an intentionally
 * imprecise, scouting-style estimate — no category label next to it, per
 * the "never even a fraction for Potential" rule). `variant: 'segments'`
 * is used for the rest: short rounded dashes colored per attribute via
 * `accentClass` (a Tailwind bg-* class matching that row's icon), plus a
 * "N/5" category label — this is the bucket a scoreToLevel() call landed
 * in, not the real number, so a player only ever sees it move when the
 * category itself changes (e.g. 3/5 -> 4/5).
 */
export function DevAttributeRow({
  icon, label, level, variant, accentClass = 'bg-teal',
}: {
  icon: string | null;
  label: string;
  level: SegmentLevel;
  variant: 'stars' | 'segments';
  accentClass?: string;
}) {
  return (
    <li className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
      <RiderStatIcon src={icon} alt={label} size={24} />
      <span className="min-w-0 flex-1 truncate text-[15px] text-navy">{label}</span>
      {variant === 'stars' ? (
        <span className="shrink-0 text-base leading-none tracking-[1px]" aria-label={`${level}/5`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={i < level ? 'text-teal' : 'text-line'}>★</span>
          ))}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`h-1.5 w-3 rounded-full ${i < level ? accentClass : 'bg-line'}`} />
            ))}
          </span>
          <span className="text-xs font-semibold tabular-nums text-navy-muted">{level}/5</span>
        </span>
      )}
    </li>
  );
}
