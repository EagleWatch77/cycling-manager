'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TrainingPlan, SaveTrainingResult } from '@/lib/training/repository';
import type { TrainingIntensity, WeekType } from '@/lib/training/config';
import type { ReadinessLabel } from '@/lib/training/readiness';
import type { SkillAttribute } from '@/lib/rider/config';
import { getSkillStatIcon } from '@/lib/rider/statIcons';
import { RiderStatIcon } from '@/components/rider/RiderStatIcon';

type FocusOption = { id: string; label: string };

/** One shared look for every control on the planner: same radius, padding and font size. Active = main teal, inactive = light and quiet. */
const CONTROL = 'rounded-lg px-3 py-2 text-sm font-semibold transition-colors';
const CONTROL_ON = 'bg-teal text-white';
const CONTROL_OFF = 'bg-surface text-navy-soft hover:bg-teal-rail';
const FIELD_LABEL = 'mb-1.5 block text-xs font-semibold text-navy-muted';

/** Po Ut St Št Pi So Ne = index 0-6. Which of those 7 are training days, by plan type/intensity — purely presentational (see the chat report, items 21-22). */
const PERFORMANCE_TRAIN_DAYS: Record<TrainingIntensity, readonly number[]> = {
  light: [1],
  normal: [1, 3],
  hard: [1, 3, 5],
};
const TECHNICAL_TRAIN_DAYS: readonly number[] = [1];

function WeeklyStrip({ trainDays, dayLabels }: { trainDays: readonly number[]; dayLabels: readonly string[] }) {
  return (
    <div className="grid grid-cols-7 gap-1 text-center">
      {dayLabels.map((label, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold uppercase text-navy-muted">{label}</span>
          <span className={`flex h-6 w-full items-center justify-center rounded text-2xs font-bold ${
            trainDays.includes(i) ? 'bg-teal text-white' : 'bg-surface text-navy-muted'
          }`}>
            {trainDays.includes(i) ? 'T' : 'R'}
          </span>
        </div>
      ))}
    </div>
  );
}

const READINESS_COLOR: Record<ReadinessLabel, string> = {
  excellent: 'text-green-600',
  good: 'text-teal-dark',
  reduced: 'text-warn',
  poor: 'text-danger',
  veryPoor: 'text-danger',
};

/**
 * Custom listbox (not a native <select>) so the currently selected Focus,
 * and every option in the open list, can show its glossy /ride-icon —
 * native <option> elements cannot render images.
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
        className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-card px-3 py-1.5 text-left text-sm font-semibold text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
        <RiderStatIcon src={selected ? getSkillStatIcon(selected.id as SkillAttribute) : null} alt="" size={28} />
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
 * Unified Weekly Training V1 config for the one week that's ever plannable
 * (always `weekNumber` = current week + 1 — the caller, training/page.tsx,
 * is the single source of truth for that). See the chat report — a rider
 * has exactly ONE plan per week, of exactly one of two types:
 *   - Performance: focus (7 options) + intensity (Light/Normal/Hard, which
 *     picks a session count, not a growth multiplier).
 *   - Technical: focus (6 Technique options) only — no intensity choice,
 *     always exactly 1 session/week.
 * Tactics is never trainable directly by either type (grows only through a
 * future race-situations system).
 *
 * There is no edit and no cancel: once `saveAction` succeeds, the plan is
 * permanent until the training engine processes it
 * (lib/training/engine.ts) — the component has exactly two states, set
 * (`plan`) or not (form), never a third "editing" state.
 *
 * Condition (Energy/Fatigue/Readiness) is shown in BOTH states — real
 * current numbers, never a fabricated predicted gain (item 23): this page
 * never shows "+2 Climbing" before a plan is processed, only after, via the
 * real persisted primaryGain/secondaryGain (see training/page.tsx's
 * `bonuses`).
 *
 * `initialPlan` comes from a fresh server read on every page load, so a
 * confirmed plan survives a reload correctly — this never relies on
 * client-only state to remember that a plan was saved.
 */
export function TrainingConfigForm({
  weekNumber, totalWeeks,
  initialPlan, performanceFocus, technicalFocus,
  condition, readinessLabel,
  labels, dayLabels, saveAction,
}: {
  weekNumber: number;
  totalWeeks: number;
  initialPlan: TrainingPlan | null;
  performanceFocus: FocusOption[];
  technicalFocus: FocusOption[];
  condition: { energy: number; fatigue: number };
  readinessLabel: ReadinessLabel;
  dayLabels: readonly string[];
  labels: {
    forWeek: string;
    confirmedTitle: string;
    statusLabel: string;
    statusPlanned: string;
    typePerformance: string;
    typeTechnical: string;
    focusLabel: string;
    intensityLabel: string;
    intensityLight: string;
    intensityNormal: string;
    intensityHard: string;
    technicalSessionNote: string;
    energyLabel: string;
    fatigueLabel: string;
    readinessLabel: string;
    readiness: Record<ReadinessLabel, string>;
    save: string;
    saving: string;
    focusRequired: string;
    saveError: string;
  };
  saveAction: (input: {
    weekType: WeekType; focus: string; intensity: TrainingIntensity;
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

  function handleTypeChange(next: WeekType) {
    setWeekType(next);
    setFocus(next === 'performance' ? (performanceFocus[0]?.id ?? '') : (technicalFocus[0]?.id ?? ''));
  }

  function handleSave() {
    // submittingRef closes the gap between a click and React re-rendering the
    // button as disabled=true — pending only flips once startTransition's
    // callback actually starts, so a fast double-click could otherwise fire
    // the server action twice before that happens.
    if (submittingRef.current || pending || !focus) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveAction({ weekType, focus, intensity });
        if (result.ok) {
          setPlan(result.plan);
          router.refresh();
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

  const conditionSummary = (
    <div className="grid grid-cols-3 gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-center">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{labels.energyLabel}</p>
        <p className="mt-0.5 text-base font-bold tabular-nums text-navy">{condition.energy}</p>
      </div>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{labels.fatigueLabel}</p>
        <p className="mt-0.5 text-base font-bold tabular-nums text-navy">{condition.fatigue}</p>
      </div>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{labels.readinessLabel}</p>
        <p className={`mt-0.5 text-sm font-bold ${READINESS_COLOR[readinessLabel]}`}>{labels.readiness[readinessLabel]}</p>
      </div>
    </div>
  );

  if (plan) {
    const isTechnical = plan.weekType === 'technical';
    const options = isTechnical ? technicalFocus : performanceFocus;
    const focusLabel = options.find((o) => o.id === plan.focus)?.label ?? plan.focus;
    const intensityLabel = plan.intensity === 'light' ? labels.intensityLight
      : plan.intensity === 'hard' ? labels.intensityHard : labels.intensityNormal;
    const trainDays = isTechnical ? TECHNICAL_TRAIN_DAYS : PERFORMANCE_TRAIN_DAYS[plan.intensity];

    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-navy">{labels.confirmedTitle}</p>
        <div className="rounded-lg border border-teal/30 bg-teal-rail p-4">
          <p className="flex items-center gap-2 text-base font-bold text-navy">
            <RiderStatIcon src={getSkillStatIcon(plan.focus as SkillAttribute)} alt="" size={32} />
            {focusLabel}
          </p>
          <p className="mt-2 text-xs leading-snug text-navy-soft">{labels.forWeek} {weekNumber} / {totalWeeks}</p>
          <p className="text-xs leading-snug text-navy-soft">{isTechnical ? labels.typeTechnical : `${labels.typePerformance} · ${intensityLabel}`}</p>
          <p className="mt-3 flex items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wide text-navy-muted">{labels.statusLabel}</span>
            <span className="rounded bg-teal px-2 py-0.5 text-2xs font-bold uppercase text-white">{labels.statusPlanned}</span>
          </p>
          <div className="mt-3">
            <WeeklyStrip trainDays={trainDays} dayLabels={dayLabels} />
          </div>
        </div>
        {conditionSummary}
      </div>
    );
  }

  const currentOptions = weekType === 'performance' ? performanceFocus : technicalFocus;
  const trainDays = weekType === 'performance' ? PERFORMANCE_TRAIN_DAYS[intensity] : TECHNICAL_TRAIN_DAYS;

  return (
    <div className="space-y-4">
     {/* two columns on desktop (choices | week + condition), one column on mobile */}
     <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
      <div className="space-y-4">
      {/* Type selector */}
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => handleTypeChange('performance')} aria-pressed={weekType === 'performance'}
          className={`${CONTROL} ${weekType === 'performance' ? CONTROL_ON : CONTROL_OFF}`}>
          {labels.typePerformance}
        </button>
        <button type="button" onClick={() => handleTypeChange('technical')} aria-pressed={weekType === 'technical'}
          className={`${CONTROL} ${weekType === 'technical' ? CONTROL_ON : CONTROL_OFF}`}>
          {labels.typeTechnical}
        </button>
      </div>

      {/* Focus */}
      <div>
        <span className={FIELD_LABEL}>{labels.focusLabel}</span>
        <FocusSelect options={currentOptions} value={focus} onChange={setFocus} />
      </div>

      {/* Intensity — Performance only */}
      {weekType === 'performance' ? (
        <div>
          <span className={FIELD_LABEL}>{labels.intensityLabel}</span>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ['light', labels.intensityLight],
              ['normal', labels.intensityNormal],
              ['hard', labels.intensityHard],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setIntensity(value)} aria-pressed={intensity === value}
                className={`${CONTROL} ${intensity === value ? CONTROL_ON : CONTROL_OFF}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-surface px-3 py-2 text-xs leading-snug text-navy-soft">{labels.technicalSessionNote}</p>
      )}

      </div>

      <div className="space-y-4">
        <WeeklyStrip trainDays={trainDays} dayLabels={dayLabels} />
        {conditionSummary}
      </div>
     </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-sm text-danger">
          {error}
        </p>
      )}

      <button type="button" onClick={handleSave} disabled={pending || !focus} aria-busy={pending}
        className="w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-70">
        {pending ? labels.saving : labels.save}
      </button>
    </div>
  );
}
