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
  /** One short sentence explaining what the building does — shown under the name, before the level segments. */
  description: string;
  /** Real, persisted progression — never erased by a league drop (see the chat report). */
  storedLevel: FacilityLevel;
  /** What actually applies right now — min(storedLevel, cap). Drives the segment bar and "current effect" text. */
  effectiveLevel: FacilityLevel;
  cap: FacilityLevel;
  currentEffectText: string;
  nextEffectText: string | null;
  price: number | null;
  /** True only while the player's real league is Rookie (and no admin override applies) — shows the specific "unlocks in Amateur" message instead of a generic per-level lock reason. */
  rookieLocked: boolean;
  lockedReason: string | null;
  devOverrideActive: boolean;
  labels: FacilityCardLabels;
}

/**
 * One facility card — a transparent building PNG as the dominant visual
 * (fixed-height media area so five differently-shaped PNGs never change
 * card height, per the request), level segments, current/next effect, and
 * an upgrade CTA or lock state. All real validation happens server-side in
 * upgrade_facility() (see the chat report); this component only disables
 * the button while a request is in flight so a double-click can't fire the
 * action twice from the same click.
 */
export function FacilityCard({
  id, icon, image, name, description, storedLevel, effectiveLevel, cap, currentEffectText, nextEffectText, price,
  rookieLocked, lockedReason, devOverrideActive, labels,
}: FacilityCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const atMax = storedLevel >= 5;
  const locked = rookieLocked || (!atMax && storedLevel >= cap);
  const canUpgrade = !atMax && !locked;

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
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-gradient-to-b from-white to-surface shadow-card">
      {/* Fixed media area — object-contain keeps the whole transparent
          building visible, never cropped, and never changes card height
          regardless of each PNG's own internal proportions. */}
      <div className="relative flex h-28 items-end justify-center overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 sm:h-32 lg:h-36">
        <div className="relative h-full w-full">
          <Image src={image} alt="" fill sizes="(min-width: 1024px) 300px, 50vw" className="object-contain object-bottom drop-shadow-sm" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-rail text-teal">
            <Icon name={icon} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-navy">{name}</p>
            <p className="text-2xs text-navy-muted">{labels.levelLabel} {effectiveLevel}/5</p>
          </div>
          {devOverrideActive && (
            <span className="shrink-0 rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-warn">{labels.devOverrideBadge}</span>
          )}
        </div>

        <p className="text-xs leading-snug text-navy-soft">{description}</p>

        <div className="flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < effectiveLevel ? 'bg-teal' : 'bg-line'}`} />
          ))}
        </div>

        {storedLevel !== effectiveLevel && (
          <p className="text-[11px] italic leading-snug text-navy-muted">
            {labels.storedLevelNote.replace('{stored}', String(storedLevel)).replace('{effective}', String(effectiveLevel))}
          </p>
        )}

        <div className="text-2xs text-navy-soft">
          <p><span className="font-semibold text-navy">{labels.currentEffect}:</span> {currentEffectText}</p>
          {nextEffectText && <p className="mt-0.5"><span className="font-semibold text-navy">{labels.nextEffect}:</span> {nextEffectText}</p>}
        </div>

        <div className="mt-auto pt-1.5">
          {rookieLocked ? (
            <span className="block rounded-lg bg-line py-2 text-center text-xs font-semibold text-navy-muted">🔒 {lockedReason}</span>
          ) : atMax ? (
            <span className="block rounded-lg bg-teal-light py-2 text-center text-xs font-bold uppercase text-teal-dark">{labels.maxLevel}</span>
          ) : locked ? (
            <>
              <span className="block cursor-not-allowed rounded-lg bg-line py-2 text-center text-xs font-semibold text-navy-muted" aria-disabled="true">
                {labels.upgradeCta}
              </span>
              {lockedReason && <p className="mt-1 text-[11px] leading-snug text-navy-soft">{lockedReason}</p>}
            </>
          ) : (
            <>
              {price != null && (
                <p className="mb-1.5 text-2xs text-navy-soft">{labels.priceLabel}: <span className="font-bold text-navy">{price.toLocaleString()} €</span></p>
              )}
              <button type="button" onClick={() => setModalOpen(true)}
                className="w-full rounded-lg bg-teal py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-dark">
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
            <div className="mt-3 space-y-1 text-xs text-navy-soft">
              <p><span className="font-semibold text-navy">{labels.currentEffect}:</span> {currentEffectText}</p>
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
