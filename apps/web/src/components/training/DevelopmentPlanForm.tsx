'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SaveDevelopmentPlanResult } from '@/lib/training/developmentPlan';
import type { TrainingMode } from '@/lib/training/development/config';
import { isPlanFormLocked } from '@/lib/training/activeWeek';

export interface PlanOption { id: number; name: string; main: string[]; supplementary: string[] }

/** Session days: Po=0 … Ne=6. Full = Tue/Thu/Sat, Basic = Tue/Fri (12:00 UTC) — presentational mirror of the database (rst_session_days). */
const SESSION_DAYS: Record<TrainingMode, readonly number[]> = { full: [1, 3, 5], basic: [1, 4] };

const CONTROL = 'rounded-lg px-3 py-2 text-sm font-semibold transition-colors';
const ON = 'bg-teal text-white';
const OFF = 'bg-surface text-navy-soft hover:bg-teal-rail';

export interface DevelopmentPlanLabels {
  intro: string; main: string; supplementary: string; mode: string; modeFull: string; modeBasic: string; modeFullHint: string; modeBasicHint: string;
  sessionsAt: string; deadline: string; save: string; saving: string; saved: string; savedPlan: string; preselected: string; noPlan: string; locked: string;
  blockedRaceWeek: string; blockedTour: string; blockedCalendar: string; errors: Record<string, string>;
}

export function DevelopmentPlanForm(props: {
  plans: PlanOption[]; dayLabels: readonly string[]; weekLabel: string;
  saved: { planId: number; mode: TrainingMode; applied: boolean } | null;
  preselect: { planId: number; mode: TrainingMode } | null;
  blocked: 'race-week' | 'tour-conflict' | 'calendar' | null;
  labels: DevelopmentPlanLabels;
  saveAction: (i: { planId: number; mode: TrainingMode }) => Promise<SaveDevelopmentPlanResult>;
}) {
  const { plans, dayLabels, labels: L } = props;
  const start = props.saved ?? props.preselect ?? { planId: 6, mode: 'basic' as TrainingMode };
  const [planId, setPlanId] = useState(start.planId);
  const [mode, setMode] = useState<TrainingMode>(start.mode);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const locked = isPlanFormLocked(props.saved, props.blocked);
  const dirty = props.saved == null || props.saved.planId !== planId || props.saved.mode !== mode;

  const submit = () => {
    setError(null); setDone(false);
    startTransition(async () => {
      const res = await props.saveAction({ planId, mode });
      if (res.ok) { setDone(true); router.refresh(); } else setError(L.errors[res.reason] ?? L.errors.error);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-soft">{L.intro}</p>
      {props.blocked && <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm font-medium text-warn">{props.blocked === 'race-week' ? L.blockedRaceWeek : props.blocked === 'calendar' ? L.blockedCalendar : L.blockedTour}</p>}
      {!props.saved && !props.blocked && <p className="text-xs text-navy-muted">{props.preselect ? L.preselected : L.noPlan}</p>}
      {props.saved && <p className="text-xs font-semibold text-teal-dark">{L.savedPlan}: {plans[props.saved.planId]?.name} · {props.saved.mode === 'full' ? L.modeFull : L.modeBasic}</p>}

      <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {plans.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={planId === p.id} disabled={locked || pending} onClick={() => setPlanId(p.id)}
            className={`rounded-lg border p-3 text-left transition-colors ${planId === p.id ? 'border-teal bg-teal-rail' : 'border-line bg-card hover:bg-surface'} ${locked ? 'opacity-60' : ''}`}>
            <span className="block text-sm font-bold text-navy">{p.name}</span>
            <span className="mt-1 block text-2xs text-navy-muted"><b>{L.main}:</b> {p.main.join(', ')}</span>
            <span className="block text-2xs text-navy-muted"><b>{L.supplementary}:</b> {p.supplementary.join(', ')}</span>
          </button>
        ))}
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold text-navy-muted">{L.mode}</span>
        <div className="flex flex-wrap gap-2">
          {(['full', 'basic'] as const).map((m) => (
            <button key={m} type="button" disabled={locked || pending} onClick={() => setMode(m)} className={`${CONTROL} ${mode === m ? ON : OFF}`}>
              {m === 'full' ? L.modeFull : L.modeBasic}
            </button>
          ))}
        </div>
        <p className="mt-1 text-2xs text-navy-muted">{mode === 'full' ? L.modeFullHint : L.modeBasicHint}</p>
      </div>

      <div>
        <span className="mb-1 block text-2xs text-navy-muted">{L.sessionsAt}</span>
        <div className="grid grid-cols-7 gap-1 text-center">
          {dayLabels.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-2xs font-semibold uppercase text-navy-muted">{d}</span>
              <span className={`flex h-6 w-full items-center justify-center rounded text-2xs font-bold ${SESSION_DAYS[mode].includes(i) ? 'bg-teal text-white' : 'bg-surface text-navy-muted'}`}>
                {SESSION_DAYS[mode].includes(i) ? 'T' : 'R'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-2xs text-navy-muted">{props.weekLabel} · {L.deadline}</p>
      {props.saved?.applied && <p className="text-xs text-navy-muted">{L.locked}</p>}
      {error && <p role="alert" className="text-sm font-medium text-warn">{error}</p>}
      {done && !error && <p className="text-sm font-medium text-teal-dark">{L.saved}</p>}
      <button type="button" onClick={submit} disabled={locked || pending || !dirty} className={`${CONTROL} ${ON} disabled:opacity-50`}>
        {pending ? L.saving : L.save}
      </button>
    </div>
  );
}
