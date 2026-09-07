import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerDictionary } from '@/i18n/server';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getPublicRiderStats } from '@/lib/ranking/repository';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { RiderAvatar } from '@/components/rider/RiderAvatar';

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-line bg-card px-3.5 py-2.5 text-center shadow-card">
      <p className="text-lg font-bold tabular-nums text-navy">{value}</p>
      <p className="mt-0.5 text-2xs uppercase tracking-wide text-navy-muted">{label}</p>
    </div>
  );
}

/**
 * Public "profil jazdca" a Rankings row links to — read-only, real-data
 * only, sourced entirely from the same leak-proof rider_rankings view the
 * ranking table itself reads (see lib/ranking/repository.ts). Deliberately
 * NOT the same route as /rider (that route is always "my own rider" and
 * relies on riders_select_own RLS, which does not permit reading another
 * player's row at all — see the chat report).
 */
export default async function PublicRiderProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = await getServerDictionary();
  const { id } = await params;
  const season = getCurrentSeasonInfo();
  const rider = await getPublicRiderStats(id, season.seasonId);
  if (!rider) notFound();

  return (
    <AppShell activeId="rankings" locale={locale}>
      <div className="space-y-3">
        <Link href="/rankings" className="text-2xs font-semibold text-teal hover:underline">← {t('ranking.tabRiders')}</Link>

        <Card dense>
          <div className="flex flex-wrap items-center gap-4 p-4">
            <RiderAvatar seed={rider.riderId} size="lg" className="rounded-2xl" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight text-navy">
                {FLAGS[rider.countryIso2] ?? '🏳️'} {rider.firstName} {rider.surname}
              </h1>
              <p className="mt-0.5 text-sm text-navy-soft">
                {t('rider.age')} {rider.age} · {rider.countryName}
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label={t('ranking.colPoints')} value={rider.points.toLocaleString()} />
          <Stat label={t('ranking.wins')} value={rider.wins} />
          <Stat label={t('ranking.podiums')} value={rider.podiums} />
          <Stat label={t('ranking.races')} value={rider.races} />
          <Stat label={t('ranking.bestPosition')} value={`#${rider.bestPosition}`} />
        </div>
      </div>
    </AppShell>
  );
}
