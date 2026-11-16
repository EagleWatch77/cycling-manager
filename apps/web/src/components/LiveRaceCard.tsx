import type { T } from '@/i18n/config';

/**
 * "Preteky naživo": wide, low window. Live races are not implemented yet, so
 * it shows only the title and a neutral dash - no fake race, no Sledovať
 * button. Later it will hold the Tour + stage, a small stage profile, km to
 * go, the race situation and a watch action.
 */
export function LiveRaceCard({ t, className = '' }: { t: T; className?: string }) {
  return (
    <section className={`flex items-stretch overflow-hidden rounded-card border border-line bg-card shadow-card ${className}`}>
      <div className="flex items-center gap-2 border-r border-teal-light bg-teal-rail px-3.5 py-3">
        <span className="h-2 w-2 rounded-full bg-navy-muted/40" aria-hidden="true" />
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-teal-dark">{t('live.title')}</h2>
      </div>
      <p data-empty="true" className="flex items-center px-3.5 text-sm font-semibold text-navy-muted" aria-label="—">—</p>
    </section>
  );
}
