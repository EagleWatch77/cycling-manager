import type { T } from '@/i18n/config';
import { EmptyState } from './ui/EmptyState';
import { SectionCard } from './ui/SectionCard';

export interface ManagerTask {
  id: string;
  text: string;
  href: string;
}

/**
 * Manager tasks: reminders derived only from real state that already exists
 * (e.g. no training planned for the next week, free Tour slots). There is no
 * separate task system behind this; with nothing to do it shows an empty
 * state, never a placeholder task.
 */
export function ManagerTasksCard({ t, tasks, className = '' }: { t: T; tasks: ManagerTask[]; className?: string }) {
  return (
    <SectionCard icon="bell" title={t('dashboard.tasksTitle')} className={className}>
      {tasks.length === 0 ? (
        <EmptyState compact icon="bell" text={t('dashboard.tasksEmpty')} />
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((task) => (
            <li key={task.id}>
              <a
                href={task.href}
                className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-medium text-navy transition-colors hover:bg-teal-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                <span>{task.text}</span>
                <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 text-teal" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
