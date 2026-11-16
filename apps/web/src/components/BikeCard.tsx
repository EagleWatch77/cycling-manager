import type { T } from '@/i18n/config';
import { EmptyState } from './ui/EmptyState';
import { SectionCard } from './ui/SectionCard';
import type { BikeEquipmentId } from '@/lib/bike/equipment';
import { bikeVisualForFrameLevel } from '@/lib/bike/visuals';
import { overallBikeLevel, formatBikeLevel, stateBand, type StateBand } from '@/lib/bike/overview';

export interface BikeOverviewItem {
  id: BikeEquipmentId;
  /** Owned component level. */
  level: number;
  /** Component state 0-100 (100 = new), or null when the app does not store it. */
  state: number | null;
}

const NAME: Record<BikeEquipmentId, string> = {
  frame: 'bikePage.comp.frame', wheels: 'bikeCard.wheels', tires: 'facilities.bikeTires', brakes: 'facilities.bikeBrakes', drivetrain: 'facilities.bikeDrivetrain',
};
const TONE: Record<StateBand, string> = { good: 'text-teal-dark', low: 'text-warn', critical: 'text-danger' };

/** Drawing units (the window scales as one piece, so lines follow the picture at any width). */
const W = 400, H = 224;
const IMG = { x: 80, y: 50, w: 240, h: 160 } as const;
const CHIP = { w: 74, h: 34 } as const;
const CHIPS: Record<BikeEquipmentId, { x: number; y: number; side: 'left' | 'right' }> = {
  frame: { x: 4, y: 10, side: 'left' },
  drivetrain: { x: 4, y: 176, side: 'left' },
  brakes: { x: W - 4 - CHIP.w, y: 10, side: 'right' },
  wheels: { x: W - 4 - CHIP.w, y: 93, side: 'right' },
  tires: { x: W - 4 - CHIP.w, y: 176, side: 'right' },
};
const pct = (v: number, total: number) => `${(v / total) * 100}%`;

/**
 * "Môj bicykel" on Home: the owned bike picture (chosen only by the frame level,
 * same logic as the detail page), the overall level above the saddle and the
 * STATE (100 % = new) of the five components with a leader line each. Everything
 * links to the existing /bike page; there are no service/purchase buttons here.
 * `items = null` = no rider/bike. A missing value is a dash, never an invented 100 %.
 */
export function BikeCard({ t, items, className = '' }: { t: T; items: readonly BikeOverviewItem[] | null; className?: string }) {
  if (!items) {
    return (
      <SectionCard icon="frame" title={t('bikeCard.title')} tone="tint" className={className}>
        <EmptyState compact icon="chain" text={t('equipment.bikeEmpty')} />
      </SectionCard>
    );
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const frameLevel = byId.get('frame')?.level ?? 1;
  const visual = bikeVisualForFrameLevel(frameLevel);
  const level = formatBikeLevel(overallBikeLevel(items.map((i) => i.level)), t('bikeCard.decimalSep'));
  const critical = items.filter((i) => i.state != null && stateBand(i.state) === 'critical');
  const point = (id: BikeEquipmentId) => ({ x: IMG.x + visual.anchors[id].x * IMG.w, y: IMG.y + visual.anchors[id].y * IMG.h });
  const saddle = { x: IMG.x + visual.saddle.x * IMG.w, y: IMG.y + visual.saddle.y * IMG.h };

  return (
    <SectionCard icon="frame" title={t('bikeCard.title')} tone="tint" className={className}>
      <div className="relative mx-auto w-full" style={{ aspectRatio: `${W} / ${H}` }} data-testid="bike-overview" data-visual={visual.key}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
          <image href={visual.file} x={IMG.x} y={IMG.y} width={IMG.w} height={IMG.h} preserveAspectRatio="xMidYMid meet" />
          {(Object.keys(CHIPS) as BikeEquipmentId[]).map((id) => {
            const c = CHIPS[id];
            const a = point(id);
            return (
              <g key={id}>
                <line x1={c.side === 'left' ? c.x + CHIP.w : c.x} y1={c.y + CHIP.h / 2} x2={a.x} y2={a.y} className="stroke-teal" strokeWidth={1.2} data-line={id} />
                <circle cx={a.x} cy={a.y} r={2.6} className="fill-teal stroke-card" strokeWidth={1.2} />
              </g>
            );
          })}
        </svg>

        <a
          href="/bike"
          aria-label={t('bikeCard.title')}
          data-testid="bike-picture-link"
          className="absolute focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          style={{ left: pct(IMG.x, W), top: pct(IMG.y, H), width: pct(IMG.w, W), height: pct(IMG.h, H) }}
        />

        <span
          data-testid="bike-level"
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border border-teal/40 bg-teal-rail px-2 py-0.5 text-2xs font-extrabold text-teal-dark"
          style={{ left: pct(saddle.x, W), top: pct(saddle.y - 2, H) }}
        >
          {t('bikeCard.overallLevel', { n: level })}
        </span>

        {(Object.keys(CHIPS) as BikeEquipmentId[]).map((id) => {
          const c = CHIPS[id];
          const item = byId.get(id);
          const state = item?.state ?? null;
          const band = state == null ? null : stateBand(state);
          return (
            <a
              key={id}
              href={`/bike?component=${id}`}
              data-component={id}
              data-state-band={band ?? 'unknown'}
              title={state == null ? t('bikeCard.missing') : undefined}
              className="absolute flex flex-col justify-center rounded-lg border border-line bg-card/95 px-1.5 shadow-card transition-colors hover:border-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              style={{ left: pct(c.x, W), top: pct(c.y, H), width: pct(CHIP.w, W), height: pct(CHIP.h, H) }}
            >
              <span className="truncate text-2xs font-semibold leading-tight text-navy-soft">{t(NAME[id])}</span>
              <span className={`text-sm font-extrabold leading-tight tabular-nums ${band ? TONE[band] : 'text-navy-muted'}`} data-state={id}>
                {state == null ? '—' : `${state} %`}
              </span>
            </a>
          );
        })}
      </div>
      {critical.length > 0 && (
        <p role="status" data-testid="bike-warning" className="border-t border-line bg-teal-rail px-3.5 py-1.5 text-xs font-semibold text-danger">
          {t('bikeCard.criticalWarning', { names: critical.map((i) => t(NAME[i.id])).join(', ') })}
        </p>
      )}
    </SectionCard>
  );
}
