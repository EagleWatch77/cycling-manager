import type { ReactNode } from 'react';
import type { Locale, T } from '@/i18n/config';
import { fullDate } from '@/lib/format';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { rejectSponsorOfferAction } from '@/app/sponsors/actions';
import {
  GOALS, severanceCents, signBlock, slotsFull, timeLeft, weeksLeft,
  type SponsorContract, type SponsorGoal, type SponsorKind, type SponsorOffer,
} from '@/lib/sponsors/rules';
import type { LeagueId } from '@/lib/leagues';

/** Money in cents -> text. null (not yet approved/determined) is NEVER turned into a number. */
function moneyText(cents: number | null, locale: Locale, t: T): string {
  if (cents === null) return t('sp.tbd');
  return new Intl.NumberFormat(locale === 'sk' ? 'sk-SK' : 'en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(cents / 100);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs uppercase tracking-wide text-navy-muted">{label}</dt>
      <dd className="text-sm font-semibold text-navy">{children}</dd>
    </div>
  );
}

function GoalRow({ goal, label, locale, t }: { goal: SponsorGoal; label: string; locale: Locale; t: T }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <p className="text-2xs uppercase tracking-wide text-navy-muted">{label}</p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm font-semibold text-navy">{t(`sp.goal.${goal.type}`)}</p>
        <p className="text-xs text-navy-soft">
          {t('sp.bonus')}: <span className={`font-semibold tabular-nums ${goal.bonusCents === null ? 'text-navy-muted' : 'text-navy'}`}>{moneyText(goal.bonusCents, locale, t)}</span>
        </p>
      </div>
    </div>
  );
}

function Goals({ goals, locale, t }: { goals: SponsorContract['goals']; locale: Locale; t: T }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <GoalRow goal={goals[0]} label={t('sp.goal.easy')} locale={locale} t={t} />
      <GoalRow goal={goals[1]} label={t('sp.goal.hard')} locale={locale} t={t} />
    </div>
  );
}

/** "Detail" without client JavaScript: a native <details> disclosure. */
function Detail({ t, children }: { t: T; children: ReactNode }) {
  return (
    <details className="group w-full">
      <summary className="inline-flex cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-card px-4 py-2 text-sm font-semibold text-navy transition-colors hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal [&::-webkit-details-marker]:hidden">
        {t('sp.btn.detail')}
      </summary>
      <div className="mt-3 space-y-2 rounded-lg bg-teal-rail p-3 text-xs text-navy-soft">{children}</div>
    </details>
  );
}

function DisabledButton({ children, reason }: { children: ReactNode; reason: string }) {
  return (
    <button type="button" disabled aria-disabled="true" title={reason}
      className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white opacity-40">
      {children}
    </button>
  );
}

const kindLabel = (kind: SponsorKind, t: T) => t(kind === 'main' ? 'sp.type.main' : 'sp.type.secondary');

function Badges({ isDemo, kind, t }: { isDemo: boolean; kind: SponsorKind; t: T }) {
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {isDemo && <StatusBadge label={t('sp.demo.badge')} tone="warn" />}
      <StatusBadge label={kindLabel(kind, t)} tone={kind === 'main' ? 'teal' : 'gray'} />
    </span>
  );
}

function GoalNotes({ goals, t }: { goals: SponsorContract['goals']; t: T }) {
  return (
    <>
      <p>{t('sp.detail.optional')}</p>
      {goals.map((g) => (
        <p key={g.type}>
          <span className="font-semibold text-navy">{t(`sp.goal.${g.type}`)}:</span> {t(GOALS[g.type].repeatable ? 'sp.detail.repeatable' : 'sp.detail.once')}{' '}
          {!GOALS[g.type].evaluable && t('sp.detail.notEvaluated')}
        </p>
      ))}
      <p>{t('sp.detail.add')}</p>
    </>
  );
}

export function ContractCard({ c, now, locale, t }: { c: SponsorContract; now: Date; locale: Locale; t: T }) {
  const left = weeksLeft(c.endsAt, now, c.durationWeeks);
  return (
    <SectionCard icon="crown" tone="tint" title={<span className="truncate">{c.companyName}</span>} action={<Badges isDemo={c.isDemo} kind={c.kind} t={t} />}>
      <div className="space-y-3 p-3.5">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
          <Field label={t('sp.field.signed')}>{fullDate(new Date(c.signedAt), locale)}</Field>
          <Field label={t('sp.field.ends')}>{fullDate(new Date(c.endsAt), locale)}</Field>
          <Field label={t('sp.field.remaining')}>{t('sp.weeks', { n: left })}</Field>
          <Field label={t('sp.field.income')}>
            <span className={c.weeklyIncomeCents === null ? 'text-navy-muted' : ''}>{moneyText(c.weeklyIncomeCents, locale, t)}</span>
          </Field>
        </dl>
        <Goals goals={c.goals} locale={locale} t={t} />
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-[8rem] flex-1"><Detail t={t}>
            <p>{t('sp.field.duration')}: <span className="font-semibold text-navy">{t('sp.weeks', { n: c.durationWeeks })}</span></p>
            <GoalNotes goals={c.goals} t={t} />
            <p>{t('sp.detail.severance')}{' '}
              <span className="font-semibold text-navy">{t('sp.detail.severanceNow')}: {c.weeklyIncomeCents === null ? t('sp.tbd') : moneyText(severanceCents(c.weeklyIncomeCents, left), locale, t)}</span>
            </p>
            <p>{t('sp.detail.cross')}</p>
          </Detail></div>
          {/* Early termination is switched on only after the sponsor economy is approved. */}
          <DisabledButton reason={t('sp.soon')}>{t('sp.btn.terminate')}</DisabledButton>
        </div>
        <p className="text-2xs text-navy-muted">{t('sp.soon')}</p>
      </div>
    </SectionCard>
  );
}

export function OfferCard({ o, now, locale, t, league, activeByKind, lastSignedCompanyId, economyEnabled }: {
  o: SponsorOffer; now: Date; locale: Locale; t: T; league: LeagueId;
  activeByKind: Record<SponsorKind, number>; lastSignedCompanyId: string | null; economyEnabled: boolean;
}) {
  const left = timeLeft(o.expiresAt, now);
  const block = signBlock({ offer: o, status: 'open', league, now, activeByKind, lastSignedCompanyId, economyEnabled });
  const full = slotsFull(league, o.kind, activeByKind);
  const reason =
    block === 'no_financial_terms' || block === 'economy_not_enabled' ? t('sp.block.money')
    : block === 'slots_full' ? t('sp.block.slots_full')
    : block === 'same_sponsor_twice' ? t('sp.block.same_sponsor')
    : block ? t('sp.block.other') : '';
  return (
    <SectionCard icon="crown" tone="tint" title={<span className="truncate">{o.companyName}</span>} action={<Badges isDemo={o.isDemo} kind={o.kind} t={t} />}>
      <div className="space-y-3 p-3.5">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Field label={t('sp.field.duration')}>{t('sp.weeks', { n: o.durationWeeks })}</Field>
          <Field label={t('sp.field.expires')}>{t('sp.expiresIn', { d: left.days, h: left.hours })}</Field>
          <div className="col-span-2"><Field label={t('sp.field.income')}>
            <span className={o.weeklyIncomeCents === null ? 'text-navy-muted' : ''}>{moneyText(o.weeklyIncomeCents, locale, t)}</span>
          </Field></div>
        </dl>
        <Goals goals={o.goals} locale={locale} t={t} />
        {full && <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">{t('sp.block.slots_full')}</p>}
        <Detail t={t}>
          <GoalNotes goals={o.goals} t={t} />
          <p>{t('sp.detail.severance')}</p>
          <p>{t('sp.detail.cross')}</p>
        </Detail>
        <div className="flex flex-wrap gap-2">
          {o.isDemo ? (
            <DisabledButton reason={t('sp.demo.badge')}>{t('sp.btn.reject')}</DisabledButton>
          ) : (
            <form action={rejectSponsorOfferAction}>
              <input type="hidden" name="offerId" value={o.id} />
              <PrimaryButton type="submit" variant="secondary">{t('sp.btn.reject')}</PrimaryButton>
            </form>
          )}
          <DisabledButton reason={reason || t('sp.soon')}>{t('sp.btn.accept')}</DisabledButton>
        </div>
        <p className="text-2xs text-navy-muted">{reason || t('sp.soon')}</p>
      </div>
    </SectionCard>
  );
}
