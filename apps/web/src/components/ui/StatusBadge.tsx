const TONE_CLASS: Record<'teal' | 'gray' | 'warn' | 'danger', string> = {
  teal: 'bg-teal-light text-teal-dark',
  gray: 'bg-surface text-navy-muted',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
};

/** Small uppercase pill — status/tier/state labels (rookie badge, contract status, etc.). */
export function StatusBadge({ label, tone = 'gray' }: { label: string; tone?: keyof typeof TONE_CLASS }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}
