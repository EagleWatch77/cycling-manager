import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerDictionary } from '@/i18n/server';
import { getMarketRiderDetail, getMarketRiderEstimates } from '@/lib/market/playerRepository';
import { PERFORMANCE_FOCUS } from '@/lib/training/config';
import { TACTICS_ATTRIBUTES, TECHNIQUE_ATTRIBUTES } from '@/lib/rider/config';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { AttributeGroup } from '@/components/rider/AttributeGroup';
import { archetypeIcon } from '@/lib/rider/archetypeIcon';
import { getMyPendingSwap, isSwapEnabled } from '@/lib/market/swap';
import { BuyRiderButton } from '@/components/market/BuyRiderButton';
import { PendingSwapRows } from '@/components/rider/PendingSwapRows';
import { CardTitle } from '@/components/ui/CardTitle';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { AbilityRadar } from '@/components/rider/AbilityRadar';
import { MarketDevelopmentCard } from '@/components/market/MarketDevelopmentCard';
import { buildMarketRadarModel } from '@/lib/rider/radar';

// TACTICS_ATTRIBUTES/TECHNIQUE_ATTRIBUTES now come from lib/rider/config.ts (previously duplicated locally here).

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
  // Rough 1-5 levels only (database function market_rider_estimates + public Experience bucket); no hidden or exact number reaches this page.
  const levels = await getMarketRiderEstimates(rider);
  const [enabled, pendingSwap] = await Promise.all([isSwapEnabled(), getMyPendingSwap()]);

  return (
    <AppShell activeId="transfers" locale={locale}>
      <div className="space-y-3">
        <Link href="/transfers" className="text-2xs font-semibold text-teal hover:underline">← {t('market.backToMarket')}</Link>

        {/* A. Profil jazdca */}
        <Card dense>
          <div className="flex flex-wrap items-center gap-4 p-4">
            <RiderAvatar seed={rider.id} size="lg" className="rounded-2xl" />
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2.5 text-page text-navy">
                <CountryFlag iso2={rider.countryIso2} name={rider.countryName} className="h-[20px] w-[30px]" />
                <span>{rider.firstName} {rider.surname}</span>
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-navy-soft">
                <Icon name={archetypeIcon(rider.archetype)} className="h-3.5 w-3.5 text-teal" />
                {t(`style.${rider.archetype}`)} · {rider.age} {t('rider.age').toLowerCase()} · {rider.countryName}
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-lg text-teal" aria-label={`${t('dev.potential')} ${rider.potentialStars}/5`}>
                <span className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{t('dev.potential')}</span>
                <span>
                  {'★'.repeat(rider.potentialStars)}
                  <span className="text-line">{'★'.repeat(5 - rider.potentialStars)}</span>
                </span>
              </p>
              {rider.tier === 'premium' && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-warn/10 px-2 py-0.5 text-2xs font-bold uppercase text-warn">
                  <Icon name="crown" className="h-3 w-3" /> Premium
                </span>
              )}
            </div>
            <div className="flex flex-col items-center rounded-xl bg-navy px-6 py-3 text-white shadow-card">
              <span className="text-2xs font-semibold uppercase tracking-wide text-teal-light">{t('rating.overall')}</span>
              <span className="text-5xl font-extrabold leading-none tabular-nums">{rider.overallRating}</span>
            </div>
          </div>
          {enabled && !pendingSwap && (
            <div className="border-t border-line px-4 pb-4">
              <BuyRiderButton marketRiderId={rider.id} label={t('market.buy')} note={t('market.buyNote')}
                errors={{ swapPending: t('market.buyError.swapPending'), notAvailable: t('market.buyError.notAvailable'),
                  notEligible: t('market.buyError.notEligible'), generic: t('market.buyError.generic') }} />
            </div>
          )}
        </Card>

        {pendingSwap && (
          <Card title={<CardTitle icon="calendar">{t('swap.planned')}</CardTitle>} dense>
            <PendingSwapRows t={t} swap={pendingSwap} />
          </Card>
        )}

        {/* B. Radar + F. Rozvoj + G. Stav jazdca. Only what a market rider's public columns allow: star buckets, never raw hidden values. */}
        <div className="grid grid-cols-12 gap-3">
          <AbilityRadar title={t('profile.radarTitle')} className="col-span-12 lg:col-span-7"
            model={buildMarketRadarModel(rider.attributes, levels, t)}
            labels={{
              overview: t('radar.overview'), estimate: t('radar.estimate'), unknown: t('radar.unknown'),
              note: t('radar.devNote'), noteUnknown: t('radar.devNoteUnknown'), aria: t('radar.aria'),
            }} />
          <div className="col-span-12 flex flex-col gap-3 lg:col-span-5">
            <MarketDevelopmentCard t={t} levels={levels} />
            <Card title={<CardTitle icon="heart">{t('market.detail.state')}</CardTitle>} dense>
              <p className="px-3.5 py-3 text-sm text-navy-soft">{t('market.detail.stateAfter')}</p>
            </Card>
          </div>
        </div>

        {/* C-E. Výkon, Taktika, Technika */}
        <div className="grid grid-cols-12 gap-3">
          <AttributeGroup t={t} titleKey="group.performance" icon="chart" keys={PERFORMANCE_FOCUS} attributes={rider.attributes}
            showStatIcons statIconSize={24} showBars={false} className="col-span-12 lg:col-span-4" />
          <AttributeGroup t={t} titleKey="group.tactics" icon="bolt" keys={TACTICS_ATTRIBUTES} attributes={rider.attributes}
            showBars={false} className="col-span-12 lg:col-span-4" />
          <AttributeGroup t={t} titleKey="group.technique" icon="wheel" keys={TECHNIQUE_ATTRIBUTES} attributes={rider.attributes}
            showBars={false} className="col-span-12 lg:col-span-4" />
        </div>

        {/* H. Kontrakt a ponuka. Only real rules are shown: the 10-game-week contract length (owner rule 2026-11-16). Salary and bonuses do not
            exist in the game yet (no column, no rule) - shown as "not available", never a made-up number. The offer form is NOT built: there is
            no backend to receive it, so no input and no dead button (see docs/DECISIONS.md C-100). */}
        <section className="overflow-hidden rounded-card border border-navy bg-navy text-white shadow-card">
          <header className="flex items-center gap-2 border-b border-white/15 px-4 py-2.5">
            <Icon name="coin" className="h-4 w-4 text-teal-light" />
            <h2 className="text-window uppercase tracking-wide text-teal-light">{t('market.detail.contract')}</h2>
          </header>
          <dl className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-3">
            {[
              [t('market.detail.salary'), t('market.detail.notAvailable')],
              [t('market.detail.bonuses'), t('market.detail.notAvailable')],
              [t('market.detail.length'), t('market.detail.lengthValue', { weeks: 10 })],
            ].map(([label, value]) => (
              <div key={label} className="bg-navy px-4 py-3">
                <dt className="text-2xs font-semibold uppercase tracking-wide text-white/60">{label}</dt>
                <dd className="mt-0.5 text-base font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <Card title={<CardTitle icon="coin">{t('market.detail.offer')}</CardTitle>} dense>
          <p className="px-3.5 py-3 text-sm text-navy-soft">{t('market.detail.offerSoon')}</p>
        </Card>
      </div>
    </AppShell>
  );
}
