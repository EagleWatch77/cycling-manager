'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TrainingPlan, SaveTrainingResult } from '@/lib/training/repository';
import type { TrainingIntensity, WeekType } from '@/lib/training/config';
import type { SkillAttribute } from '@/lib/rider/config';
import { getSkillStatIcon } from '@/lib/rider/statIcons';
import { RiderStatIcon } from '@/components/rider/RiderStatIcon';

type FocusOption = { id: string; label: string };

/**
 * Custom listbox (not a native <select>) so the currently selected Focus,
 * and every option in the open list, can show its glossy /ride-icon —
 * native <option> elements cannot render images. Technical-focus options
 * simply have no dedicated icon yet, so RiderStatIcon renders its neutral
 * placeholder for them instead of an unrelated icon.
 */
function FocusSelect({ options, value, onChange }: {
  options: FocusOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-card px-3 py-2 text-left text-base font-semibold text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
        <RiderStatIcon src={selected ? getSkillStatIcon(selected.id as SkillAttribute) : null} alt="" size={32} />
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 text-navy-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-card p-1 shadow-lg">
          {options.map((o) => (
            <li key={o.id} role="option" aria-selected={o.id === value}>
              <button type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors ${
                  o.id === value ? 'bg-teal-rail text-navy' : 'text-navy-soft hover:bg-surface'
                }`}>
                <RiderStatIcon src={getSkillStatIcon(o.id as SkillAttribute)} alt="" size={26} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Training configuration + save flow. Mirrors the established pattern from
 * TourRegistrationButton: a server action is called imperatively (not via a
 * plain <form action>), so pending/error state is tracked locally and
 * router.refresh() runs after a successful save to sync the rest of the page
 * (e.g. the Technical-week counter) — an imperative call does not
 * auto-refresh the route the way a native form action does.
 *
 * Deliberately does NOT compute or show any predicted gain: the player picks
 * focus/intensity/week type, nothing more, per the game-design rule that the
 * exact outcome stays unknown until training is processed.
 */
export function TrainingConfigForm({
  seasonId, weekNumber, isRaceWeek, isCurrentWeek,
  initialPlan, performanceFocus, technicalFocus,
  technicalWeeksUsed, maxTechnicalWeeks,
  labels, saveAction,
}: {
  seasonId: string;
  weekNumber: number;
  isRaceWeek: boolean;
  isCurrentWeek: boolean;
  initialPlan: TrainingPlan | null;
  performanceFocus: FocusOption[];
  technicalFocus: FocusOption[];
  technicalWeeksUsed: number;
  maxTechnicalWeeks: number;
  labels: {
    heading: string;
    focusLabel: string;
    intensityLabel: string;
    weekTypeLabel: string;
    weekTypePerformance: string;
    weekTypeTechnical: string;
    intensityLight: string;
    intensityNormal: string;
    intensityHard: string;
    save: string;
    saveEdit: string;
    saving: string;
    edit: string;
    cancelEdit: string;
    savedTitle: string;
    savedWeekType: string;
    raceWeekLocked: string;
    technicalLimitReached: string;
    technicalWeeksUsedLabel: string;
    focusRequired: string;
    saveError: string;
    saveSuccess: string;
  };
  saveAction: (input: {
    seasonId: string; weekNumber: number; weekType: WeekType; focus: string; intensity: TrainingIntensity;
    isRaceWeek: boolean; isCurrentWeek: boolean;
  }) => Promise<SaveTrainingResult>;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [editing, setEditing] = useState(!initialPlan);
  const [weekType, setWeekType] = useState<WeekType>(initialPlan?.weekType ?? 'performance');
  const [focus, setFocus] = useState<string>(initialPlan?.focus ?? performanceFocus[0]?.id ?? '');
  const [intensity, setIntensity] = useState<TrainingIntensity>(initialPlan?.intensity ?? 'normal');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  if (isRaceWeek) {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-sm text-navy-soft">
        {labels.raceWeekLocked}
      </div>
    );
  }

  const focusOptions = weekType === 'performance' ? performanceFocus : technicalFocus;
  const technicalLocked = weekType === 'technical'
    && technicalWeeksUsed >= maxTechnicalWeeks
    && plan?.weekType !== 'technical';

  function switchWeekType(next: WeekType) {
    setWeekType(next);
    const opts = next === 'performance' ? performanceFocus : technicalFocus;
    if (!opts.some((o) => o.id === focus)) setFocus(opts[0]?.id ?? '');
  }

  function handleSave() {
    // submittingRef closes the gap between a click and React re-rendering the
    // button as disabled=true — pending only flips once startTransition's
    // callback actually starts, so a fast double-click could otherwise fire
    // the server action twice before that happens.
    if (submittingRef.current || pending || technicalLocked || !focus) return;
    submittingRef.current = true;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        const result = await saveAction({
          seasonId, weekNumber, weekType, focus, intensity, isRaceWeek, isCurrentWeek,
        });
        if (result.ok) {
          setPlan(result.plan);
          setEditing(false);
          setSuccess(true);
          router.refresh();
        } else if (result.reason === 'technical-limit') {
          setError(labels.technicalLimitReached);
        } else if (result.reason === 'locked' || result.reason === 'race-week') {
          setError(labels.raceWeekLocked);
        } else if (result.reason === 'invalid-focus') {
          setError(labels.focusRequired);
        } else {
          setError(labels.saveError);
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  if (plan && !editing) {
    const focusLabel = (plan.weekType === 'performance' ? performanceFocus : technicalFocus)
      .find((o) => o.id === plan.focus)?.label ?? plan.focus;
    const intensityLabel = plan.intensity === 'light' ? labels.intensityLight
      : plan.intensity === 'hard' ? labels.intensityHard : labels.intensityNormal;

    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-dark">{labels.heading}</p>
        <div className="rounded-lg border border-teal/30 bg-teal-rail p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-dark">{labels.savedTitle}</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold text-navy">
            <RiderStatIcon src={getSkillStatIcon(plan.focus as SkillAttribute)} alt="" size={32} />
            {focusLabel}
          </p>
          <p className="text-sm text-navy-soft">
            {intensityLabel} · {plan.weekType === 'technical' ? labels.savedWeekType : labels.weekTypePerformance}
          </p>
        </div>
        {isCurrentWeek && (
          <button type="button" onClick={() => setEditing(true)}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-navy-soft transition-colors hover:bg-teal-rail hover:text-navy">
            {labels.edit}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-dark">{labels.heading}</p>

      {/* Week type */}
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-navy-muted">{labels.weekTypeLabel}</span>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => switchWeekType('performance')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              weekType === 'performance' ? 'bg-teal text-white' : 'bg-surface text-navy-soft hover:bg-teal-rail'
            }`}>
            {labels.weekTypePerformance}
          </button>
          <button type="button" onClick={() => switchWeekType('technical')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              weekType === 'technical' ? 'bg-teal text-white' : 'bg-surface text-navy-soft hover:bg-teal-rail'
            }`}>
            {labels.weekTypeTechnical}
          </button>
        </div>
        {weekType === 'technical' && (
          <p className="mt-1.5 text-sm text-navy-muted">
            {labels.technicalWeeksUsedLabel}: {technicalWeeksUsed} / {maxTechnicalWeeks}
          </p>
        )}
      </div>

      {/* Focus */}
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-navy-muted">{labels.focusLabel}</span>
        <FocusSelect options={focusOptions} value={focus} onChange={setFocus} />
      </div>

      {/* Intensity */}
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-navy-muted">{labels.intensityLabel}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['light', labels.intensityLight],
            ['normal', labels.intensityNormal],
            ['hard', labels.intensityHard],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setIntensity(value)}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
                intensity === value ? 'bg-navy text-white' : 'bg-surface text-navy-soft hover:bg-teal-rail'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {technicalLocked && (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-2.5 py-1.5 text-sm text-warn">
          {labels.technicalLimitReached}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-sm text-danger">
          {error}
        </p>
      )}
      {success && !error && (
        <p role="status" className="rounded-lg border border-teal/30 bg-teal-rail px-2.5 py-1.5 text-sm text-teal-dark">
          {labels.saveSuccess}
        </p>
      )}

      <div className="flex gap-2">
        {plan && (
          <button type="button" onClick={() => setEditing(false)} disabled={pending}
            className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-navy-soft transition-colors hover:bg-teal-rail disabled:opacity-60">
            {labels.cancelEdit}
          </button>
        )}
        <button type="button" onClick={handleSave} disabled={pending || technicalLocked || !focus} aria-busy={pending}
          className="flex-1 rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-70">
          {pending ? labels.saving : plan ? labels.saveEdit : labels.save}
        </button>
      </div>
    </div>
  );
}
