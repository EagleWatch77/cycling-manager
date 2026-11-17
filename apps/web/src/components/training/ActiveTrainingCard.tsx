import type { ActiveWeek } from '@/lib/training/activeWeek';

export interface ActiveTrainingLabels {
  title: string; raceWeek: string; noPlan: string; legacy: string; mode: string; modeFull: string; modeBasic: string; done: string; next: string; planned: string;
  progress: string; evaluation: string; locked: string; sessionTime: string;
}

/** The manager's confirmed plan for the CURRENT week (visible after the Monday 18:00 UTC deadline too): plan, mode and the state of each training day. */
export function ActiveTrainingCard({ week, planName, dayLabels, labels: L }: { week: ActiveWeek; planName: string | null; dayLabels: readonly string[]; labels: ActiveTrainingLabels }) {
  if (week.kind === 'race-week') return <p className="text-sm text-navy-soft">{L.raceWeek}</p>;
  if (week.kind === 'no-plan') return <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm font-medium text-warn">{L.noPlan}</p>;
  if (week.kind === 'legacy-plan') return <p className="text-sm text-navy-soft">{L.legacy}</p>;
  const status = { done: L.done, next: L.next, planned: L.planned };
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-navy">{planName} · {week.mode === 'full' ? L.modeFull : L.modeBasic}</p>
      <p className="text-2xs text-navy-muted">{L.locked}</p>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {week.sessions.map((s) => (
          <li key={s.day} className={`rounded-lg border px-3 py-2 text-sm ${s.status === 'done' ? 'border-teal bg-teal-rail text-teal-dark' : s.status === 'next' ? 'border-teal bg-card text-navy' : 'border-line bg-surface text-navy-muted'}`}>
            <span className="block font-bold">{dayLabels[s.day]} · {L.sessionTime}</span>
            <span className="block text-2xs font-semibold uppercase">{status[s.status]}</span>
          </li>
        ))}
      </ul>
      <p className="text-2xs text-navy-muted">{L.progress}: {week.done} / {week.total} · {L.evaluation}</p>
    </div>
  );
}
