import type { T } from '@/i18n/config';
import type { DanubeStage } from '@/data/danube';
import { SCORING, slash } from '@/data/scoring';

/**
 * Always-visible scoring summary under a stage profile. Reads the shared
 * SCORING rules — no per-stage point tables. Shows only the checkpoint types
 * that actually occur on this stage (a flat stage has no KOM row).
 */
export function StageScoring({ t, stage }: { t: T; stage: DanubeStage }) {
  const hasSprint = stage.markers.some((m) => m.kind === 'sprint');
  const komCats = [...new Set(
    stage.markers.filter((m) => m.kind === 'kom').map((m) => m.category as 1 | 2 | 3),
  )].sort();

  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs">
      <Item label={t('score.finish')} accent="#12283d">
        {slash(SCORING.stageFinishPoints)} {t('score.points')}
        <span className="text-navy-muted"> · +{slash(SCORING.stageFinishBonusSec)}{t('score.sec')}</span>
      </Item>

      {hasSprint && (
        <Item label={t('score.sprint')} accent="#16a34a">
          {slash(SCORING.intermediateSprint.points)} {t('score.points')}
          <span className="text-navy-muted"> · +{slash(SCORING.intermediateSprint.gcBonusSec)}{t('score.sec')}</span>
        </Item>
      )}

      {komCats.map((c) => (
        <Item key={c} label={`${t('score.kom')} ${t('score.cat')}${c}`} accent="#dc2626">
          {slash(SCORING.kom[c])} {t('score.points')}
        </Item>
      ))}
    </div>
  );
}

function Item({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="h-2 w-2 shrink-0 translate-y-px rounded-full" style={{ background: accent }} />
      <span className="text-navy-muted">{label}:</span>
      <span className="font-semibold text-navy">{children}</span>
    </span>
  );
}
