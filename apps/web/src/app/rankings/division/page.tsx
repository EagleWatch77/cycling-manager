import { getServerDictionary } from '@/i18n/server';
import { ensureMyDivision, getMyDivisionMembers } from '@/lib/league/repository';
import { divisionCode } from '@/lib/league/divisions';
import { getMyRider } from '@/lib/rider/repository';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import type { DivisionMember } from '@/lib/league/repository';

/**
 * Moja podliga — the player's own sub-league and its real members. There is
 * no scoring yet, so this lists members only (joined order) with an explicit
 * "standings not available yet" note; no points, ranks or results are shown.
 */
export default async function DivisionRankingsPage() {
  const { t } = await getServerDictionary();
  const [division, members, myRider] = await Promise.all([ensureMyDivision(), getMyDivisionMembers(), getMyRider()]);

  if (!division) {
    return (
      <Card dense>
        <EmptyState icon="trophy" text={t('ranking.divisionNone')} />
      </Card>
    );
  }

  const label = `${t(`league.${division.league}`)} ${divisionCode(division.number)}`;
  const columns: DataTableColumn<DivisionMember>[] = [
    {
      header: t('ranking.colRider'),
      render: (m) => (
        <span className="flex items-center gap-2 font-semibold text-navy">
          <RiderAvatar seed={m.riderId} size="sm" />
          {m.firstName} {m.surname}
          {m.riderId === myRider?.id && <StatusBadge label={t('ranking.you')} tone="teal" />}
        </span>
      ),
    },
    { header: t('ranking.colCountry'), render: (m) => <span className="text-navy-soft">{m.countryIso2}</span> },
    { header: t('ranking.colAge'), align: 'right', render: (m) => <span className="tabular-nums text-navy-soft">{m.age}</span> },
  ];

  return (
    <div className="space-y-3">
      <Card dense>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3">
          <div>
            <p className="text-lg font-bold text-navy">{label}</p>
            <p className="text-2xs text-navy-muted">{t('ranking.divisionEqual')}</p>
          </div>
          <span className="rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold text-navy-soft">
            {t('ranking.divisionMembers', { n: division.memberCount, max: division.capacity })}
          </span>
        </div>
        <p className="border-t border-line px-3.5 py-2 text-xs text-navy-soft">{t('ranking.divisionNoRank')}</p>
      </Card>

      <DataTable columns={columns} rows={members} rowKey={(m) => m.riderId} emptyText={t('ranking.divisionNone')} />
    </div>
  );
}
