import { Fragment } from 'react';
import type { T } from '@/i18n/config';
import { flagFromIso2 } from '@/lib/flag';
import type { MsStatus, Zone } from '@/lib/rankings/config';
import type { BuiltTable, Cell, TableRow } from '@/lib/rankings/table';

const ZONE_BG: Record<Zone, string> = { promotion: 'bg-emerald-50', stay: 'bg-card', relegation: 'bg-rose-50' };
const MS_MARK: Record<MsStatus, { glyph: string; cls: string }> = {
  qualifying: { glyph: 'Q', cls: 'border-teal-light bg-teal-rail text-teal-dark' },
  invited: { glyph: '✉', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  confirmed: { glyph: '✓', cls: 'border-emerald-300 bg-emerald-100 text-emerald-700' },
  declined: { glyph: '✕', cls: 'border-rose-300 bg-rose-100 text-rose-700' },
  reserve: { glyph: 'N', cls: 'border-amber-300 bg-amber-100 text-amber-700' },
};

export function Flag({ code, t }: { code: string | null; t: T }) {
  const f = flagFromIso2(code);
  return (
    <span className="inline-flex h-5 w-6 shrink-0 items-center justify-center">
      {f
        ? <span className="text-base leading-none" title={code ?? undefined} aria-label={code ?? undefined}>{f}</span>
        : <span className="inline-block h-3 w-4 rounded-sm border border-line bg-surface" title={t('lt.noCountry')} aria-label={t('lt.noCountry')} />}
    </span>
  );
}

export function MsMark({ status, t }: { status: MsStatus | null; t: T }) {
  if (!status) return <span className="text-navy-muted" title={t('lt.ms.none')}>—</span>;
  const m = MS_MARK[status];
  return <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-2xs font-bold ${m.cls}`} title={t(`lt.ms.${status}`)} aria-label={t(`lt.ms.${status}`)}>{m.glyph}</span>;
}

const fmt = (c: Cell) => (c === null ? '—' : String(c));
const SEP = 'border-l border-line/80';

/**
 * Season table of one sub-league. Tours and stages come from the table shape
 * (league rules), so higher leagues extend it automatically. #, flag and name
 * stay sticky while the rest scrolls horizontally (the same table on mobile).
 * "—" = not raced yet, "0" = raced without points.
 */
export function LeagueTable({ table, t }: { table: BuiltTable; t: T }) {
  const { tours, stagesPerTour, rows } = table;
  const stageCols = Array.from({ length: stagesPerTour }, (_, i) => i + 1);
  const head = 'bg-surface text-2xs font-semibold uppercase tracking-wide text-navy-muted';

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card" data-league-table>
      <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead>
          <tr>
            <th rowSpan={2} style={{ left: 0 }} className={`sticky z-20 w-9 min-w-9 border-b border-line px-1.5 text-center ${head}`}>#</th>
            <th rowSpan={2} className={`sticky z-20 w-8 min-w-8 border-b border-line px-0 ${head}`} style={{ left: 36 }} aria-label="flag" />
            <th rowSpan={2} className={`sticky z-20 min-w-[110px] sm:min-w-[150px] border-b border-r border-line px-2 text-left ${head}`} style={{ left: 68 }}>{t('lt.colManager')}</th>
            {Array.from({ length: tours }, (_, ti) => (
              <th key={ti} colSpan={stagesPerTour + 1} className={`border-b border-line px-2 py-1 text-center ${head} ${SEP}`}>{t('lt.tourN', { n: ti + 1 })}</th>
            ))}
            <th rowSpan={2} className={`border-b border-line px-3 text-center ${head} ${SEP}`}>{t('lt.colTotal')}</th>
            <th rowSpan={2} className={`w-10 border-b border-line px-1 text-center ${head} ${SEP}`}>{t('lt.colMs')}</th>
          </tr>
          <tr>
            {Array.from({ length: tours }, (_, ti) => (
              <Fragment key={ti}>
                {stageCols.map((s, si) => (
                  <th key={`${ti}-${s}`} className={`border-b border-line px-1.5 py-1 text-center ${head} ${si === 0 ? SEP : ''}`}>{t('lt.stageShort', { n: s })}</th>
                ))}
                <th className={`border-b border-line px-1.5 py-1 text-center ${head}`}>Σ</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <Row key={r.manager.managerId} r={r} tours={tours} stages={stagesPerTour} t={t} />)}
        </tbody>
      </table>
    </div>
  );
}

function Row({ r, tours, stages, t }: { r: TableRow; tours: number; stages: number; t: T }) {
  const me = r.manager.isMe;
  const bg = me ? 'bg-teal-rail' : r.zone ? ZONE_BG[r.zone] : 'bg-card';
  const cell = 'border-b border-line/60 px-1.5 py-1.5 text-center';
  return (
    <tr data-me={me || undefined} data-zone={r.zone ?? undefined} className={bg}>
      <td className={`sticky z-10 w-9 min-w-9 ${bg} ${cell} font-semibold text-navy-soft ${me ? 'border-l-2 border-l-teal' : ''}`} style={{ left: 0 }}>{r.position ?? '—'}</td>
      <td className={`sticky z-10 w-8 min-w-8 ${bg} border-b border-line/60 px-0 text-center`} style={{ left: 36 }}><Flag code={r.manager.countryCode} t={t} /></td>
      <td className={`sticky z-10 min-w-[110px] max-w-[130px] sm:min-w-[150px] sm:max-w-[200px] truncate ${bg} border-b border-r border-line/60 px-2 py-1.5 text-left ${me ? 'font-extrabold text-navy' : 'font-semibold text-navy'}`} style={{ left: 68 }}>
        {r.manager.displayName ?? '—'}
      </td>
      {Array.from({ length: tours }, (_, ti) => (
        <Fragment key={ti}>
          {Array.from({ length: stages }, (_, si) => (
            <td key={`${ti}-${si}`} className={`${cell} ${si === 0 ? SEP : ''} ${r.cells[ti][si] === null ? 'text-navy-muted' : 'text-navy'}`}>{fmt(r.cells[ti][si])}</td>
          ))}
          <td className={`${cell} font-semibold ${r.tourTotals[ti] === null ? 'text-navy-muted' : 'text-navy'}`}>{fmt(r.tourTotals[ti])}</td>
        </Fragment>
      ))}
      <td className={`${cell} ${SEP} text-base font-extrabold text-navy`}>{r.total}</td>
      <td className={`${cell} ${SEP}`}><MsMark status={r.manager.ms} t={t} /></td>
    </tr>
  );
}

export function LeagueLegend({ table, t }: { table: BuiltTable; t: T }) {
  const zones = table.rows.some((r) => r.zone !== null);
  const sw = (c: string) => <span className={`inline-block h-3 w-3 rounded-sm border border-line ${c}`} />;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs font-medium text-navy-soft">
      {zones && <>
        <span className="inline-flex items-center gap-1">{sw('bg-emerald-100')}{t('lt.legendPromotion')}</span>
        <span className="inline-flex items-center gap-1">{sw('bg-card')}{t('lt.legendStay')}</span>
        <span className="inline-flex items-center gap-1">{sw('bg-rose-100')}{t('lt.legendRelegation')}</span>
      </>}
      <span className="inline-flex items-center gap-1">{sw('bg-teal-rail border-l-2 border-l-teal')}{t('lt.you')}</span>
      <span>{t('lt.legendNotRaced')}</span>
      <span>{t('lt.legendZero')}</span>
      <span className="basis-full text-navy-muted">{t('lt.msNote')}</span>
    </div>
  );
}
