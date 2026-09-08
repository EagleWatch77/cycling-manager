import type { ReactNode } from 'react';
import { getServerDictionary } from '@/i18n/server';
import { getMyRider } from '@/lib/rider/repository';
import { ensureSeasonTransitionsProcessed } from '@/lib/calendar/seasonAging';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { RiderProfileHeader } from '@/components/rider/RiderProfileHeader';
import { RiderProfileTabs } from '@/components/rider/RiderProfileTabs';

/**
 * Shared shell for the whole /rider/* profile (Prehľad/Tréning/Kontrakt/
 * História) — the header and tab bar render exactly once here, not per
 * route, so no page duplicates the rider's identity.
 *
 * Ownership: getMyRider() scopes to auth.uid() via RLS (riders_select_own),
 * exactly like every other player-facing rider read in this app — there is
 * no rider :id in the URL to guard, because a player only ever has their
 * own single rider today (UNIQUE(player_id) in the DB). If per-rider ids
 * are introduced later (a real roster), this layout is the one place that
 * ownership check needs to grow.
 */
export default async function RiderLayout({ children }: { children: ReactNode }) {
  const { t, locale } = await getServerDictionary();
  // Season Aging V1 (see lib/calendar/seasonAging.ts) — global, not scoped
  // to this player's own rider, so it runs before the rider read below
  // regardless of whether this player has a rider yet. Idempotent: a no-op
  // on every request except the very first one after a season boundary.
  await ensureSeasonTransitionsProcessed();
  const rider = await getMyRider();

  if (!rider) {
    return (
      <AppShell activeId="rider" locale={locale}>
        <Card className="col-span-12">
          <p className="text-sm text-navy-soft">{t('profile.noRider')}</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell activeId="rider" locale={locale}>
      <div className="space-y-3">
        <RiderProfileHeader t={t} rider={rider} />
        <RiderProfileTabs labels={{
          overview: t('profile.overview'),
          training: t('profile.training'),
          contract: t('profile.contract'),
          history: t('profile.history'),
        }} />
        {children}
      </div>
    </AppShell>
  );
}
