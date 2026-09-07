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
 * Training configuration for the one week that's ever plannable (always
 * `weekNumber` = current week + 1 — the caller, training/page.tsx, is the
 * single source of truth for that). There is no edit and no cancel: once
 * `saveAction` succeeds, the plan is permanent until the training engine
 * processes it (lib/training/engine.ts) — the component has exactly two
 * states, set (`plan`) or not (form), never a third "editing" state.
 *
 * `initialPlan` comes from a fresh server read on every page load, so a
 * confirmed plan survives a reload correctly — this never relies on
 * client-only state to remember that a plan was saved.
 */
export function TrainingConfigForm({
  seasonId, weekNumber, totalWeeks,
  initialPlan, performanceFocus, technicalFocus,
  technicalWeeksUsed, maxTechnicalWeeks,
  labels, saveAction,
}: {
  seasonId: string;
  weekNumber: number;
  totalWeeks: number;
  initialPlan: TrainingPlan | null;
  performanceFocus: FocusOption[];
  technicalFocus: FocusOption[];
  technicalWeeksUsed: number;
  maxTechnicalWeeks: number;
  labels: {
    forWeek: string;
    confirmedTitle: string;
    statusLabel: string;
    statusPlanned: string;
    focusLabel: string;
    intensityLabel: string;
    weekTypeLabel: string;
    weekTypePerformance: string;
    weekTypeTechnical: string;
    intensityLight: string;
    intensityNormal: string;
    intensityHard: string;
    save: string;
    saving: string;
    technicalLimitReached: string;
    technicalWeeksUsedLabel: string;
    focusRequired: string;
    saveError: string;
  };
  saveAction: (input: {
    seasonId: string; weekNumber: number; weekType: WeekType; focus: string; intensity: TrainingIntensity;
  }) => Promise<SaveTrainingResult>;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [weekType, setWeekType] = useState<WeekType>('performance');
  const [focus, setFocus] = useState<string>(performanceFocus[0]?.id ?? '');
  const [intensity, setIntensity] = useState<TrainingIntensity>('normal');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  const focusOptions = weekType === 'performance' ? performanceFocus : technicalFocus;
  const technicalLocked = weekType === 'technical' && technicalWeeksUsed >= maxTechnicalWeeks;

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
    startTransition(async () => {
      try {
        const result = await saveAction({ seasonId, weekNumber, weekType, focus, intensity });
        if (result.ok) {
          setPlan(result.plan);
          router.refresh();
        } else if (result.reason === 'technical-limit') {
          setError(labels.technicalLimitReached);
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

  if (plan) {
    const focusLabel = (plan.weekType === 'performance' ? performanceFocus : technicalFocus)
      .find((o) => o.id === plan.focus)?.label ?? plan.focus;
    const intensityLabel = plan.intensity === 'light' ? labels.intensityLight
      : plan.intensity === 'hard' ? labels.intensityHard : labels.intensityNormal;
    const weekTypeLabel = plan.weekType === 'technical' ? labels.weekTypeTechnical : labels.weekTypePerformance;

    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-dark">{labels.confirmedTitle}</p>
        <div className="rounded-lg border border-teal/30 bg-teal-rail p-4">
          <p className="flex items-center gap-2 text-lg font-bold text-navy">
            <RiderStatIcon src={getSkillStatIcon(plan.focus as SkillAttribute)} alt="" size={32} />
            {focusLabel}
          </p>
          <p className="mt-2 text-sm text-navy-soft">{labels.forWeek} {weekNumber} / {totalWeeks}</p>
          <p className="text-sm text-navy-soft">{intensityLabel} · {weekTypeLabel}</p>
          <p className="mt-3 flex items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{labels.statusLabel}</span>
            <span className="rounded bg-teal px-2 py-0.5 text-2xs font-bold uppercase text-white">{labels.statusPlanned}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-dark">{labels.forWeek} {weekNumber} / {totalWeeks}</p>

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

      <button type="button" onClick={handleSave} disabled={pending || technicalLocked || !focus} aria-busy={pending}
        className="w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-70">
        {pending ? labels.saving : labels.save}
      </button>
    </div>
  );
}
