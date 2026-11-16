'use client';

import { useState } from 'react';
import type { LeagueId } from '@/lib/leagues';
import {
  BIKE_EQUIPMENT_IDS, BIKE_PROPERTIES, BIKE_WEAR_STORED, BIKE_LEVELS, BASE_BIKE_LEVEL,
  frameMaterial, isLevelAvailable, unlockLeague, upgradeLevels, maxBikeLevel, type BikeEquipmentId,
} from '@/lib/bike/equipment';
import { Icon } from '@/components/ui/Icon';
import { BikeIllustration, anchorPoint, BIKE_VIEWBOX } from './BikeIllustration';
import { bikeVisualForFrameLevel } from '@/lib/bike/visuals';
import { BikeGlyph } from './BikeGlyph';
import { makeT, type MessageMap } from './makeT';

export type WorkshopStatus = 'ok' | 'service' | 'maintenance';
export interface WorkshopComponent {
  id: BikeEquipmentId;
  level: number;
  /** 0-100 wear (0 = new), null = not stored. */
  wear: number | null;
  status: WorkshopStatus | null;
}

const STATUS_KEY: Record<WorkshopStatus, string> = { ok: 'bikeCard.statusOk', service: 'bikeCard.statusService', maintenance: 'bikeCard.statusMaintenance' };
const STATUS_TONE: Record<WorkshopStatus, string> = { ok: 'text-teal-dark', service: 'text-warn', maintenance: 'text-danger' };
const BAR_TONE: Record<WorkshopStatus, string> = { ok: 'bg-teal', service: 'bg-warn', maintenance: 'bg-danger' };

/** Callout position on the drawing (percent of the drawing area; cards are ~20 % wide). */
const CALLOUT: Record<BikeEquipmentId, { left: string; top: string; side: 'left' | 'right'; y: number }> = {
  frame: { left: '0%', top: '3%', side: 'left', y: 45 },
  drivetrain: { left: '0%', top: '66%', side: 'left', y: 297 },
  brakes: { left: '80%', top: '3%', side: 'right', y: 45 },
  wheels: { left: '80%', top: '34%', side: 'right', y: 169 },
  tires: { left: '80%', top: '72%', side: 'right', y: 321 },
};
const CARD_W = 152;

export function BikeWorkshop({
  components, league, messages, initialSelected, weightKg, kilometres, devPreview = false,
}: {
  components: readonly WorkshopComponent[];
  league: LeagueId;
  messages: MessageMap;
  initialSelected: BikeEquipmentId;
  weightKg: number | null;
  kilometres: number | null;
  /** Development preview of a bike picture (frame level overridden by the page); never set in production. */
  devPreview?: boolean;
}) {
  const t = makeT(messages);
  const [selected, setSelected] = useState<BikeEquipmentId>(initialSelected);
  const [tab, setTab] = useState<'upgrade' | 'service'>('upgrade');
  const [picked, setPicked] = useState<number | null>(null);

  const byId = new Map(components.map((c) => [c.id, c]));
  const current = byId.get(selected)!;
  const select = (id: BikeEquipmentId) => {
    setSelected(id);
    setPicked(null);
    try { window.history.replaceState(null, '', `?component=${id}`); } catch { /* preview without history */ }
  };

  const name = (id: BikeEquipmentId) => t(`bikePage.comp.${id}`);
  const tag = (c: WorkshopComponent) => (c.id === 'frame' ? t(`bikePage.mat.${frameMaterial(c.level)}`) : c.level <= BASE_BIKE_LEVEL ? t(`bikePage.tag.${c.id}`) : t('bikePage.tagUpgraded', { n: c.level }));
  const levelOf = (n: number) => t('bikePage.level', { n });
  const upgrades = components.reduce((s, c) => s + (c.level - BASE_BIKE_LEVEL), 0);
  const upgradeCapacity = BIKE_EQUIPMENT_IDS.length * (maxBikeLevel(league) - BASE_BIKE_LEVEL);
  const frame = byId.get('frame')!;
  // The picture follows the OWNED frame level only (not the league, not the level picked in the upgrade panel).
  const visual = bikeVisualForFrameLevel(frame.level);
  const dash = '—';

  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[62fr_38fr]">
      {/* ── Bike (left) ─────────────────────────────── */}
      <section className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-card shadow-card">
        <header className="flex flex-wrap items-center gap-3 bg-teal-dark px-4 py-2.5 text-white">
          <Icon name="frame" className="h-5 w-5" />
          <h2 className="text-xl font-extrabold">{t('bikePage.bikeName')}</h2>
          <span className="rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-bold text-teal-dark">{t(`league.${league}`)}</span>
          {devPreview && <span className="rounded-full bg-warn px-2.5 py-0.5 text-xs font-bold text-white" data-testid="dev-preview">{t('bikePage.devPreview')}</span>}
          <span className="ml-auto text-xs font-medium text-teal-light">{t('bikePage.baseKit')}</span>
        </header>

        <div className="relative bg-gradient-to-b from-teal-rail to-card px-2 pb-2 pt-3" data-testid="bike-drawing" data-visual={visual.key}>
          <div className="relative mx-auto aspect-[3/2] w-full md:aspect-[760/400]">
            <BikeIllustration visual={visual} selected={selected} onSelect={select} className="absolute inset-0 h-full w-full" />
            {/* leader lines (desktop only) */}
            <svg viewBox={`0 0 ${BIKE_VIEWBOX.w} ${BIKE_VIEWBOX.h}`} className="pointer-events-none absolute inset-0 hidden h-full w-full md:block" aria-hidden="true" focusable="false">
              {BIKE_EQUIPMENT_IDS.map((id) => {
                const c = CALLOUT[id];
                const a = anchorPoint(visual, id);
                const x1 = c.side === 'left' ? CARD_W : BIKE_VIEWBOX.w - CARD_W;
                const on = id === selected;
                return (
                  <g key={id}>
                    <line x1={x1} y1={c.y} x2={a.x} y2={a.y} className={on ? 'stroke-teal' : 'stroke-teal-light'} strokeWidth={on ? 2.5 : 2} />
                    <circle cx={a.x} cy={a.y} r={on ? 5 : 4} className="fill-teal stroke-card" strokeWidth={2} />
                  </g>
                );
              })}
            </svg>
            {BIKE_EQUIPMENT_IDS.map((id) => {
              const c = byId.get(id)!;
              const pos = CALLOUT[id];
              const on = id === selected;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => select(id)}
                  aria-pressed={on}
                  data-callout={id}
                  style={{ left: pos.left, top: pos.top, width: `${(CARD_W / BIKE_VIEWBOX.w) * 100}%` }}
                  className={`absolute hidden min-h-[66px] items-center gap-1.5 rounded-xl border bg-card/95 p-1.5 text-left shadow-card transition md:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${on ? 'border-teal ring-2 ring-teal/40' : 'border-line hover:border-teal-light'}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-rail"><BikeGlyph id={id} className="h-7 w-7" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-2xs font-extrabold uppercase tracking-wide text-teal-dark">{name(id)}</span>
                    <span className="block truncate text-2xs leading-tight text-navy-soft">{tag(c)}</span>
                    <span className="mt-0.5 inline-block rounded-full border border-teal/40 bg-teal-rail px-1.5 text-2xs font-bold text-teal-dark">{levelOf(c.level)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <dl className="mx-3 mb-3 grid grid-cols-2 divide-line rounded-xl border border-line bg-surface sm:grid-cols-4 sm:divide-x" data-testid="bike-stats">
          {[
            { k: 'weight', label: t('bikePage.statWeight'), value: weightKg == null ? dash : `${weightKg} kg` },
            { k: 'frame', label: t('bikePage.statFrame'), value: t(`bikePage.mat.${frameMaterial(frame.level)}`) },
            { k: 'upgrades', label: t('bikePage.statUpgrades'), value: `${upgrades} / ${upgradeCapacity}` },
            { k: 'km', label: t('bikePage.statKm'), value: kilometres == null ? dash : `${kilometres} km` },
          ].map((s) => (
            <div key={s.k} data-stat={s.k} className="px-3 py-2">
              <dt className="text-2xs font-medium text-navy-muted">{s.label}</dt>
              <dd className="truncate text-sm font-extrabold text-navy">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Detail (right) ─────────────────────────────── */}
      <section className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-card shadow-card" data-testid="bike-detail" data-selected={selected}>
        <header className="flex items-center gap-2 bg-teal-dark px-4 py-2.5 text-white">
          <Icon name="cog" className="h-5 w-5" />
          <h2 className="text-base font-extrabold uppercase tracking-wide">{t('bikePage.detailTitle', { name: name(selected) })}</h2>
        </header>

        <div className="flex gap-3 p-3">
          <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-line bg-gradient-to-br from-teal-rail to-card sm:h-28 sm:w-28">
            <BikeGlyph id={selected} className="h-16 w-16 sm:h-20 sm:w-20" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-extrabold leading-tight text-navy">{selected === 'frame' ? t(`bikePage.mat.${frameMaterial(current.level)}`) : tag(current)}</h3>
              <span className="rounded-full bg-teal-light px-2 py-0.5 text-xs font-bold text-teal-dark" data-testid="detail-level">{levelOf(current.level)}</span>
            </div>
            <p className="mt-1 text-xs text-navy-soft">{t(`bikePage.desc.${selected}`)}</p>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-navy-soft">{t('bikePage.wear')}</span>
                <span className="font-extrabold tabular-nums text-navy" data-testid="detail-wear">{current.wear == null ? dash : `${current.wear} %`}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-teal-rail" aria-hidden="true">
                {current.wear != null && current.status && <div className={`h-full rounded-full ${BAR_TONE[current.status]}`} style={{ width: `${current.wear}%` }} />}
              </div>
            </div>
          </div>
        </div>

        <div role="tablist" className="mx-3 grid grid-cols-2 overflow-hidden rounded-t-xl border border-line text-sm font-bold">
          {(['upgrade', 'service'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls="bike-tabpanel"
              onClick={() => setTab(k)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${tab === k ? 'bg-teal text-white' : 'bg-surface text-navy-soft hover:bg-teal-rail'}`}
            >
              <Icon name={k === 'upgrade' ? 'bolt' : 'cog'} className="h-4 w-4" />
              {t(k === 'upgrade' ? 'bikePage.tabUpgrade' : 'bikePage.tabService')}
            </button>
          ))}
        </div>

        <div id="bike-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mx-3 mb-3 rounded-b-xl border border-t-0 border-line p-3">
          {tab === 'upgrade' ? (
            <UpgradeTab t={t} id={selected} current={current.level} league={league} picked={picked} onPick={setPicked} />
          ) : (
            <ServiceTab t={t} id={selected} component={current} />
          )}
        </div>
      </section>

      {/* ── Components overview (full width) ─────────────────────────────── */}
      <section className="min-w-0 xl:col-span-2" aria-label={t('bikePage.components')}>
        <h2 className="mb-2 flex items-center gap-1.5 rounded-card border border-teal-light bg-teal-rail px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-teal-dark">
          <Icon name="frame" className="h-3.5 w-3.5 text-teal" />
          {t('bikePage.components')}
        </h2>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {BIKE_EQUIPMENT_IDS.map((id) => {
            const c = byId.get(id)!;
            const on = id === selected;
            return (
              <li key={id} className={id === 'drivetrain' ? 'col-span-2 md:col-span-1' : ''}>
                <button
                  type="button"
                  onClick={() => select(id)}
                  aria-pressed={on}
                  data-tile={id}
                  className={`flex w-full flex-col gap-1.5 rounded-card border bg-card p-2.5 text-left shadow-card transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${on ? 'border-teal ring-2 ring-teal/40' : 'border-line hover:border-teal-light'}`}
                >
                  <span className="flex items-center gap-2">
                    <BikeGlyph id={id} className="h-9 w-9 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-extrabold text-navy">{name(id)}</span>
                      <span className="block truncate text-2xs text-navy-soft">{tag(c)}</span>
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-1">
                    <span className="rounded-full border border-teal/40 bg-teal-rail px-1.5 text-2xs font-bold text-teal-dark">{levelOf(c.level)}</span>
                    <span className="text-base font-extrabold tabular-nums text-navy" data-tile-wear={id}>{c.wear == null ? dash : `${c.wear} %`}</span>
                  </span>
                  <span className="h-1 w-full overflow-hidden rounded-full bg-teal-rail" aria-hidden="true">
                    {c.wear != null && c.status && <span className={`block h-full rounded-full ${BAR_TONE[c.status]}`} style={{ width: `${c.wear}%` }} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function UpgradeTab({
  t, id, current, league, picked, onPick,
}: {
  t: ReturnType<typeof makeT>; id: BikeEquipmentId; current: number; league: LeagueId; picked: number | null; onPick: (n: number | null) => void;
}) {
  const choices = upgradeLevels(current);
  const target = picked != null && isLevelAvailable(picked, league) ? picked : null;
  const props = BIKE_PROPERTIES[id];
  return (
    <div data-testid="upgrade-tab">
      <h4 className="text-sm font-extrabold text-navy">{t('bikePage.availableUpgrade')}</h4>
      {choices.length === 0 ? (
        <p className="mt-2 text-xs text-navy-soft">{t('bikePage.maxReached')}</p>
      ) : (
        <ul className="mt-2 grid grid-cols-5 gap-1.5" aria-label={t('bikePage.selectLevel')}>
          {BIKE_LEVELS.map((n) => {
            const owned = n <= current;
            const open = isLevelAvailable(n, league);
            const on = target === n;
            const lock = unlockLeague(n);
            return (
              <li key={n}>
                <button
                  type="button"
                  disabled={owned || !open}
                  aria-pressed={on}
                  data-level={n}
                  data-state={owned ? 'owned' : open ? 'open' : 'locked'}
                  title={!open && lock ? t('bikePage.unlockIn', { league: t(`league.${lock}`) }) : undefined}
                  onClick={() => onPick(on ? null : n)}
                  className={`flex w-full flex-col items-center rounded-lg border px-1 py-1.5 text-xs font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${on ? 'border-teal bg-teal text-white' : owned ? 'border-line bg-teal-rail text-teal-dark' : open ? 'border-teal/40 bg-card text-navy hover:bg-teal-rail' : 'border-line bg-surface text-navy-muted'}`}
                >
                  <span className="flex items-center gap-1">{!open && <Icon name="lock" className="h-3 w-3" />}{n}</span>
                  <span className="text-2xs font-semibold leading-tight">{owned ? t('bikePage.owned') : open ? t('bikePage.pick') : t('bikePage.locked')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {choices.some((n) => !isLevelAvailable(n, league)) && (
        <p className="mt-1.5 text-2xs text-navy-muted" data-testid="lock-note">
          {t('bikePage.lockNote', { max: maxBikeLevel(league), league: t(`league.${unlockLeague(maxBikeLevel(league) + 1) ?? league}`) })}
        </p>
      )}

      {target != null && (
        <div className="mt-3" data-testid="compare">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="rounded-lg border border-line bg-surface p-2 text-center text-xs font-bold text-navy">{t('bikePage.level', { n: current })}<span className="block text-2xs font-medium text-navy-muted">{t('bikePage.current')}</span></div>
            <span className="text-teal" aria-hidden="true">»</span>
            <div className="rounded-lg border border-teal bg-teal-rail p-2 text-center text-xs font-bold text-teal-dark">{t('bikePage.level', { n: target })}<span className="block text-2xs font-medium text-navy-soft">{t('bikePage.new')}</span></div>
          </div>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {props.map((p) => (
                <tr key={p} className="border-t border-line">
                  <th scope="row" className="py-1 text-left font-medium text-navy-soft">{t(`bikePage.prop.${p}`)}</th>
                  <td className="py-1 text-right tabular-nums text-navy-muted">—</td>
                  <td className="w-6 py-1 text-center text-teal" aria-hidden="true">»</td>
                  <td className="py-1 text-right tabular-nums text-navy-muted">—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-2xs text-navy-muted">{t('bikePage.valuesPending')}</p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-sm">
        <span className="flex items-center gap-1.5 text-navy-soft"><Icon name="euro" className="h-4 w-4 text-teal" />{t('bikePage.upgradePrice')}</span>
        <span className="font-extrabold text-navy" data-testid="price">— €</span>
      </div>
      <button type="button" disabled aria-disabled="true" data-testid="upgrade-cta" className="mt-2 flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-line px-3 py-2.5 text-sm font-bold text-navy-muted">
        <Icon name="bolt" className="h-4 w-4" />{t('bikePage.upgradeCta')}
      </button>
      <p className="mt-1.5 text-2xs text-navy-muted">{t('bikePage.purchaseNote')}</p>
    </div>
  );
}

function ServiceTab({ t, id, component }: { t: ReturnType<typeof makeT>; id: BikeEquipmentId; component: WorkshopComponent }) {
  const stored = BIKE_WEAR_STORED[id];
  return (
    <div data-testid="service-tab">
      <h4 className="text-sm font-extrabold text-navy">{t('bikePage.serviceState')}</h4>
      <div className="mt-2 rounded-lg border border-line bg-surface p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-navy-soft">{t('bikePage.wear')}</span>
          <span className="text-2xl font-extrabold tabular-nums text-navy" data-testid="service-wear">{component.wear == null ? '—' : `${component.wear} %`}</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-teal-rail" aria-hidden="true">
          {component.wear != null && component.status && <div className={`h-full rounded-full ${BAR_TONE[component.status]}`} style={{ width: `${component.wear}%` }} />}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-2xs">
          <span className="text-navy-muted">{t('bikePage.wearScale')}</span>
          {component.status && <span className={`font-bold ${STATUS_TONE[component.status]}`} data-testid="service-status">{t(STATUS_KEY[component.status])}</span>}
        </div>
      </div>
      {!stored && <p className="mt-2 text-xs text-navy-soft" data-testid="no-wear">{t(id === 'frame' ? 'bikePage.frameNoWear' : 'bikePage.noWear')}</p>}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-sm">
        <span className="flex items-center gap-1.5 text-navy-soft"><Icon name="euro" className="h-4 w-4 text-teal" />{t('bikePage.servicePrice')}</span>
        <span className="font-extrabold text-navy">— €</span>
      </div>
      <button type="button" disabled aria-disabled="true" data-testid="service-cta" className="mt-2 flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-line px-3 py-2.5 text-sm font-bold text-navy-muted">
        <Icon name="cog" className="h-4 w-4" />{t('bikePage.serviceCta')}
      </button>
      <p className="mt-1.5 text-2xs text-navy-muted">{t('bikePage.serviceNote')}</p>
    </div>
  );
}
