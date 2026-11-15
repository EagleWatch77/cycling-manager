'use client';

import { useEffect, useRef, useState } from 'react';
import { CardTitle } from '../ui/CardTitle';
import {
  EXPANDABLE_GROUPS, RADAR_GROUP_ORDER,
  type ExpandableGroupId, type RadarGroup, type RadarModel,
} from '@/lib/rider/radar';

/**
 * Interactive ability radar: five main axes (Výkon, Taktika, Technika,
 * Skúsenosti, Rozvoj) and, on demand, one expanded group whose real
 * attributes fan out around its axis as small points with leader lines.
 *
 * Receives a pre-computed, pre-translated model (lib/rider/radar.ts) — it
 * never sees raw hidden development values, only scouting estimates (or
 * none). Expanding only ADDS points; the main polygon and group averages
 * never change. Works by tap/click and keyboard, no hover needed.
 */

export interface RadarLabels {
  overview: string;
  estimate: string;
  unknown: string;
  note: string;
  noteUnknown: string;
  aria: string;
}

const CX = 240, CY = 190, R = 102;
/**
 * Two view boxes with the SAME aspect ratio (so the card height never
 * jumps): a tight one around the 5-axis overview (graph as large as
 * possible) and a wider one for the expanded fan, which needs two label
 * columns. The view box is interpolated while a group opens/closes.
 */
const OV_W = 410, OV_H = 276;
const OV = { x: CX - OV_W / 2, y: CY - 12 - OV_H / 2, w: OV_W, h: OV_H };   // overview content is centred on CY-12
const EX_W = 480, EX_H = (EX_W * OV_H) / OV_W;
const EX = { x: CX - EX_W / 2, y: CY - 195, w: EX_W, h: EX_H };               // fan rows start at CY-182
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Decorative topographic contour lines behind the plot (cycling-route-map
 * feel): nested wobbly rings around two "hills", generated deterministically
 * (pure math, no randomness) so server and client markup are identical.
 * Very low contrast by design.
 */
const CONTOUR_W = 600, CONTOUR_H = 600;
function contourRing(cx: number, cy: number, r: number, phase: number): string {
  const pts: string[] = [];
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.10 * Math.sin(3 * a + phase) + 0.06 * Math.sin(5 * a + phase * 1.7) + 0.04 * Math.sin(2 * a - phase);
    const x = cx + Math.cos(a) * r * wob * 1.25;
    const y = cy + Math.sin(a) * r * wob * 0.9;
    pts.push(`${i === 0 ? 'M' : 'L'}${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`);
  }
  return pts.join('') + 'Z';
}
const CONTOURS: string[] = [
  ...Array.from({ length: 11 }, (_, i) => contourRing(440, 170, 28 + i * 28, 0.6 + i * 0.18)),
  ...Array.from({ length: 10 }, (_, i) => contourRing(140, 440, 24 + i * 28, 2.1 + i * 0.22)),
];
const N = RADAR_GROUP_ORDER.length;
const STEP = (Math.PI * 2) / N;
const FAN_STEP = 0.3;
const ROW_TOP = CY - 168;
const ROW_GAP = 28;
const COL_X = 118;

const TEAL = '#0e9384';
const ORANGE = '#d0944f';
const ORANGE_TEXT = '#9a5b1c';

const pt = (ang: number, radius: number): [number, number] => [CX + Math.cos(ang) * radius, CY + Math.sin(ang) * radius];
const f1 = (n: number) => Math.round(n * 10) / 10;
const fmtRange = (r: { min: number; max: number }) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);

export function AbilityRadar({ model, labels, title, className = '', initialSelected = null }: { model: RadarModel; labels: RadarLabels; title: string; className?: string; initialSelected?: ExpandableGroupId | null }) {
  const [selected, setSelected] = useState<ExpandableGroupId | null>(initialSelected);
  const [rot, setRot] = useState(initialSelected ? -RADAR_GROUP_ORDER.indexOf(initialSelected) * STEP : 0);
  const [settled, setSettled] = useState(true);
  const [zoom, setZoom] = useState(initialSelected ? 1 : 0);
  const zoomRef = useRef(initialSelected ? 1 : 0);
  const rotRef = useRef(initialSelected ? -RADAR_GROUP_ORDER.indexOf(initialSelected) * STEP : 0);
  const rafRef = useRef<number | null>(null);

  const groups = model.groups;
  const selIndex = selected ? RADAR_GROUP_ORDER.indexOf(selected) : -1;

  // Rotate so the selected group's axis points up; back to 0 for the overview.
  useEffect(() => {
    const target = selIndex >= 0 ? -selIndex * STEP : 0;
    const from = rotRef.current;
    const zFrom = zoomRef.current;
    const zTo = selIndex >= 0 ? 1 : 0;
    const delta = ((((target - from + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (reduce || (Math.abs(delta) < 1e-4 && Math.abs(zFrom - zTo) < 1e-4)) {
      rotRef.current = from + delta; setRot(from + delta); zoomRef.current = zTo; setZoom(zTo); setSettled(true);
      return;
    }
    setSettled(false);
    const start = performance.now();
    const DUR = 380;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DUR);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + delta * eased;
      rotRef.current = v; setRot(v);
      const z = zFrom + (zTo - zFrom) * eased; zoomRef.current = z; setZoom(z);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else setSettled(true);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [selIndex]);

  const toggle = (id: ExpandableGroupId) => setSelected((cur) => (cur === id ? null : id));
  const angleOf = (i: number) => -Math.PI / 2 + i * STEP + rot;

  const known = groups.map((g, i) => ({ g, i })).filter(({ g }) => g.norm !== null);
  const poly = known.map(({ g, i }) => pt(angleOf(i), R * (g.norm as number)).map(f1).join(',')).join(' ');
  const selGroup = selected ? groups[selIndex] : null;

  return (
    <section className={`relative flex flex-col overflow-hidden rounded-card border border-line bg-card shadow-card ${className}`}
      style={{ backgroundImage: 'radial-gradient(ellipse at 50% 56%, rgb(14 147 132 / 0.13) 0%, rgb(14 147 132 / 0.06) 48%, rgb(14 147 132 / 0.02) 100%)' }}>
      {/* Topographic contours across the WHOLE card (decorative, low contrast) */}
      <svg aria-hidden="true" viewBox={`0 0 ${CONTOUR_W} ${CONTOUR_H}`} preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full">
        {CONTOURS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={TEAL} strokeOpacity={i % 4 === 0 ? 0.13 : 0.07} strokeWidth={i % 4 === 0 ? 1 : 0.8} strokeLinejoin="round" />
        ))}
      </svg>

      {/* same header as Card (padding, h2 style), without the divider so it blends into the background */}
      <header className="relative flex items-center justify-between gap-2 px-3.5 py-2.5">
        <h2 className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">
          <CardTitle icon="radar">{title}</CardTitle>
        </h2>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-2 px-2 pb-3">
        <div role="group" aria-label={labels.aria} className="flex flex-wrap justify-center gap-1.5">
          <TabButton active={selected === null} onClick={() => setSelected(null)} label={labels.overview} />
          {EXPANDABLE_GROUPS.map((id) => (
            <TabButton key={id} active={selected === id} dev={id === 'development'}
              onClick={() => setSelected(id)} label={groups[RADAR_GROUP_ORDER.indexOf(id)].label} />
          ))}
        </div>

      <svg viewBox={`${f1(lerp(OV.x, EX.x, zoom))} ${f1(lerp(OV.y, EX.y, zoom))} ${f1(lerp(OV.w, EX.w, zoom))} ${f1(lerp(OV.h, EX.h, zoom))}`}
        className="relative block h-auto w-full max-w-[680px]" role="img" aria-label={labels.aria}>
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon key={ring} fill="none" stroke="#6b8195" strokeOpacity="0.3" strokeWidth="1"
            points={groups.map((_, i) => pt(angleOf(i), R * ring).map(f1).join(',')).join(' ')} />
        ))}
        {groups.map((g, i) => {
          const [x, y] = pt(angleOf(i), R);
          const dev = g.id === 'development';
          return <line key={g.id} x1={CX} y1={CY} x2={f1(x)} y2={f1(y)}
            stroke={dev ? ORANGE : '#6b8195'} strokeOpacity={dev ? 1 : 0.3} strokeWidth="1" strokeDasharray={dev ? '3 3' : undefined} />;
        })}

        {known.length >= 3 && (
          <polygon points={poly} fill={TEAL} fillOpacity="0.14" stroke={TEAL} strokeWidth="2" strokeLinejoin="round" />
        )}

        {/* Main group points */}
        {groups.map((g, i) => {
          const a = angleOf(i);
          const dev = g.id === 'development';
          if (g.norm === null) return null;
          const [x, y] = pt(a, R * g.norm);
          const dim = selected !== null && selected !== g.id;
          return (
            <g key={g.id} opacity={dim ? 0.7 : 1}>
              {dev && g.normRange && (() => {
                const [x1, y1] = pt(a, R * g.normRange.min);
                const [x2, y2] = pt(a, R * g.normRange.max);
                return <line x1={f1(x1)} y1={f1(y1)} x2={f1(x2)} y2={f1(y2)} stroke={ORANGE} strokeWidth="4" strokeLinecap="round" opacity="0.8" />;
              })()}
              <circle cx={f1(x)} cy={f1(y)} r="5.5" fill={dev ? '#fff' : TEAL} stroke={dev ? ORANGE : '#fff'} strokeWidth="2" />
            </g>
          );
        })}

        {/* Expanded fan */}
        {selGroup && settled && <Fan group={selGroup} angle={angleOf(selIndex)} labels={labels} />}

        {/* Main labels (click/tap/keyboard) */}
        {groups.map((g, i) => {
          const a = angleOf(i);
          const [x, y] = pt(a, R + 16);
          const c = Math.cos(a);
          const anchor = c > 0.25 ? 'start' : c < -0.25 ? 'end' : 'middle';
          const dev = g.id === 'development';
          const expandable = g.id !== 'experience';
          const dim = selected !== null && selected !== g.id;
          const value = g.value !== null ? String(g.value) : g.range ? `${fmtRange(g.range)} · ${labels.estimate}` : labels.unknown;
          const ty = y + Math.sin(a) * 8;
          return (
            <g key={g.id} opacity={dim ? 0.75 : 1}
              role={expandable ? 'button' : undefined} tabIndex={expandable ? 0 : undefined}
              aria-pressed={expandable ? selected === g.id : undefined}
              aria-label={`${g.label} ${value}`}
              style={{ cursor: expandable ? 'pointer' : 'default', outline: 'none' }}
              onClick={expandable ? () => toggle(g.id as ExpandableGroupId) : undefined}
              onKeyDown={expandable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(g.id as ExpandableGroupId); } } : undefined}>
              <rect x={anchor === 'start' ? x - 4 : anchor === 'end' ? x - 96 : x - 50} y={ty - 17} width={100} height={34} fill="transparent" />
              <text x={f1(x)} y={f1(ty)} textAnchor={anchor} dominantBaseline="middle">
                <tspan x={f1(x)} dy="-6" className="text-[11px] font-semibold" fill="#33506a">{g.label}</tspan>
                <tspan x={f1(x)} dy="14" className="text-[12px] font-bold" fill={dev ? ORANGE_TEXT : '#12283d'}>{value}</tspan>
              </text>
            </g>
          );
        })}
      </svg>

        {selected === 'development' && (
          <p className="max-w-[420px] text-center text-2xs leading-snug text-navy-soft">
            {groups[RADAR_GROUP_ORDER.indexOf('development')].range ? labels.note : labels.noteUnknown}
          </p>
        )}
      </div>
    </section>
  );
}

function TabButton({ active, dev, onClick, label }: { active: boolean; dev?: boolean; onClick: () => void; label: string }) {
  const on = dev ? 'border-[#d0944f] bg-[#d0944f] text-white' : 'border-teal bg-teal text-white';
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors ${active ? on : 'border-line bg-card text-navy-soft hover:border-teal'}`}>
      {label}
    </button>
  );
}

function Fan({ group, angle, labels }: { group: RadarGroup; angle: number; labels: RadarLabels }) {
  const dev = group.id === 'development';
  const attrs = group.attributes;
  const k = attrs.length;
  const leftCount = Math.floor(k / 2);
  const color = dev ? ORANGE : TEAL;

  return (
    <g>
      {attrs.map((a, j) => {
        const phi = angle + (j - (k - 1) / 2) * FAN_STEP;
        const left = j < leftCount;
        const row = left ? leftCount - 1 - j : j - leftCount;
        const ly = ROW_TOP + row * ROW_GAP;
        const lx = left ? CX - COL_X : CX + COL_X;
        const [gx, gy] = pt(phi, R);
        const hasPoint = a.norm !== null;
        const [px, py] = hasPoint ? pt(phi, R * (a.norm as number)) : [gx, gy];
        const value = a.value !== null ? String(a.value) : a.range ? `${fmtRange(a.range)} · ${labels.estimate}` : labels.unknown;
        return (
          <g key={a.key}>
            <line x1={CX} y1={CY} x2={f1(gx)} y2={f1(gy)} stroke={color} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 3" />
            {a.normRange && (() => {
              const [x1, y1] = pt(phi, R * a.normRange.min);
              const [x2, y2] = pt(phi, R * a.normRange.max);
              return <line x1={f1(x1)} y1={f1(y1)} x2={f1(x2)} y2={f1(y2)} stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.85" />;
            })()}
            {hasPoint && (
              <circle cx={f1(px)} cy={f1(py)} r="3.6" fill={dev ? '#fff' : color} stroke={dev ? color : '#fff'} strokeWidth="1.5" />
            )}
            <polyline points={`${f1(hasPoint ? px : gx)},${f1(hasPoint ? py : gy)} ${f1(lx + (left ? 6 : -6))},${ly} ${lx + (left ? 2 : -2)},${ly}`}
              fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="1" strokeDasharray={dev ? '3 2' : undefined} />
            <text x={lx} y={ly} textAnchor={left ? 'end' : 'start'} dominantBaseline="middle">
              <tspan x={lx} dy="-6" className="text-[10.5px] font-semibold" fill="#33506a">{a.label}</tspan>
              <tspan x={lx} dy="13" className="text-[11.5px] font-bold" fill={dev ? (a.range ? ORANGE_TEXT : '#6b8195') : '#12283d'}>{value}</tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
}
