import { RiderStatIcon } from './RiderStatIcon';

export type Trend = 'up' | 'down' | 'flat';

const ARROW: Record<Trend, string> = { up: '↑', down: '↓', flat: '—' };

/**
 * One Stav jazdca (condition) row: icon + label, value, and a trend arrow —
 * never a numeric +/- delta (condition has no persisted "gain" concept the
 * way a trained attribute does). `goodDirection` says which arrow direction
 * counts as an improvement for THIS field: 'up' for Energia/Forma/Kondícia/
 * Morálka, 'down' for Únava, where rising fatigue is always bad regardless
 * of direction elsewhere. Fixed-width value/trend columns keep every row's
 * arrow aligned regardless of label length.
 */
export function ConditionRow({
  icon, label, value, trend, goodDirection,
}: {
  icon: string;
  label: string;
  value: number;
  trend: Trend;
  goodDirection: 'up' | 'down';
}) {
  const colorClass = trend === 'flat' ? 'text-navy-muted' : trend === goodDirection ? 'text-green-600' : 'text-danger';
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_44px_28px] items-center gap-2 border-b border-line py-2 last:border-0">
      <span className="flex min-w-0 items-center gap-2.5">
        <RiderStatIcon src={icon} alt={label} size={24} />
        <span className="min-w-0 truncate text-[15px] text-navy" title={label}>{label}</span>
      </span>
      <span className="text-right text-base font-semibold tabular-nums text-navy">{value}</span>
      <span className={`text-right text-base font-bold leading-none ${colorClass}`} aria-label={trend}>
        {ARROW[trend]}
      </span>
    </li>
  );
}
