/** Thin attribute/condition rail. Value is 0..100. */
export function ProgressBar({
  value, tone = 'teal', className = '',
}: {
  value: number;
  tone?: 'teal' | 'warn' | 'navy';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = tone === 'warn' ? 'bg-warn' : tone === 'navy' ? 'bg-navy-soft' : 'bg-teal';
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-teal-rail ${className}`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
