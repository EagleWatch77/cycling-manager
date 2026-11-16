'use client';

import { useEffect, useState } from 'react';

/**
 * Countdown to the Tour's real start. The initial value is computed on the
 * SERVER (server game time, see lib/calendar/season); in the browser it only
 * counts down from that value using a monotonic timer, never the device
 * clock, so a wrong local clock cannot change it. `initialMs = null` (Tour
 * already started / no start) shows dashes.
 */
export function CountdownTiles({
  initialMs, labels, className = '',
}: {
  initialMs: number | null;
  labels: { days: string; hours: string; minutes: string; seconds: string };
  className?: string;
}) {
  const [left, setLeft] = useState<number | null>(initialMs);
  useEffect(() => {
    if (initialMs == null) return;
    const t0 = performance.now();
    const id = setInterval(() => setLeft(Math.max(0, initialMs - (performance.now() - t0))), 1000);
    return () => clearInterval(id);
  }, [initialMs]);

  const total = left == null ? null : Math.floor(left / 1000);
  const parts = total == null
    ? ['—', '—', '—', '—']
    : [Math.floor(total / 86400), Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60].map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0')));
  const units = [labels.days, labels.hours, labels.minutes, labels.seconds];

  return (
    <div className={`grid grid-cols-4 divide-x divide-teal-light ${className}`} role="timer" aria-live="off">
      {parts.map((v, i) => (
        <div key={units[i]} className="flex flex-col items-center py-1.5">
          <span data-unit={i} className="text-xl font-extrabold leading-none tabular-nums text-navy">{v}</span>
          <span className="mt-0.5 text-2xs uppercase tracking-wide text-navy-muted">{units[i]}</span>
        </div>
      ))}
    </div>
  );
}
