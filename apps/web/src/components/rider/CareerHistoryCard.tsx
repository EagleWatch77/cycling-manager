import type { T } from '@/i18n/config';
import type { CareerEventView } from '@/lib/contract/repository';
import { divisionCode } from '@/lib/league/divisions';
import { Card } from '../ui/Card';
import { CardTitle } from '../ui/CardTitle';

/**
 * Jazdec → História: the rider's career timeline, oldest first. Only real
 * stored events; the league shown is the one recorded AT THE MOMENT (it
 * never follows the manager's later promotion/relegation). Empty => one
 * quiet line. The history exists only while the rider does.
 */
function leagueLabel(t: T, e: CareerEventView): string | null {
  if (!e.league) return null;
  return e.divisionNumber ? `${t(`league.${e.league}`)} ${divisionCode(e.divisionNumber)}` : t(`league.${e.league}`);
}

export function CareerHistoryCard({ t, events, className = '' }: { t: T; events: CareerEventView[]; className?: string }) {
  // Group events of the same game week under one heading.
  const groups: { key: string; season: number; week: number; items: CareerEventView[] }[] = [];
  for (const e of events) {
    const key = `${e.season}-${e.week}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, season: e.season, week: e.week, items: [e] });
  }
  return (
    <Card title={<CardTitle icon="calendar">{t('profile.history')}</CardTitle>} dense className={className}>
      {groups.length === 0 ? (
        <p className="px-3.5 py-3 text-sm text-navy-soft">{t('profile.historyEmpty')}</p>
      ) : (
        <ol className="px-3.5 py-2">
          {groups.map((g) => (
            <li key={g.key} className="relative border-l border-line pb-3 pl-4 last:pb-0">
              <span className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full bg-teal" aria-hidden="true" />
              <p className="text-xs font-semibold tabular-nums text-teal-dark">{t('contract.seasonWeek', { season: g.season, week: g.week })}</p>
              <ul className="mt-1 space-y-1.5">
                {g.items.map((e) => {
                  const league = e.type === 'career_start' ? leagueLabel(t, e) : null;
                  return (
                    <li key={e.id}>
                      <p className="text-[15px] text-navy">{t(e.type === 'career_start' ? 'history.careerStart' : e.type === 'contract_ended' ? 'history.contractEnd' : 'history.contractStart')}</p>
                      {league && <p className="text-xs leading-snug text-navy-soft">{t('history.purchasedInto', { league })}</p>}
                      {e.type === 'contract_signed' && e.durationWeeks != null && (
                        <p className="text-xs leading-snug text-navy-soft">{t('history.contractDuration', { weeks: e.durationWeeks })}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
