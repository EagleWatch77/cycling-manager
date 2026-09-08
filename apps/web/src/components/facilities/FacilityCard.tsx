'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { upgradeFacilityAction } from '@/app/facilities/actions';
import type { FacilityId, FacilityLevel } from '@/lib/facilities/config';

export interface FacilityCardLabels {
  levelLabel: string;
  currentEffect: string;
  nextEffect: string;
  levelTransition: string;
  priceLabel: string;
  priceProvisional: string;
  upgradeCta: string;
  maxLevel: string;
  confirmTitle: string;
  cancel: string;
  confirmUpgrade: string;
  upgrading: string;
  upgradeError: string;
  devOverrideBadge: string;
  storedLevelNote: string;
}

export interface FacilityCardProps {
  id: FacilityId;
  icon: string;
  image: string;
  name: string;
  /** One short sentence explaining what the building does — shown under the name. */
  description: string;
  /** Real, persisted progression — never erased by a league drop (see the chat report). */
  storedLevel: FacilityLevel;
  /** What actually applies right now — min(storedLevel, cap). Drives the segment bar and "current effect" text. */
  effectiveLevel: FacilityLevel;
  cap: FacilityLevel;
  currentEffectTitle: string;
  currentEffectSubtitle: string | null;
  nextEffectText: string | null;
  price: number | null;
  /** True only while the player's real league is Rookie (and no admin override applies) — shows the specific "unlocks in Amateur" message instead of a generic per-level lock reason. */
  rookieLocked: boolean;
  lockedReason: string | null;
  devOverrideActive: boolean;
  labels: FacilityCardLabels;
}

/**
 * One facility card — Zázemie UI redesign V2 (see the chat report):
 * compact "game card" instead of a real-estate catalogue tile. A small
 * fixed-height media area up top (never dominant), name + level segments,
 * one short sentence, ONE "current effect" box (no side-by-side next-level
 * spoiler table — that only appears in the upgrade confirm modal now), and
 * an upgrade CTA or lock state. All real validation happens server-side in
 * upgrade_facility() (see the chat report); this component only disables
 * the button while a request is in flight so a double-click can't fire the
 * action twice from the same click.
 */
export function FacilityCard({
  id, icon, image, name, description, storedLevel, effectiveLevel, cap,
  currentEffectTitle, currentEffectSubtitle, nextEffectText, price,
  rookieLocked, lockedReason, devOverrideActive, labels,
}: FacilityCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const atMax = storedLevel >= 5;
  const locked = rookieLocked || (!atMax && storedLevel >= cap);
  const canUpgrade = !atMax && !locked;
  const targetLevel = Math.min(5, storedLevel + 1);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await upgradeFacilityAction(id);
      if (result.ok) {
        setModalOpen(false);
      } else {
        setError(labels.upgradeError);
      }
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-card shadow-card">
      {/* Compact media area — small, fixed-height, object-contain so the
          transparent PNG is never cropped/stretched and every card reaches
          the same visual height regardless of each asset's own proportions.
          The image is identity, not the main content (see the chat report). */}
      <div className="relative flex h-16 shrink-0 items-end justify-center overflow-hidden bg-surface sm:h-20">
        <div className="relative h-full w-full">
          <Image src={image} alt="" fill sizes="(min-width: 1280px) 220px, (min-width: 640px) 33vw, 50vw" className="object-contain object-bottom" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
            <Icon name={icon} className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold leading-tight text-navy">{name}</p>
            <p className="text-2xs text-navy-muted">{labels.levelLabel} {effectiveLevel}/5</p>
          </div>
          {devOverrideActive && (
            <span className="shrink-0 rounded bg-warn/10 px-1 py-0.5 text-[9px] font-bold uppercase text-warn">{labels.devOverrideBadge}</span>
          )}
        </div>

        <div className="flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < effectiveLevel ? 'bg-teal' : 'bg-line'}`} />
          ))}
        </div>

        <p className="text-[11px] leading-snug text-navy-soft">{description}</p>

        {storedLevel !== effectiveLevel && (
          <p className="text-[10px] italic leading-snug text-navy-muted">
            {labels.storedLevelNote.replace('{stored}', String(storedLevel)).replace('{effective}', String(effectiveLevel))}
          </p>
        )}

        {/* ONE current-effect box — no next-level comparison on the card
            (see the chat report, item 12): upgrading keeps a little
            discovery, the full picture only shows in the confirm modal. */}
        <div className="rounded-lg bg-surface px-2.5 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-navy-muted">{labels.currentEffect}</p>
          <p className="mt-0.5 text-xs font-semibold leading-snug text-navy">{currentEffectTitle}</p>
          {currentEffectSubtitle && <p className="text-2xs text-navy-soft">{currentEffectSubtitle}</p>}
        </div>

        <div className="mt-auto pt-1">
          {rookieLocked ? (
            <span className="block rounded-lg bg-line py-1.5 text-center text-[11px] font-semibold text-navy-muted">🔒 {lockedReason}</span>
          ) : atMax ? (
            <span className="block rounded-lg bg-teal-light py-1.5 text-center text-[11px] font-bold uppercase text-teal-dark">{labels.maxLevel}</span>
          ) : locked ? (
            <>
              <span className="block cursor-not-allowed rounded-lg bg-line py-1.5 text-center text-[11px] font-semibold text-navy-muted" aria-disabled="true">
                {labels.upgradeCta}
              </span>
              {lockedReason && <p className="mt-1 text-[10px] leading-snug text-navy-soft">{lockedReason}</p>}
            </>
          ) : (
            <>
              {price != null && (
                <p className="mb-1 text-2xs text-navy-soft">{labels.priceLabel}: <span className="font-bold text-navy">{price.toLocaleString()} €</span></p>
              )}
              <button type="button" onClick={() => setModalOpen(true)}
                className="w-full rounded-lg bg-teal py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-teal-dark">
                {labels.upgradeCta}
              </button>
            </>
          )}
        </div>
      </div>

      {modalOpen && canUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => !pending && setModalOpen(false)}>
          <div className="w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-navy">{labels.confirmTitle}</p>
            <p className="mt-1 text-xs font-semibold text-teal-dark">{labels.levelTransition.replace('{from}', String(storedLevel)).replace('{to}', String(targetLevel))}</p>
            <div className="mt-3 space-y-1 text-xs text-navy-soft">
              <p><span className="font-semibold text-navy">{labels.currentEffect}:</span> {currentEffectTitle}{currentEffectSubtitle ? ` — ${currentEffectSubtitle}` : ''}</p>
              {nextEffectText && <p><span className="font-semibold text-navy">{labels.nextEffect}:</span> {nextEffectText}</p>}
              {price != null && <p><span className="font-semibold text-navy">{labels.priceLabel}:</span> {price.toLocaleString()} €</p>}
              <p className="italic">{labels.priceProvisional}</p>
            </div>
            {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={pending} onClick={() => setModalOpen(false)}
                className="flex-1 rounded-lg border border-line py-2 text-xs font-semibold text-navy-soft transition-colors hover:bg-surface disabled:opacity-50">
                {labels.cancel}
              </button>
              <button type="button" disabled={pending} onClick={confirm}
                className="flex-1 rounded-lg bg-teal py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-50">
                {pending ? labels.upgrading : labels.confirmUpgrade}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
