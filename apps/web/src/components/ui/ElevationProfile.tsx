/**
 * Compact stage profile. Renders normalised samples (0..1) as a filled area.
 * Purely presentational: it never asks the Race Engine for anything.
 */
export function ElevationProfile({
  samples, height = 40, className = '', markers = [], showEnds = false,
}: {
  samples: readonly number[];
  height?: number;
  className?: string;
  /** Optional climb markers as { at: 0..1, tone }. */
  markers?: { at: number; tone: 'hc' | 'cat1' | 'cat2' }[];
  showEnds?: boolean;
}) {
  const w = 100;
  const pts = samples.map((v, i) => {
    const x = (i / (samples.length - 1)) * w;
    const y = height - v * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const area = `0,${height} ${pts.join(' ')} ${w},${height}`;
  const tones: Record<string, string> = { hc: '#dc2626', cat1: '#dc2626', cat2: '#0e9384' };

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
        <polygon points={area} fill="#0e9384" fillOpacity="0.12" />
        <polyline points={pts.join(' ')} fill="none" stroke="#0e9384" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      {markers.map((m, i) => (
        <span
          key={i}
          className="absolute -translate-x-1/2 rounded-full px-1 text-[9px] font-bold leading-4 text-white"
          style={{ left: `${m.at * 100}%`, top: 0, background: tones[m.tone] }}
        >
          {m.tone === 'hc' ? 'HC' : m.tone === 'cat1' ? '1' : '2'}
        </span>
      ))}
      {showEnds && (
        <>
          <span className="absolute left-0 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card text-teal">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="absolute right-0 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card">
            <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="#12283d">
              <path d="M0 0h4v4H0zM8 0h4v4H8zM4 4h4v4H4zM12 4h4v4h-4zM0 8h4v4H0zM8 8h4v4H8z" />
            </svg>
          </span>
        </>
      )}
    </div>
  );
}
