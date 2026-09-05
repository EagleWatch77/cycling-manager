import type { DanubeStage } from '@/data/danube';

/**
 * A single stage's elevation profile with sprint (S) and KOM markers, drawn
 * from the generated profile samples. Fill colour follows difficulty, matching
 * the reference: green flat, blue hilly, purple mountain, teal ITT.
 */
const FILL: Record<string, { line: string; area: string }> = {
  flat: { line: '#16a34a', area: 'rgba(22,163,74,0.14)' },
  hilly: { line: '#2563eb', area: 'rgba(37,99,235,0.14)' },
  itt: { line: '#0e9384', area: 'rgba(14,147,132,0.14)' },
  mountain: { line: '#7c3aed', area: 'rgba(124,58,237,0.16)' },
};

export function StageProfile({ stage, height = 90 }: { stage: DanubeStage; height?: number }) {
  const w = 100;
  const c = FILL[stage.difficulty];
  const pts = stage.profile.map((v, i) => {
    const x = (i / (stage.profile.length - 1)) * w;
    const y = height - v * (height - 12) - 4;
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `0,${height} ${line} ${w},${height}`;
  const yAt = (km: number) => {
    const t = km / stage.km;
    const i = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
    return pts[i][1];
  };

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
        <polygon points={area} fill={c.area} />
        <polyline points={line} fill="none" stroke={c.line} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      {stage.markers.map((m, i) => {
        const left = (m.km / stage.km) * 100;
        const top = (yAt(m.km) / height) * 100;
        return (
          <span key={i} className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${left}%`, top: `${top}%` }}>
            {m.kind === 'sprint' ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-[9px] font-bold text-white">S</span>
            ) : (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-sm bg-red-600 px-0.5 text-[9px] font-bold text-white">{m.category}</span>
            )}
          </span>
        );
      })}
      <span className="absolute bottom-0 left-0 text-[9px] text-navy-muted">0</span>
      <span className="absolute bottom-0 right-0 text-[9px] text-navy-muted">{stage.km} km</span>
    </div>
  );
}
