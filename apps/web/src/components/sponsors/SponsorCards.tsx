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

function DisabledSecondary({ children, reason }: { children: ReactNode; reason: string }) {
  return (
    <button type="button" disabled aria-disabled="true" title={reason}
      className="inline-flex min-h-[2.5rem] w-full cursor-not-allowed items-center justify-center rounded-lg border border-line bg-card px-4 py-2 text-sm font-semibold text-navy opacity-50">
      {children}
    </button>
  );
}

/**
 * Compact market card (redesign 2026-11-22): name, contract-length chip, BOTH goals visible, validity, Detail + Odmietnuť.
 * The sponsor type is NOT repeated (the page section says it). Money, signing and its lock live inside Detail, so the card stays short.
 * Signing remains blocked by signBlock() and by the database — only its place in the layout changed.
 */
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
  const labels = [t('sp.goal.easy'), t('sp.goal.hard')];
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-card p-3.5 shadow-card">
      <header className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-bold leading-snug text-navy">{o.companyName}</h3>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {o.isDemo && <StatusBadge label={t('sp.demo.badge')} tone="warn" />}
          <span className="whitespace-nowrap rounded-full bg-teal-rail px-2.5 py-0.5 text-xs font-semibold text-teal-dark">{t('sp.weeksLong', { n: o.durationWeeks })}</span>
        </span>
      </header>
      <div className="space-y-2">
        {o.goals.map((g, i) => (
          <div key={g.type} className={`border-l-[3px] pl-2.5 ${i === 0 ? 'border-teal/40' : 'border-teal'}`}>
            <p className="text-xs text-navy-soft">{labels[i]}</p>
            <p className="text-sm font-semibold leading-snug text-navy">{t(`sp.goal.${g.type}`)}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-navy-soft">
        {t('sp.field.expiresOn')}: <span className="font-semibold text-navy">{fullDate(new Date(o.expiresAt), locale)}</span> · {t('sp.expiresIn', { d: left.days, h: left.hours })}
      </p>
      <div className="mt-auto grid grid-cols-2 items-start gap-2">
        <details className="group open:col-span-2">
          <summary className="inline-flex min-h-[2.5rem] w-full cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-card px-4 py-2 text-sm font-semibold text-navy transition-colors hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal [&::-webkit-details-marker]:hidden">
            {t('sp.btn.detail')}
          </summary>
          <div className="mt-2 space-y-2 rounded-lg bg-teal-rail p-3 text-xs text-navy-soft">
            <p>{t('sp.field.duration')}: <span className="font-semibold text-navy">{t('sp.weeks', { n: o.durationWeeks })}</span></p>
            <p>{t('sp.field.income')}: <span className="font-semibold text-navy">{moneyText(o.weeklyIncomeCents, locale, t)}</span></p>
            {o.goals.map((g, i) => (
              <p key={g.type}>{labels[i]} — {t(`sp.goal.${g.type}`)}, {t('sp.bonus')}: <span className="font-semibold text-navy">{moneyText(g.bonusCents, locale, t)}</span></p>
            ))}
            <GoalNotes goals={o.goals} t={t} />
            <p>{t('sp.detail.severance')}</p>
            <p>{t('sp.detail.cross')}</p>
            {full && <p className="rounded-lg bg-warn/10 px-2.5 py-1.5 text-warn">{t('sp.block.slots_full')}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <DisabledButton reason={reason || t('sp.soon')}>{t('sp.btn.accept')}</DisabledButton>
              <span>{reason || t('sp.soon')}</span>
            </div>
          </div>
        </details>
        {o.isDemo ? (
          <DisabledSecondary reason={t('sp.demo.badge')}>{t('sp.btn.reject')}</DisabledSecondary>
        ) : (
          <form action={rejectSponsorOfferAction}>
            <input type="hidden" name="offerId" value={o.id} />
            <PrimaryButton type="submit" variant="secondary" className="min-h-[2.5rem] w-full">{t('sp.btn.reject')}</PrimaryButton>
          </form>
        )}
      </div>
    </article>
  );
}
