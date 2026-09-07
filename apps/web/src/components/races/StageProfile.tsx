import type { DanubeStage } from '@/data/danube';

/**
 * Simplified, game-UI take on a classic cycling stage profile: elevation
 * area + start/finish + sprint/climb markers. Deliberately lighter than a
 * real race-organizer graphic — no altitude axis, no distance grid, no km
 * ticks along the route — just enough to read a stage at a glance.
 *
 * Colour comes from the app's own teal/navy palette (never the raw
 * green/blue/purple/red a generic chart library would default to), so a
 * stage profile still looks unmistakably like the rest of Cycling Manager.
 */

const TONE: Record<DanubeStage['difficulty'], { line: string; area: string }> = {
  flat: { line: '#0e9384', area: 'rgba(14,147,132,.16)' }, // teal
  hilly: { line: '#33506a', area: 'rgba(51,80,106,.16)' }, // navy-soft
  itt: { line: '#0b7469', area: 'rgba(11,116,105,.18)' }, // teal-dark
  mountain: { line: '#12283d', area: 'rgba(18,40,61,.20)' }, // navy
};

/** Harder categories read as more prominent (darker), not just differently coloured. */
const KOM_TONE: Record<1 | 2 | 3, string> = {
  1: '#12283d',
  2: '#33506a',
  3: '#6b8195',
};

/** Smooth quadratic curve through the sample points (midpoints as anchors) — a route profile, not a jagged ruler. */
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0][0]},${pts[0][1]}` : '';
  let d = `M ${pts[0][0]},${pts[0][1]} `;
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i][0] + pts[i + 1][0]) / 2;
    const yc = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q ${pts[i][0]},${pts[i][1]} ${xc},${yc} `;
  }
  const [px, py] = pts[pts.length - 2];
  const [lx, ly] = pts[pts.length - 1];
  d += `Q ${px},${py} ${lx},${ly}`;
  return d;
}

export function StageProfile({ stage, height = 100 }: { stage: DanubeStage; height?: number }) {
  const w = 100;
  const tone = TONE[stage.difficulty];
  const top = 14; // headroom so climb/sprint badges never clip
  const bottom = height - 16; // room for the baseline + km labels under it

  const pts = stage.profile.map((v, i) => {
    const x = (i / (stage.profile.length - 1)) * w;
    const y = bottom - v * (bottom - top);
    return [x, y] as const;
  });
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L ${w},${bottom} L 0,${bottom} Z`;

  const yAt = (km: number) => {
    const t = km / stage.km;
    const i = Math.min(pts.length - 1, Math.max(0, Math.round(t * (pts.length - 1))));
    return pts[i][1];
  };

  const sprints = stage.markers.filter((m) => m.kind === 'sprint');
  const koms = stage.markers.filter((m) => m.kind === 'kom');

  return (
    <div className="w-full">
      {/* Start / finish — the profile's own header, not a separate row the caller has to build. */}
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate text-xs font-bold text-navy">{stage.from}</span>
          <span className="text-2xs text-navy-muted">{stage.startM} m</span>
        </div>
        <div className="min-w-0 text-right">
          <span className="block truncate text-xs font-bold text-navy">{stage.to}</span>
          <span className="text-2xs text-navy-muted">{stage.endM} m</span>
        </div>
      </div>

      <div className="relative w-full">
        <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
          <line x1="0" y1={bottom} x2={w} y2={bottom} stroke="#e4e9ec" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={areaPath} fill={tone.area} />
          <path
            d={linePath}
            fill="none"
            stroke={tone.line}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Sprint: round teal badge — a fast, "friendly" checkpoint. */}
        {sprints.map((m, i) => (
          <span
            key={`s-${i}`}
            className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
            style={{ left: `${(m.km / stage.km) * 100}%`, top: `${(yAt(m.km) / height) * 100}%` }}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-teal text-[9px] font-bold text-white shadow-sm">
              S
            </span>
            <span className="h-1.5 w-px bg-teal/50" />
          </span>
        ))}

        {/* Climb (KOM): diamond badge, shape alone tells it apart from a sprint;
            shade tells the category apart without adding a legend. */}
        {koms.map((m, i) => (
          <span
            key={`k-${i}`}
            className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
            style={{ left: `${(m.km / stage.km) * 100}%`, top: `${(yAt(m.km) / height) * 100}%` }}
          >
            <span
              className="flex h-3.5 w-3.5 rotate-45 items-center justify-center rounded-[3px] shadow-sm"
              style={{ background: KOM_TONE[m.category ?? 3] }}
            >
              <span className="-rotate-45 text-[8px] font-bold text-white">{m.category}</span>
            </span>
            <span className="h-1.5 w-px" style={{ background: KOM_TONE[m.category ?? 3] }} />
          </span>
        ))}

        <span className="absolute bottom-0 left-0 text-[9px] text-navy-muted">0 km</span>
        <span className="absolute bottom-0 right-0 text-[9px] text-navy-muted">{stage.km} km</span>
      </div>
    </div>
  );
}
