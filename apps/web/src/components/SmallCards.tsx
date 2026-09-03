import type { T } from '@/i18n/config';
import type { Player } from '@/mock/dashboard';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { ProgressBar } from './ui/ProgressBar';

/** Next scheduled training session. */
export function NextTrainingCard({
  t, training,
}: {
  t: T;
  training: { name: string; scheduled: string; load: number };
}) {
  return (
    <Card title={t('training.title')} dense className="col-span-12 sm:col-span-6 lg:col-span-4">
      <div className="flex items-center gap-3 p-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
          <Icon name="chart" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy">{training.name}</p>
          <p className="text-2xs text-navy-muted">
            {t('training.scheduled')}: {training.scheduled}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-2xs text-navy-muted">{t('training.load')}</span>
            <ProgressBar value={training.load} className="flex-1" />
            <span className="text-2xs font-bold tabular-nums text-navy">{training.load}%</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Season position. Uses only values the game already tracks. */
export function SeasonPositionCard({ t, player }: { t: T; player: Player }) {
  return (
    <Card title={t('season.title')} dense className="col-span-12 sm:col-span-6 lg:col-span-4">
      <div className="flex items-center gap-4 p-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy text-white">
          <Icon name="trophy" className="h-6 w-6" />
        </span>
        <div className="flex flex-1 items-end gap-5">
          <span>
            <span className="block text-2xs text-navy-muted">{t('season.rank')}</span>
            <span className="text-xl font-bold leading-none text-navy">
              {player.seasonRank}
              <span className="text-xs font-medium text-navy-muted">
                {' '}{t('common.of')} {player.seasonFieldSize}
              </span>
            </span>
          </span>
          <span className="border-l border-line pl-5">
            <span className="block text-2xs text-navy-muted">{t('season.points')}</span>
            <span className="text-xl font-bold leading-none text-navy">{player.seasonPoints}</span>
          </span>
        </div>
      </div>
    </Card>
  );
}
