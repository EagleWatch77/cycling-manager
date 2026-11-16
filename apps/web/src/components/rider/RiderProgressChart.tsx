'use client';

import { useState } from 'react';
import type { HistorySource, SeriesKey, SeriesPoint } from '@/lib/rider/progress';

type Option = { key: SeriesKey; label: string };

/**
 * Premium development chart. Plots ONLY real stored history points (one per
 * stored row, in order) — no interpolation, no projection. With a single
 * record it shows one point plus a "tracking just started" note.
 * Series data for every selectable metric is computed on the server and
 * passed in; this component never fetches or derives anything.
 */
export function RiderProgressChart({
  options, series, labels, sourceLabels,
}: {
  options: Option[];
  series: Record<string, SeriesPoint[]>;
  labels: { metric: string; started: string; chartAria: string; week: string };
  /** Only sources that really exist are labelled; others are omitted. */
  sourceLabels: Partial<Record<HistorySource, string>>;
}) {
  const [key, setKey] = useState<string>(options[0]?.key ?? 'ovr');
  const pts = series[key] ?? [];
  const W = 560, H = 160, PX = 36, PY = 16;
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const lo = min === max ? min - 1 : min, hi = min === max ? max + 1 : max;
  const x = (i: number) => (pts.length <= 1 ? W / 2 : PX + (i * (W - PX - 12)) / (pts.length - 1));
  const y = (v: number) => H - PY - ((v - lo) / (hi - lo)) * (H - 2 * PY);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const tip = (p: SeriesPoint) =>
    `${p.value} · ${p.seasonId} · ${labels.week} ${p.week}${sourceLabels[p.source] ? ` · ${sourceLabels[p.source]}` : ''}`;

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs font-semibold text-navy-muted">
        {labels.metric}
        <select value={key} onChange={(e) => setKey(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-sm font-semibold text-navy">
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.chartAria} className="h-40 w-full">
        <line x1={PX} y1={H - PY} x2={W - 8} y2={H - PY} className="stroke-line" strokeWidth="1" />
        <text x={PX - 6} y={y(hi) + 4} textAnchor="end" className="fill-navy-muted text-2xs tabular-nums">{hi}</text>
        <text x={PX - 6} y={y(lo) + 4} textAnchor="end" className="fill-navy-muted text-2xs tabular-nums">{lo}</text>
        {pts.length > 1 && <path d={path} fill="none" className="stroke-teal" strokeWidth="2" strokeLinejoin="round" />}
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" className="fill-teal">
            <title>{tip(p)}</title>
          </circle>
        ))}
      </svg>
      {pts.length === 1 && <p className="text-xs leading-snug text-navy-soft">{labels.started}</p>}
    </div>
  );
}
