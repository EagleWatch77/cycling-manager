import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerDictionary } from '@/i18n/server';
import { getMarketRiderDetail } from '@/lib/market/playerRepository';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import type { SkillAttribute } from '@/lib/rider/config';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { archetypeIcon } from '@/lib/rider/archetypeIcon';

const TACTICS: SkillAttribute[] = ['positioning', 'attackTiming', 'reaction', 'energyManagement', 'breakawaySkill'];
const TECHNIQUE: SkillAttribute[] = ['descending', 'bikeHandling', 'cornering', 'packRiding', 'wetHandling', 'roughSurface'];

const FLAGS: Record<string, string> = {
  SK: '🇸🇰', CZ: '🇨🇿', PL: '🇵🇱', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', NL: '🇳🇱',
  DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', AU: '🇦🇺', CO: '🇨🇴', DK: '🇩🇰', NO: '🇳🇴', SI: '🇸🇮',
};

/**
 * Read-only market rider detail — same safe DTO as the list
 * (lib/market/playerRepository.ts): real Performance/Tactics/Technique
 * numbers (a player already sees these on their own rider), never raw
 * potential/trainability/professionalism/recovery. If this id belongs to a
 * Premium-tier rider and the visitor isn't entitled, getMarketRiderDetail()
 * returns null (RLS hides the row) — rendered as a plain 404, not an error
 * that would confirm a Premium rider exists at this id.
 */
export default async function MarketRiderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = await getServerDictionary();
  const { id } = await params;
  const rider = await getMarketRiderDetail(id);
  if (!rider) notFound();

  return (
    <AppShell activeId="transfers" locale={locale}>
      <div className="space-y-3">
        <Link href="/transfers" className="text-2xs font-semibold text-teal hover:underline">← {t('market.backToMarket')}</Link>

        <Card dense>
          <div className="flex flex-wrap items-center gap-4 p-4">
            <RiderAvatar seed={rider.id} size="lg" className="rounded-2xl" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight text-navy">
                {FLAGS[rider.countryIso2] ?? '🏳️'} {rider.firstName} {rider.surname}
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-navy-soft">
                <Icon name={archetypeIcon(rider.archetype)} className="h-3.5 w-3.5 text-teal" />
                {t(`style.${rider.archetype}`)} · {rider.age} {t('rider.age').toLowerCase()} · {rider.countryName}
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-lg text-teal" aria-label={`${rider.potentialStars}/5`}>
                {'★'.repeat(rider.potentialStars)}
                <span className="text-line">{'★'.repeat(5 - rider.potentialStars)}</span>
              </p>
              {rider.tier === 'premium' && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-warn/10 px-2 py-0.5 text-2xs font-bold uppercase text-warn">
                  <Icon name="crown" className="h-3 w-3" /> Premium
                </span>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-12 gap-3">
          <AttributeGroup t={t} titleKey="group.performance" icon="chart" keys={PERFORMANCE_FOCUS} attributes={rider.attributes}
            showStatIcons statIconSize={24} showBars={false} className="col-span-12 lg:col-span-4" />
          <AttributeGroup t={t} titleKey="group.tactics" icon="bolt" keys={TACTICS} attributes={rider.attributes}
            showBars={false} className="col-span-12 lg:col-span-4" />
          <AttributeGroup t={t} titleKey="group.technique" icon="wheel" keys={TECHNIQUE} attributes={rider.attributes}
            showBars={false} className="col-span-12 lg:col-span-4" />
        </div>
      </div>
    </AppShell>
  );
}
