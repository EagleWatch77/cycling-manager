import type { ReactNode } from 'react';

/**
 * The single card shell for the dashboard. Every panel uses it so borders,
 * radius and shadow stay identical across the grid.
 */
export function Card({
  title, action, children, className = '', dense = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section
      className={`flex flex-col rounded-card border border-line bg-card shadow-card ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
          <h2 className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={dense ? 'flex-1' : 'flex-1 p-3.5'}>{children}</div>
    </section>
  );
}

/** Footer link used at the bottom of several cards. */
export function CardLink({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-1 border-t border-line px-3.5 py-2 text-left text-xs font-medium text-teal transition-colors hover:bg-teal-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
    >
      {label}
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
