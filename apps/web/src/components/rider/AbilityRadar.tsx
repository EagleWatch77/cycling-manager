import type { T } from '@/i18n/config';
import type { SkillAttribute } from '@/lib/rider/config';

/**
 * Six-axis ability radar built from the real 15 engine attributes.
 *
 * The engine has no "Technique/Tactics/Development" attributes, so instead of
 * inventing them the axes group the skills we actually have into readable
 * families. Every number on screen traces back to a stored attribute.
 */
const AXES: { key: string; from: SkillAttribute[] }[] = [
  { key: 'radar.mountains', from: ['climbing', 'hills'] },
  { key: 'radar.flat', from: ['flat', 'energyManagement'] },
  { key: 'radar.sprint', from: ['sprint', 'acceleration'] },
  { key: 'radar.endurance', from: ['endurance', 'experience'] },
  { key: 'radar.technique', from: ['descending', 'bikeHandling', 'cornering'] },
  { key: 'radar.positioning', from: ['positioning', 'packRiding'] },
];

const SCALE_MIN = 90;
/**
 * Development Model V2 (see the chat report): the 7 Performance attributes
 * now have a 200 career ceiling; Tactics/Technique/experience stay at 160.
 * Two of the six axes above MIX a Performance attribute with a non-
 * Performance one ('radar.flat': flat+energyManagement; 'radar.endurance':
 * endurance+experience) — a single shared scale can't be exactly correct
 * for a mixed axis no matter what value is picked. Using PERFORMANCE_MAX
 * (200) here, rather than redesigning axis membership (out of this task's
 * scope), keeps pure-Performance axes ('mountains', 'sprint') correctly
 * proportioned all the way to 200; pure non-Performance axes ('technique',
 * 'positioning') and the two mixed axes will visually read as never quite
 * reaching the outer ring even at their own real maximum — an accepted,
 * reported tradeoff for this high-level comparative chart, not a precision
 * display.
 */
const SCALE_MAX = 200;

export function AbilityRadar({
  t, attributes,
}: {
  t: T;
  attributes: Record<SkillAttribute, number>;
}) {
  const values = AXES.map((a) => {
    const mean = a.from.reduce((s, k) => s + attributes[k], 0) / a.from.length;
    return { key: a.key, raw: Math.round(mean), norm: clamp01((mean - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) };
  });

  const size = 260;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = 92;
  const n = AXES.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, radius: number) => [cx + Math.cos(angle(i)) * radius, cy + Math.sin(angle(i)) * radius];

  const rings = [0.25, 0.5, 0.75, 1];
  const poly = values.map((v, i) => point(i, r * v.norm).join(',')).join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px]">
        {rings.map((ring) => (
          <polygon key={ring}
            points={AXES.map((_, i) => point(i, r * ring).join(',')).join(' ')}
            fill="none" stroke="#e4e9ec" strokeWidth="1" />
        ))}
        {AXES.map((_, i) => {
          const [x, y] = point(i, r);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e4e9ec" strokeWidth="1" />;
        })}
        <polygon points={poly} fill="#0e9384" fillOpacity="0.15" stroke="#0e9384" strokeWidth="2" />
        {values.map((v, i) => {
          const [x, y] = point(i, r * v.norm);
          return <circle key={i} cx={x} cy={y} r="3" fill="#0e9384" />;
        })}
        {values.map((v, i) => {
          const [x, y] = point(i, r + 20);
          return (
            <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              className="fill-navy-soft text-[9px] font-semibold">
              <tspan x={x} dy="-3">{t(v.key)}</tspan>
              <tspan x={x} dy="11" className="fill-navy text-[11px] font-bold">{v.raw}</tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
