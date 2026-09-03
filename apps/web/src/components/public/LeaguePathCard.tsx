import Image from 'next/image';
import type { T } from '@/i18n/config';
import { LOCALES } from '@/i18n/config';

/**
 * The five leagues a player moves through, in order. The first is marked as
 * the starting point because every new account begins in Rookie.
 */
const PATH = ['rookie', 'amateur', 'continental', 'pro', 'elite'] as const;

export function LeaguePathCard({ t }: { t: T }) {
  void LOCALES;
  return (
    <section className="rounded-card border border-line bg-card p-3">
      <h2 className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">
        {t('path.title')}
      </h2>
      <ol className="mt-2.5 flex items-start justify-between gap-1">
        {PATH.map((id, i) => (
          <li key={id} className="flex flex-1 items-start gap-1">
            <div className="flex min-w-0 flex-1 flex-col items-center text-center">
              <Image
                src={`/leagues/${id}.webp`}
                alt=""
                aria-hidden="true"
                width={40}
                height={40}
                className="h-9 w-9 object-contain"
              />
              <span className="mt-1 truncate text-2xs font-semibold text-navy">
                {t(`league.${id}`)}
              </span>
              {i === 0 && (
                <span className="text-[9px] leading-tight text-teal">{t('path.startHere')}</span>
              )}
            </div>
            {i < PATH.length - 1 && (
              <svg viewBox="0 0 24 24" aria-hidden="true"
                className="mt-4 h-3 w-3 shrink-0 text-navy-muted/50"
                fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
